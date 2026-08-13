#!/usr/bin/env node
/**
 * SEO Audit Pro - Core Web Vitals Speed Tool
 * A GTmetrix-style performance auditor built on Lighthouse.
 * Reads the unified config.json, tests sampled pages from the sitemap
 * (or a single URL), and writes a raw JSON report for the merge step.
 *
 * Run: node speed/seo-speed-audit.js --config config.json [--url URL] [--output path]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- CLI argument parsing ----------
const args = process.argv.slice(2);
function argValue(name, longHasValue) {
  const idx = args.indexOf(name);
  if (idx === -1) {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.split("=").slice(1).join("=") : null;
  }
  return longHasValue && args[idx + 1] ? args[idx + 1] : null;
}

const configPath = argValue("--config", true) || path.join(__dirname, "..", "..", "config.json");
const singleUrlArg = args.find((a) => a.startsWith("--url=")) || (args.includes("--url") ? args[args.indexOf("--url") + 1] : null);
const outputArg = argValue("--output", true);
const deviceArg = argValue("--device", true);
const auditModeArg = argValue("--audit", true);

// ---------- Config loading ----------
function loadConfig() {
  const raw = fs.readFileSync(configPath, "utf-8");
  const cfg = JSON.parse(raw);
  // Flatten site + speed sections into an ease-of-use config shape
  return {
    ...(cfg.speed || {}),
    chromeFlags: cfg.speed?.chromeFlags || [],
    baseUrl: cfg.site?.baseUrl,
    sitemapUrl: cfg.site?.sitemapUrl || (cfg.site?.baseUrl ? cfg.site.baseUrl.replace(/\/$/, "") + "/sitemap.xml" : null),
    outputDir: cfg.report?.outputDir || "./reports",
  };
}

// ---------- Fetching ----------
async function fetchWithClient(targetUrl, timeoutMs = 15000, redirectCount = 0, maxRedirects = 5) {
  const { default: httpsMod } = await import("https");
  const { default: httpMod } = await import("http");
  const client = targetUrl.startsWith("https") ? httpsMod : targetUrl.startsWith("http") ? httpMod : null;
  if (!client) return Promise.reject(new Error(`Unsupported protocol for ${targetUrl}`));
  return new Promise((resolve, reject) => {
    const req = client.get(targetUrl, { headers: { "User-Agent": "Mozilla/5.0 (SEO Audit Pro/1.0)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= maxRedirects) {
          return reject(new Error(`Too many redirects (${maxRedirects}) for ${targetUrl}`));
        }
        return fetchWithClient(res.headers.location, timeoutMs, redirectCount + 1, maxRedirects).then(resolve, reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms waiting for ${targetUrl}`)));
  });
}

async function fetchUrlWithRetry(targetUrl, timeoutMs, retries, maxRedirects = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchWithClient(targetUrl, timeoutMs, 0, maxRedirects);
    } catch (err) {
      lastErr = err;
      console.warn(`  Warning attempt ${attempt}/${retries} failed for ${targetUrl}: ${err.message}`);
      if (attempt < retries) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

function extractLocs(xml) {
  const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
  return matches.map((m) => m.replace(/<\/?loc>/g, "").trim());
}

async function getAllUrlsFromSitemap(sitemapUrl, sitemapTimeoutMs, retries, seen = new Set()) {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);
  console.log(`  Reading: ${sitemapUrl}`);
  let xml;
  try {
    xml = await fetchUrlWithRetry(sitemapUrl, sitemapTimeoutMs, retries);
  } catch (err) {
    console.warn(`  Warning: could not fetch sitemap ${sitemapUrl} (${err.message})`);
    return [];
  }
  const locs = extractLocs(xml);
  if (xml.includes("<sitemapindex")) {
    let all = [];
    for (const loc of locs) {
      const childUrls = await getAllUrlsFromSitemap(loc, sitemapTimeoutMs, retries, seen);
      all = all.concat(childUrls);
    }
    return all;
  }
  return locs.map((u) => ({ url: u, sourceSitemap: sitemapUrl }));
}

function categoryFromSitemapFilename(sitemapUrl) {
  const file = sitemapUrl.split("/").pop() || "";
  const match = file.match(/^(.*?)[-_]sitemap\d*\.xml$/i);
  if (!match) return null;
  return match[1].replace(/_/g, "-").toLowerCase();
}

function categorizeUrl(targetUrl, patterns, fallbackCategory) {
  for (const { category, pattern } of patterns || []) {
    try {
      const re = new RegExp(pattern, "i");
      if (re.test(targetUrl)) return category;
    } catch (e) {
      // skip invalid patterns
    }
  }
  return fallbackCategory || "other";
}

function groupAndSample(urlEntries, config) {
  const groups = {};
  for (const { url: u, sourceSitemap } of urlEntries) {
    const fallback = sourceSitemap ? categoryFromSitemapFilename(sourceSitemap) : null;
    const cat = categorizeUrl(u, config.urlPatterns, fallback);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(u);
  }

  const selected = [];
  const meta = [];

  for (const [cat, list] of Object.entries(groups)) {
    const sampleSize = config.samplesPerCategory?.[cat] ?? config.samplesPerCategory?.other ?? 2;
    const sample = list.slice(0, Math.max(0, sampleSize));
    for (const u of sample) {
      selected.push(u);
      meta.push({ url: u, category: cat, totalInCategory: list.length });
    }
  }

  for (const u of config.alwaysInclude || []) {
    if (!selected.includes(u)) {
      selected.push(u);
      meta.push({ url: u, category: "pinned", totalInCategory: 1 });
    }
  }

  return { selected, meta, groups };
}

// ---------- Running Lighthouse ----------
async function runLighthouseOnUrl(targetUrl, config, chrome, lighthouse) {
  const categories = config.auditMode === "full"
    ? ["performance", "seo", "accessibility", "best-practices"]
    : ["performance"];

  const options = {
    port: chrome.port,
    output: "json",
    onlyCategories: categories,
    formFactor: config.formFactor || "mobile",
    screenEmulation: (config.formFactor || "mobile") === "mobile"
      ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625, disabled: false }
      : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: "simulate",
  };

  const timeoutMs = config.lighthouseTimeoutMs ?? 90000;
  const runnerResult = await Promise.race([
    lighthouse(targetUrl, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Lighthouse timed out after ${timeoutMs}ms on ${targetUrl}`)), timeoutMs)
    ),
  ]);
  const lhr = runnerResult.lhr;
  const audits = lhr.audits;
  const score = Math.round((lhr.categories.performance?.score || 0) * 100);

  const metric = (id) => audits[id]?.numericValue ?? null;
  const metricDisplay = (id) => audits[id]?.displayValue ?? "—";

  const opportunities = Object.values(audits)
    .filter((a) => a.details && a.details.type === "opportunity" && (a.numericValue || 0) > 0)
    .sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0))
    .slice(0, 8)
    .map((a) => ({
      title: a.title,
      description: a.description,
      savingsMs: a.details.overallSavingsMs ? Math.round(a.details.overallSavingsMs) : null,
    }));

  const diagnostics = Object.values(audits)
    .filter(
      (a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary"
        && !opportunities.find((o) => o.title === a.title)
    )
    .slice(0, 8)
    .map((a) => ({ title: a.title, description: a.description }));

  const result = {
    url: targetUrl,
    score,
    metrics: {
      fcp: metricDisplay("first-contentful-paint"),
      lcp: metricDisplay("largest-contentful-paint"),
      tbt: metricDisplay("total-blocking-time"),
      inp: metricDisplay("interaction-to-next-paint"),
      cls: metricDisplay("cumulative-layout-shift"),
      speedIndex: metricDisplay("speed-index"),
      ttfb: metricDisplay("server-response-time"),
    },
    rawMetrics: {
      lcpMs: metric("largest-contentful-paint"),
      tbtMs: metric("total-blocking-time"),
      inpMs: metric("interaction-to-next-paint"),
      cls: metric("cumulative-layout-shift"),
      ttfbMs: metric("server-response-time"),
    },
    pageSizeBytes: audits["total-byte-weight"]?.numericValue ?? null,
    requestCount: audits["network-requests"]?.details?.items?.length ?? null,
    opportunities,
    diagnostics,
  };

  if (config.auditMode === "full") {
    const catScore = (id) => (lhr.categories[id] ? Math.round(lhr.categories[id].score * 100) : null);
    result.categoryScores = {
      seo: catScore("seo"),
      accessibility: catScore("accessibility"),
      "best-practices": catScore("best-practices"),
    };
  }

  return result;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        console.error(`  Failed: ${items[idx].url} — ${err.message}`);
        results[idx] = { url: items[idx].url, error: err.message };
      }
    }
  }
  const runners = Array.from({ length: Math.min(limit || 1, items.length) }, next);
  await Promise.all(runners);
  return results;
}

// ---------- Report JSON output ----------
function writeJsonReport(data, outputPath) {
  const dir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`JSON report written to: ${outputPath}`);
}

// ---------- Dependency resolution ----------
// Resolve lighthouse / chrome-launcher from the most likely local install
// locations, falling back to the default ESM resolution. This lets the tool
// run on Windows without re-downloading heavy packages if a previous install
// (e.g. the bundled test-runner worker) already provides them.
import { createRequire } from "module";
const localRequire = createRequire(import.meta.url);

function resolveFromCandidates(pkg, candidates) {
  for (const dir of candidates) {
    try {
      const p = path.join(dir, "node_modules", pkg, "package.json");
      if (fs.existsSync(p)) return localRequire(path.join(dir, "node_modules", pkg));
    } catch {
      // try next
    }
  }
  return null;
}

function candidateDirs() {
  const dirs = [];
  // project root node_modules (own install)
  dirs.push(searchRoot);
  return dirs;
}

const searchRoot = path.join(__dirname, "..", "..");

// ---------- Main ----------
async function main() {
  const config = loadConfig();
  if (deviceArg) config.formFactor = deviceArg;
  if (auditModeArg) config.auditMode = auditModeArg;

  console.log("Loading Lighthouse modules...");
  let lighthouse;
  let chromeLauncher;
  try {
    const candidates = candidateDirs();
    const lhMod = resolveFromCandidates("lighthouse", candidates);
    const clMod = resolveFromCandidates("chrome-launcher", candidates);
    if (lhMod) lighthouse = lhMod.default || lhMod;
    if (clMod) chromeLauncher = clMod;
    if (!lighthouse || !chromeLauncher) {
      const mod = await import("lighthouse");
      lighthouse = mod.default;
      chromeLauncher = await import("chrome-launcher");
    }
  } catch (err) {
    console.error(`Failed to load Lighthouse. Check that lighthouse + chrome-launcher are installed (try "npm install"). ${err.message}`);
    process.exit(1);
  }

  const outputPath = outputArg || path.join(__dirname, "..", "..", "reports", "speed_results.json");

  // Single URL mode
  if (singleUrlArg) {
    console.log(`\n== Single URL mode: ${singleUrlArg} ==`);
    const chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", ...config.chromeFlags],
    });
    let result;
    try {
      result = await runLighthouseOnUrl(singleUrlArg, config, chrome, lighthouse);
      console.log(`  Score: ${result.score}`);
    } finally {
      try { await chrome.kill(); } catch (e) { /* ignore */ }
    }
    const report = {
      generated_at: new Date().toISOString(),
      site: { baseUrl: config.baseUrl, single_url: singleUrlArg },
      speed: { mode: config.auditMode, formFactor: config.formFactor, singleUrl: true },
      results: [result],
      meta: [{ url: singleUrlArg, category: "single-page", totalInCategory: 1 }],
    };
    writeJsonReport(report, outputPath);
    console.log("\nDone.");
    return;
  }

  if (!config.sitemapUrl) {
    console.error("No sitemap URL configured. Use --url for single page mode.");
    process.exit(1);
  }

  console.log(`\n== Step 1: Reading sitemap from ${config.sitemapUrl} ==`);
  const urlEntries = await getAllUrlsFromSitemap(config.sitemapUrl, 15000, 3);
  const seenUrls = new Map();
  for (const { url: u, sourceSitemap } of urlEntries) {
    if (!seenUrls.has(u)) seenUrls.set(u, sourceSitemap);
  }
  const allUrls = [...seenUrls.keys()];
  console.log(`Total URLs found: ${allUrls.length}`);

  if (allUrls.length === 0) {
    console.error("No URLs found in sitemap.");
    process.exit(1);
  }

  console.log("\n== Step 2: Categorizing and sampling ==");
  const { meta, groups } = groupAndSample(
    allUrls.map((u) => ({ url: u, sourceSitemap: seenUrls.get(u) })),
    config
  );
  for (const [cat, list] of Object.entries(groups)) {
    const sampleSize = config.samplesPerCategory?.[cat] ?? config.samplesPerCategory?.other ?? 2;
    console.log(`  Category "${cat}": ${list.length} pages found -> testing ${Math.min(sampleSize, list.length)} sample(s)`);
  }
  console.log(`Total pages that will actually be tested: ${meta.length}`);

  console.log("\n== Step 3: Running Lighthouse ==");
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", ...config.chromeFlags],
  });

  let completed = 0;
  const auditStartTime = Date.now();
  const lighthouseRetries = config.lighthouseRetries ?? 1;

  const results = await runWithConcurrency(meta, config.concurrency || 1, async (item) => {
    if (config.delayBetweenTestsMs) await sleep(config.delayBetweenTestsMs);
    const elapsed = (Date.now() - auditStartTime) / 1000;
    const avgPerTask = elapsed / (completed || 1);
    const remaining = Math.round(avgPerTask * (meta.length - completed));
    const eta = remaining > 60 ? `${Math.round(remaining / 60)}m ${remaining % 60}s` : `${remaining}s`;
    console.log(`  Testing (${++completed}/${meta.length}, ~${eta} left): ${item.url}`);

    let lastErr;
    for (let attempt = 1; attempt <= lighthouseRetries + 1; attempt++) {
      try {
        const r = await runLighthouseOnUrl(item.url, config, chrome, lighthouse);
        console.log(`    Score: ${r.score}`);
        return r;
      } catch (err) {
        lastErr = err;
        if (attempt <= lighthouseRetries) {
          console.warn(`  Attempt ${attempt}/${lighthouseRetries + 1} failed for ${item.url}: ${err.message} - retrying...`);
        }
      }
    }
    throw lastErr;
  });

  try {
    await chrome.kill();
  } catch (err) {
    console.warn(`  Could not fully clean up Chrome temp folder (harmless): ${err.message}`);
  }

  console.log("\n== Writing report ==");
  const report = {
    generated_at: new Date().toISOString(),
    site: { baseUrl: config.baseUrl, sitemapUrl: config.sitemapUrl },
    speed: { mode: config.auditMode, formFactor: config.formFactor, singleUrl: false },
    results,
    meta,
  };
  writeJsonReport(report, outputPath);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});