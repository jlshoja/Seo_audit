#!/usr/bin/env node
/**
 * SEO Audit Pro - Merge & Unified HTML Report Builder
 * Combines the crawler JSON (technical SEO findings) with the
 * speed JSON (Core Web Vitals / Lighthouse) and produces one
 * unified HTML report with:
 *   - Executive Summary
 *   - Technical SEO Findings
 *   - On-Page & Content Findings
 *   - Speed & Core Web Vitals Findings
 *   - Prioritized Action Plan
 * It mirrors the output format expected by the seo-audit skill.
 *
 * Run: node src/report/merge-report.js --config config.json --crawl reports/crawl_results.json --speed reports/speed_results.json --output reports
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");

// ---------- CLI ----------
const args = process.argv.slice(2);
function argValue(name, hasValue = true) {
  const idx = args.indexOf(name);
  if (idx === -1) {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.split("=").slice(1).join("=") : null;
  }
  return hasValue && args[idx + 1] ? args[idx + 1] : null;
}

const configPath = argValue("--config") || path.join(rootDir, "config.json");
const crawlPath = argValue("--crawl") || path.join(rootDir, "reports", "crawl_results.json");
const speedPath = argValue("--speed") || path.join(rootDir, "reports", "speed_results.json");
const outputDir = argValue("--output") || path.join(rootDir, "reports");
const outputHtmlPath = argValue("--html");

// ---------- Helpers ----------
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(score) {
  if (score >= 90) return "#0cce6b";
  if (score >= 50) return "#ffa400";
  return "#ff4e42";
}

function priorityColor(p) {
  const v = String(p).toLowerCase();
  if (v.includes("high")) return "#c0392b";
  if (v.includes("medium")) return "#e67e22";
  return "#2c7a45";
}

function shortUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.pathname + parsed.search;
  } catch {
    return u;
  }
}

// ---------- Load inputs ----------
function loadJson(p) {
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch {
    console.warn(`Could not parse JSON: ${resolved}`);
    return null;
  }
}

// ---------- Classification ----------
const TECHNICAL_ISSUES = [
  "Response Codes:",
  "Security:",
  "Sitemap:",
  "Canonicalization:",
  "Directives:",
  "URL:",
  "HTML:",
  "Schema:",
  "Hreflang:",
  "Links: Orphan",
  "Content: Likely Soft 404",
];

const ONPAGE_ISSUES = [
  "Page Titles:",
  "Meta Description:",
  "H1:",
  "H2:",
  "Headings:",
  "Content: Thin",
  "Content: Very Thin",
  "Images:",
  "Links: Internal",
  "Links: External",
  "Keyword",
];

const CONTENT_ISSUES = [
  "Content:",
  "E-E-A-T"  // placeholder; E-E-A-T is AI-judged, not crawled
];

function isTechnical(name) {
  return TECHNICAL_ISSUES.some((p) => String(name).startsWith(p));
}
function isOnpage(name) {
  return ONPAGE_ISSUES.some((p) => String(name).startsWith(p));
}
function isContent(name) {
  return CONTENT_ISSUES.some((p) => String(name).startsWith(p));
}

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2, high: 0, medium: 1, low: 2 };

function priorityRank(p) {
  return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, p) ? PRIORITY_ORDER[p] : 1;
}

// ---------- Build unified data ----------
function buildReportData(crawl, speed, config) {
  const site = {
    baseUrl: config.site?.baseUrl || crawl?.site?.start_url || speed?.site?.baseUrl || "N/A",
    domain: (config.site?.baseUrl || "").replace(/^https?:\/\//, "").replace(/\/.*/, "") || "N/A",
    sitemapUrl: config.site?.sitemapUrl || crawl?.site?.sitemap_url || speed?.site?.sitemapUrl || "N/A",
  };

  // ---- Crawl issues ----
  const crawlIssues = crawl?.issues_detail || [];
  const summaryIssues = crawl?.issues_summary || [];

  const technical = crawlIssues.filter((i) => isTechnical(i.name));
  const onpage = crawlIssues.filter((i) => isOnpage(i.name));
  const content = crawlIssues.filter((i) => isContent(i.name));
  const other = crawlIssues.filter((i) => !isTechnical(i.name) && !isOnpage(i.name) && !isContent(i.name));

  // ---- Speed results ----
  const speedResults = speed?.results || [];
  const speedMeta = speed?.meta || [];

  // ---- Executive summary ----
  const perfScores = speedResults.filter((r) => r.score !== undefined).map((r) => r.score);
  const avgPerf = perfScores.length ? Math.round(perfScores.reduce((a, b) => a + b, 0) / perfScores.length) : null;
  const goodPerf = perfScores.filter((s) => s >= 90).length;
  const okPerf = perfScores.filter((s) => s >= 50 && s < 90).length;
  const poorPerf = perfScores.filter((s) => s < 50).length;

  const seoScores = speedResults.filter((r) => r.categoryScores?.seo !== undefined).map((r) => r.categoryScores.seo);
  const avgSeo = seoScores.length ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length) : null;

  const highPriority = crawlIssues.filter((i) => String(i.priority).toLowerCase().includes("high"));
  const mediumPriority = crawlIssues.filter((i) => String(i.priority).toLowerCase().includes("medium"));
  const lowPriority = crawlIssues.filter((i) => String(i.priority).toLowerCase().includes("low"));

  // ---- Top priority issues (from summary counts) ----
  const topIssues = [...crawlIssues]
    .filter((i) => !i.blocked)
    .reduce((acc, i) => {
      const key = i.name;
      if (!acc[key]) acc[key] = { name: i.name, type: i.type, priority: i.priority, count: 0, sampleUrls: [] };
      acc[key].count += 1;
      if (acc[key].sampleUrls.length < 3) acc[key].sampleUrls.push(i.url);
      return acc;
    }, {});

  const topIssueList = Object.values(topIssues)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.count - a.count)
    .slice(0, 5);

  return {
    generated_at: crawl?.generated_at || new Date().toISOString(),
    site,
    crawl_stats: crawl?.crawl_stats || null,
    exec: {
      avgPerf,
      goodPerf,
      okPerf,
      poorPerf,
      avgSeo,
      totalCrawlIssues: crawlIssues.length,
      highPriority: highPriority.length,
      mediumPriority: mediumPriority.length,
      lowPriority: lowPriority.length,
      pagesFetched: crawl?.crawl_stats?.pages_fetched || crawlIssues.length && 0,
      pagesTestedSpeed: speedResults.length,
      topIssues: topIssueList,
    },
    sections: {
      technical,
      onpage,
      content,
      other,
      summaryIssues,
    },
    speed: {
      mode: speed?.speed || {},
      results: speedResults,
      meta: speedMeta,
    },
  };
}

// ---------- HTML template ----------
function buildHtml(data, config) {
  const { site, exec, sections, speed } = data;

  const rows = speed.results
    .map((r, idx) => {
      const m = speed.meta[idx] || {};
      if (r.error) {
        return `<tr class="err"><td>${escapeHtml(r.url)}</td><td colspan="10">Test failed: ${escapeHtml(r.error)}</td></tr>`;
      }
      const sizeKb = r.pageSizeBytes ? Math.round(r.pageSizeBytes / 1024) : "—";
      return `<tr>
        <td class="url-cell"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>
          <div class="cat-badge">${escapeHtml(m.category || "other")}</div></td>
        <td><span class="score" style="background:${scoreColor(r.score)}">${r.score}</span></td>
        <td>${r.categoryScores?.seo !== undefined ? `<span class="score" style="background:${scoreColor(r.categoryScores.seo)}">${r.categoryScores.seo}</span>` : "—"}</td>
        <td>${r.metrics.lcp}</td>
        <td>${r.metrics.inp}</td>
        <td>${r.metrics.cls}</td>
        <td>${r.metrics.tbt}</td>
        <td>${r.metrics.ttfb}</td>
        <td>${r.metrics.fcp}</td>
        <td>${sizeKb} KB</td>
        <td>${r.requestCount ?? "—"}</td>
      </tr>`;
    })
    .join("\n");

  // -------- Issue rendering (technical / onpage / content) --------
  function issueRows(list) {
    const grouped = list.reduce((acc, i) => {
      const key = `${i.name}|${i.priority}`;
      if (!acc[key]) acc[key] = { name: i.name, priority: i.priority, count: 0, blocked: 0, examples: [] };
      acc[key].count += 1;
      if (i.blocked) acc[key].blocked += 1;
      if (acc[key].examples.length < 3) acc[key].examples.push(i.url);
      return acc;
    }, {});
    return Object.values(grouped)
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
      .map((g) => `
        <div class="issue-block">
          <div class="issue-head">
            <span class="prio" style="background:${priorityColor(g.priority)}">${escapeHtml(g.priority)}</span>
            <strong>${escapeHtml(g.name)}</strong>
            <span class="count">${g.count} page(s)${g.blocked ? `, ${g.blocked} blocked` : ""}</span>
          </div>
          ${g.examples.length ? `<div class="examples">${g.examples.map((e) => `<code>${escapeHtml(shortUrl(e))}</code>`).join("")}</div>` : ""}
        </div>`)
      .join("\n");
  }

  function sectionBlock(title, icon, list, emptyText) {
    if (!list.length) return `<h2 class="section-title">${icon} ${title}</h2><p class="muted">${emptyText}</p>`;
    return `<h2 class="section-title">${icon} ${title} <span class="badge">${list.length}</span></h2>${issueRows(list)}`;
  }

  // -------- Action plan --------
  function actionPlan() {
    const critical = sections.technical.filter((i) => String(i.priority).toLowerCase().includes("high") && !i.blocked);
    const high = [...sections.onpage, ...sections.content].filter((i) => String(i.priority).toLowerCase().includes("high") && !i.blocked);
    const quickWins = [...sections.technical, ...sections.onpage]
      .filter((i) => String(i.priority).toLowerCase().includes("low") && !i.blocked);

    const groupedCritical = groupByName(critical);
    const groupedHigh = groupByName(high);
    const groupedQuick = groupByName(quickWins);

    const planItems = (list, channel) => list.map((g) => `
      <li><strong>${escapeHtml(g.name)}</strong> — ${g.count} page(s)<br>
        <span class="muted">Type: ${escapeHtml(g.type || "—")}</span></li>`).join("\n");

    return `
      <div class="plan">
        <div class="plan-col">
          <h3>1. Critical fixes (blocking indexation/ranking)</h3>
          <ul>${groupedCritical.length ? planItems(groupedCritical) : "<li class='muted'>No critical issues detected.</li>"}</ul>
        </div>
        <div class="plan-col">
          <h3>2. High-impact improvements</h3>
          <ul>${groupedHigh.length ? planItems(groupedHigh) : "<li class='muted'>No high-impact on-page/content issues.</li>"}</ul>
        </div>
        <div class="plan-col">
          <h3>3. Quick wins</h3>
          <ul>${groupedQuick.length ? planItems(groupedQuick) : "<li class='muted'>No quick-win opportunities found.</li>"}</ul>
        </div>
      </div>`;
  }

  function groupByName(list) {
    const acc = {};
    for (const i of list) {
      if (!acc[i.name]) acc[i.name] = { name: i.name, type: i.type, priority: i.priority, count: 0 };
      acc[i.name].count += 1;
    }
    return Object.values(acc).sort((a, b) => b.count - a.count).slice(0, 8);
  }

  // -------- Per-page speed details --------
  function speedDetails() {
    return speed.results
      .map((r, idx) => {
        if (r.error) return `<div class="detail-card"><h3>${escapeHtml(r.url)}</h3><p class="err-text">Failed: ${escapeHtml(r.error)}</p></div>`;
        const m = speed.meta[idx] || {};
        const opps = (r.opportunities || [])
          .map((o) => `<li><strong>${escapeHtml(o.title)}</strong>${o.savingsMs ? ` — ~${o.savingsMs} ms` : ""}<div class="desc">${escapeHtml((o.description || "").replace(/\[.*?\]\(.*?\)/g, "").slice(0, 200))}</div></li>`)
          .join("");
        const diags = (r.diagnostics || [])
          .map((d) => `<li><strong>${escapeHtml(d.title)}</strong><div class="desc">${escapeHtml((d.description || "").replace(/\[.*?\]\(.*?\)/g, "").slice(0, 200))}</div></li>`)
          .join("");
        return `<div class="detail-card">
          <h3><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>
            <span class="score" style="background:${scoreColor(r.score)}">${r.score}</span>
            <span class="cat-badge">${escapeHtml(m.category || "other")}</span></h3>
          ${opps ? `<h4>Speed improvement opportunities</h4><ul>${opps}</ul>` : ""}
          ${diags ? `<h4>Other technical issues</h4><ul>${diags}</ul>` : ""}
          ${!opps && !diags ? "<p class='muted'>No significant issues detected.</p>" : ""}
        </div>`;
      })
      .join("\n");
  }

  const chartLabels = JSON.stringify(speed.results.map((r) => likelyLabel(r.url, site.baseUrl)));
  const chartScores = JSON.stringify(speed.results.map((r) => (r.error ? 0 : r.score)));
  const chartSeoScores = JSON.stringify(speed.results.map((r) => (r.categoryScores?.seo ?? null)));

  function likelyLabel(u, base) {
    if (base && u && u.startsWith(base)) return u.replace(base, "") || "/";
    return shortUrl(u);
  }

  const avgPerfDisplay = exec.avgPerf !== null ? `${exec.avgPerf}` : "—";
  const avgSeoDisplay = exec.avgSeo !== null ? `${exec.avgSeo}` : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEO Audit Report - ${escapeHtml(site.domain)}</title>
<style>
  :root { --bg:#f5f6f8; --card:#fff; --ink:#222; --muted:#777; --head:#1f2a44; --line:#eee; }
  * { box-sizing:border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; background:var(--bg); margin:0; padding:24px; color:var(--ink); }
  .wrap { max-width:1200px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; color:var(--head); }
  h2.section-title { font-size:17px; margin:36px 0 12px; border-left:4px solid var(--head); padding-left:10px; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .muted { color:var(--muted); }
  .badge { display:inline-block; background:#eef1f6; color:var(--head); font-size:11px; padding:2px 8px; border-radius:10px; vertical-align:middle; }
  .card { background:var(--card); border-radius:8px; padding:16px 20px; margin-bottom:14px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:12px; margin:16px 0; }
  .kpi { background:var(--card); border-radius:8px; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,.08); text-align:center; }
  .kpi .num { font-size:26px; font-weight:bold; }
  .kpi .lbl { color:var(--muted); font-size:12px; margin-top:4px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  th,td { padding:8px 10px; text-align:left; border-bottom:1px solid var(--line); font-size:13px; }
  th { background:var(--head); color:#fff; position:sticky; top:0; }
  tr.err td { color:#c0392b; background:#fff5f5; }
  .url-cell { max-width:340px; word-break:break-all; }
  .score { display:inline-block; min-width:32px; text-align:center; color:#fff; font-weight:bold; border-radius:6px; padding:2px 6px; }
  .cat-badge { display:inline-block; font-size:11px; color:#666; background:#eef1f6; padding:1px 8px; border-radius:10px; margin-left:6px; }
  .chart-wrap { background:var(--card); padding:16px; border-radius:8px; margin:20px 0; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .issue-block { background:var(--card); border-radius:8px; padding:12px 16px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  .issue-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .prio { color:#fff; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:10px; }
  .count { color:var(--muted); font-size:12px; }
  .examples { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; }
  code { background:#eef1f6; color:#444; font-size:11px; padding:2px 6px; border-radius:4px; word-break:break-all; }
  .plan { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:14px; }
  .plan-col { background:var(--card); border-radius:8px; padding:14px 18px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .plan-col h3 { font-size:14px; margin:0 0 10px; color:var(--head); }
  .plan-col ul { margin:0; padding-left:18px; }
  .plan-col li { margin-bottom:10px; font-size:13px; }
  .detail-card { background:var(--card); padding:14px 18px; border-radius:8px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .detail-card h3 { display:flex; align-items:center; gap:8px; font-size:14px; }
  .detail-card h4 { font-size:13px; margin:10px 0 6px; color:#444; }
  .detail-card ul { margin:0; padding-left:18px; }
  .detail-card li { margin-bottom:8px; font-size:13px; }
  .detail-card .desc { color:var(--muted); font-size:12px; margin-top:2px; }
  .err-text { color:#c0392b; }
  .note { background:#fff8e1; border-left:4px solid #f9a825; padding:10px 14px; border-radius:6px; font-size:13px; margin:16px 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>SEO Audit Report — ${escapeHtml(site.domain)}</h1>
  <div class="meta">
    Generated: ${escapeHtml(data.generated_at)} &nbsp;|&nbsp;
    Sitemap: <code>${escapeHtml(site.sitemapUrl)}</code> &nbsp;|&nbsp;
    Device: ${escapeHtml(speed.mode.formFactor || "mobile")} &nbsp;|&nbsp;
    Speed mode: ${escapeHtml(speed.mode.mode || "full")}
  </div>

  <h2 class="section-title">Executive Summary</h2>
  <div class="kpis">
    <div class="kpi"><div class="num" style="color:${scoreColor(avgPerfDisplay === "—" ? 50 : avgPerfDisplay)}">${avgPerfDisplay}</div><div class="lbl">Avg Performance</div></div>
    <div class="kpi"><div class="num" style="color:${scoreColor(avgSeoDisplay === "—" ? 50 : avgSeoDisplay)}">${avgSeoDisplay}</div><div class="lbl">Avg SEO Score</div></div>
    <div class="kpi"><div class="num">${exec.totalCrawlIssues}</div><div class="lbl">Total Crawler Issues</div></div>
    <div class="kpi"><div class="num" style="color:#c0392b">${exec.highPriority}</div><div class="lbl">High Priority</div></div>
    <div class="kpi"><div class="num" style="color:#e67e22">${exec.mediumPriority}</div><div class="lbl">Medium Priority</div></div>
    <div class="kpi"><div class="num" style="color:#2c7a45">${exec.lowPriority}</div><div class="lbl">Low Priority</div></div>
    <div class="kpi"><div class="num">${exec.pagesFetched ?? 0}</div><div class="lbl">Pages Crawled</div></div>
    <div class="kpi"><div class="num">${exec.pagesTestedSpeed}</div><div class="lbl">Pages Speed-Tested</div></div>
  </div>

  ${exec.topIssues.length ? `
  <div class="card">
    <h3>Top priority issues <span class="badge">${exec.topIssues.length}</span></h3>
    <ol>
      ${exec.topIssues.map((t) => `<li><strong>${escapeHtml(t.name)}</strong> — ${t.count} page(s) [${escapeHtml(t.priority)}]${t.sampleUrls.length ? ` &nbsp;<code>${escapeHtml(shortUrl(t.sampleUrls[0]))}</code>` : ""}</li>`).join("")}
    </ol>
  </div>` : ""}

  ${data.crawl_stats ? `
  <div class="note">Crawl stats: ${data.crawl_stats.pages_fetched ?? 0} pages fetched, ${data.crawl_stats.urls_discovered ?? 0} URLs discovered,
    ${data.crawl_stats.robots_skipped ?? 0} skipped by robots.txt, ${data.crawl_stats.sample_skipped ?? 0} skipped by sampling.</div>` : ""}

  <h2 class="section-title">Speed &amp; Core Web Vitals</h2>
  <div class="chart-wrap"><canvas id="scoreChart" height="80"></canvas></div>
  <table>
    <thead><tr>
      <th>Page</th><th>Perf</th><th>SEO</th><th>LCP</th><th>INP</th><th>CLS</th><th>TBT</th><th>TTFB</th><th>FCP</th><th>Size</th><th>Req</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${sectionBlock("Technical SEO Findings", "🔧", sections.technical, "No technical SEO issues found.")}
  ${sectionBlock("On-Page SEO Findings", "📄", sections.onpage, "No on-page SEO issues found.")}
  ${sectionBlock("Content Findings", "✏️", sections.content, "No content issues found.")}
  ${sections.other.length ? sectionBlock("Other Findings", "📎", sections.other, "") : ""}

  <h2 class="section-title">Prioritized Action Plan</h2>
  ${actionPlan()}

  ${speed.results.length ? `<h2 class="section-title">Per-page Speed Details</h2>${speedDetails()}` : ""}

  <div class="note">This report is generated from measured crawl + Lighthouse data. For judgment-based areas not measurable by code
  (E-E-A-T signals, content quality, keyword strategy), review findings with the seo-audit skill.</div>
</div>

<script>
const ctx = document.getElementById('scoreChart');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ${chartLabels},
    datasets: [
      { label: 'Performance', data: ${chartScores}, backgroundColor: ${chartScores}.map(s => s >= 90 ? '#0cce6b' : s >= 50 ? '#ffa400' : '#ff4e42') },
      { label: 'SEO', data: ${chartSeoScores}, backgroundColor: 'rgba(31,42,68,.6)' }
    ]
  },
  options: {
    scales: { y: { beginAtZero: true, max: 100 } },
    plugins: { legend: { display: true } }
  }
});
</script>
</body>
</html>`;
}

// ---------- Chart.js inline embed ----------
function loadChartJs() {
  const candidates = [
    path.join(rootDir, "node_modules", "chart.js", "dist", "chart.umd.js"),
    path.join(rootDir, "node_modules", "chart.js", "dist", "chart.umd.min.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return `<script>\n${fs.readFileSync(p, "utf-8")}\n</script>`;
    }
  }
  return `<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>`;
}

// ---------- Main ----------
function main() {
  const crawl = loadJson(crawlPath);
  const speed = loadJson(speedPath);
  const config = loadJson(configPath) || {};

  if (!crawl && !speed) {
    console.error("No crawl or speed data found. Run the crawl and speed audits first.");
    process.exit(1);
  }

  console.log("Merging results...");
  const data = buildReportData(crawl, speed, config);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = outputHtmlPath || path.join(outputDir, `report-${timestamp}.html`);
  const jsonPath = path.join(outputDir, `raw-${timestamp}.json`);

  // Replace chart script with inline bundle
  const html = buildHtml(data, config).replace('</head>', `${loadChartJs()}</head>`);

  fs.writeFileSync(htmlPath, html, "utf-8");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");

  console.log(`\nUnified HTML report: ${htmlPath}`);
  console.log(`Raw JSON data: ${jsonPath}`);

  // Acceptance check
  if (data.sections.technical.length === 0 && data.sections.onpage.length === 0 && speed.results.length === 0) {
    console.warn("\nWarning: report contains no findings. Verify crawl/speed outputs.");
  }
}

main();