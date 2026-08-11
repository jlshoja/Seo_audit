#!/usr/bin/env node
/**
 * SEO Audit Pro - AI Judgment Analysis Prompt Generator
 * Option A (no API, no cost): reads the latest reports/raw-*.json plus the
 * site context from config.json and builds one structured prompt you can
 * paste into an LLM (or into the seo-audit skill) to get the judgment-based
 * SEO sections filled in:
 *   - E-E-A-T signals & content quality
 *   - Keyword targeting / cannibalization
 *   - International SEO strategy
 *   - Index status (requires Search Console data you add)
 *   - Prioritized 30-day action plan
 *
 * Run: node src/ai/analyze.js --config config.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");

const args = process.argv.slice(2);
function argValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1) {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.split("=").slice(1).join("=") : null;
  }
  return args[idx + 1] ? args[idx + 1] : null;
}

const configPath = argValue("--config") || path.join(rootDir, "config.json");
const reportsDir = path.join(rootDir, "reports");

// ---------- Load config ----------
function loadConfig(p) {
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    console.error(`Config not found: ${resolved}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch (err) {
    console.error(`Could not parse config ${resolved}: ${err.message}`);
    process.exit(1);
  }
}

// ---------- Find latest raw JSON ----------
function latestRawJson() {
  if (!fs.existsSync(reportsDir)) {
    console.error(`No reports/ folder found at ${reportsDir}. Run an audit first (mode 1/2/3).`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => /^raw-.+\.json$/.test(f))
    .map((f) => path.join(reportsDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) {
    console.error("No raw-*.json found in reports/. Run a full audit first (mode 1).");
    process.exit(1);
  }
  return files[0];
}

// ---------- Helpers ----------
function esc(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function topN(list, n) {
  const order = { High: 0, high: 0, Medium: 1, medium: 1, Low: 2, low: 2 };
  return [...list]
    .sort((a, b) => (order[a.name] ?? 1) - (order[b.name] ?? 1) || (b.count ?? 0) - (a.count ?? 0))
    .slice(0, n);
}

// ---------- Build the prompt ----------
function buildPrompt(config, data, rawPath) {
  const site = data.site || {};
  const exec = data.exec || {};
  const sections = data.sections || {};
  const speed = data.speed || {};
  const ai = config.ai || {};
  const src = ai.siteType || "website";
  const goal = ai.businessGoal || "improve organic search performance";

  const lines = [];
  const h = (t) => lines.push(`\n## ${t}\n`);
  const li = (t) => lines.push(`- ${t}`);

  lines.push(`# SEO Judgment Analysis Request`);
  lines.push(``);
  lines.push(`Act as an expert SEO consultant. Use the measured data below (produced by the`);
  lines.push(`local SEO Audit Pro tool) and assess what CANNOT be measured by software. Give`);
  lines.push(`practical, prioritized, actionable recommendations for this exact site.`);
  lines.push(``);
  lines.push(`Source data file: \`${path.basename(rawPath)}\``);

  h("Site context");
  li(`Site: ${esc(site.domain || site.baseUrl)}`);
  li(`Base URL: ${esc(site.baseUrl || "N/A")}`);
  li(`Sitemap: ${esc(site.sitemapUrl || "N/A")}`);
  li(`Site type: ${esc(src)}`);
  li(`Business goal: ${esc(goal)}`);
  if (ai.priorityKeywords?.length) li(`Priority keywords: ${ai.priorityKeywords.join(", ")}`);
  if (ai.languages?.length) li(`Languages/locales: ${ai.languages.join(", ")}`);
  if (ai.targetRegions?.length) li(`Target regions: ${ai.targetRegions.join(", ")}`);
  if (ai.competitors?.length) li(`Competitors: ${ai.competitors.join(", ")}`);

  h("Measured snapshot (from the audit)");
  li(`Pages crawled: ${exec.pagesFetched ?? "N/A"}`);
  li(`Issues found: ${exec.totalCrawlIssues} total (${exec.highPriority} high, ${exec.mediumPriority} medium, ${exec.lowPriority} low)`);
  if (exec.avgPerf !== null && exec.avgPerf !== undefined) li(`Average Lighthouse performance: ${exec.avgPerf}/100`);
  if (exec.avgSeo !== null && exec.avgSeo !== undefined) li(`Average Lighthouse SEO score: ${exec.avgSeo}/100`);
  if (exec.topIssues?.length) {
    lines.push(`\nTop issues by priority:`);
    for (const t of exec.topIssues.slice(0, 6)) {
      lines.push(`  - ${esc(t.name)} (${esc(t.priority)}) - ${t.count} page(s)${t.sampleUrls?.length ? ` e.g. ${esc(t.sampleUrls[0])}` : ""}`);
    }
  }

  // Speed findings
  const results = speed.results || [];
  if (results.length) {
    h("Core Web Vitals (per tested page)");
    for (const r of results) {
      if (r.error) {
        li(`${esc(r.url)} - failed: ${esc(r.error)}`);
        continue;
      }
      const m = r.metrics || {};
      lines.push(`- ${esc(r.url)}: perf ${r.score}/100${r.categoryScores?.seo !== undefined ? `, SEO ${r.categoryScores.seo}/100` : ""} | LCP ${m.lcp} | INP ${m.inp} | CLS ${m.cls} | TBT ${m.tbt} | TTFB ${m.ttfb} | ${r.pageSizeBytes ? Math.round(r.pageSizeBytes / 1024) + " KB" : "?"} / ${r.requestCount ?? "?"} req`);
    }
    const opps = results.flatMap((r) => (r.opportunities || []).filter((o) => o.savingsMs)).slice(0, 8);
    if (opps.length) {
      lines.push(``);
      lines.push(`Top Lighthouse opportunities (est. savings):`);
      for (const o of opps) lines.push(`  - ${esc(o.title)} (~${o.savingsMs} ms)`);
    }
  }

  // Crawl findings by category (grouped, with counts)
  function issueBlock(title, list) {
    const grouped = (list || []).reduce((acc, i) => {
      const key = `${i.name}|${i.priority}`;
      if (!acc[key]) acc[key] = { name: i.name, priority: i.priority, count: 0, blocked: 0, sample: i.url };
      acc[key].count += 1;
      if (i.blocked) acc[key].blocked += 1;
      return acc;
    }, {});
    const items = topN(Object.values(grouped), 8);
    if (!items.length) return;
    lines.push(``);
    lines.push(`${title}:`);
    for (const g of items) {
      lines.push(`  - [${esc(g.priority)}] ${esc(g.name)} - ${g.count} page(s)${g.blocked ? ` (${g.blocked} blocked)` : ""}${g.sample ? ` e.g. ${esc(g.sample)}` : ""}`);
    }
  }
  issueBlock("Technical findings", sections.technical);
  issueBlock("On-page findings", sections.onpage);
  issueBlock("Content findings", sections.content);
  if (sections.other?.length) issueBlock("Other findings", sections.other);

  h("What YOU must analyze (software cannot measure these)");
  const asks = [
    "E-E-A-T signals: expertise, author credentials, trust signals, original content on key pages.",
    "Content quality & depth: is content genuinely helpful vs. the top-ranking competitors?",
    `Keyword targeting: alignment of priority keywords (${ai.priorityKeywords?.join(", ") || "none provided"}) with title/H1/URL and intent; any cannibalization.`,
    "Thin content risk: which pages need expansion or consolidation.",
    "Internal linking & architecture improvements (beyond raw crawl data).",
    "International SEO: is the hreflang/sitemap setup correct for the target markets? (syntax was machine-checked; strategy is not).",
    `Index status: note what must be verified in Google Search Console (coverage, sitemap submission, manual actions).`,
    "Schema/structured data review for search appearance (rich results).",
  ];
  for (const a of asks) li(a);

  h("Requested output format");
  lines.push(`1. **Executive judgment summary** - overall health in 3-5 sentences.`);
  lines.push(`2. **E-E-A-T & content quality findings** - issue / impact / evidence / fix / priority.`);
  lines.push(`3. **Keyword & on-page strategy findings** - same format.`);
  lines.push(`4. **International SEO findings** - same format (or note N/A).`);
  lines.push(`5. **Index status checklist** - things to verify in Search Console.`);
  lines.push(`6. **Prioritized 30-day action plan** - critical fixes, high-impact improvements, quick wins.`);
  lines.push(``);
  lines.push(`If data is insufficient for any section, say so and list exactly what to collect.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`(Generated by SEO Audit Pro - AI assistant mode. Next step: paste this whole message into your AI. You may also load the seo-audit skill and point it at this text.)`);

  return lines.join("\n");
}

// ---------- Main ----------
function main() {
  const config = loadConfig(configPath);
  const rawPath = latestRawJson();

  let data;
  try {
    data = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  } catch (err) {
    console.error(`Could not parse ${rawPath}: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.dirname(rawPath))) fs.mkdirSync(path.dirname(rawPath), { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(reportsDir, `ai-prompt-${timestamp}.md`);
  const prompt = buildPrompt(config, data, rawPath);

  fs.writeFileSync(outPath, prompt, "utf-8");
  console.log(`AI analysis prompt written to: ${outPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Open the .md file above.");
  console.log("  2. Paste its whole contents into Claude/ChatGPT (or the seo-audit skill).");
  console.log("  3. Save the AI's judgment report alongside your other reports.");
  console.log("");
  console.log("Tip: add `ai.priorityKeywords`, `ai.businessGoal`, `ai.siteType`, `ai.competitors` to config.json for a richer analysis.");
}

main();