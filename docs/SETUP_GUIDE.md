# SEO Audit Pro — Complete Setup & Running Guide

This guide takes a brand-new machine from nothing to a full SEO audit report. It is written
for **Windows** (the primary supported OS) with notes for macOS/Linux where they differ.

> **Not technical?** Skip the jargon — use the **[Simple Non-Technical Guide →](SIMPLE_GUIDE.md)**
> (plain language, double-click-only).

> Short on time? Do steps 1–5 below, then double-click `run.bat` and pick mode **1**.

---

## 1. What this project is

A local, no-server SEO audit pipeline with three stages:

| Stage | Tool | What it does |
|---|---|---|
| 1. Technical crawl | Python (`src/crawler/`) | Crawls the site like Googlebot: robots.txt, sitemap, canonicals, redirects, soft-404s, schema, hreflang, thin content, orphans/link depth, HTTPS/HSTS/mixed content, titles, meta, headings, images, security headers, status codes |
| 2. Speed audit | Node + Lighthouse (`src/speed/`) | Real Chrome/Lighthouse tests on sampled pages (LCP, INP, CLS, TBT, TTFB, FCP, page size, requests) |
| 3. Merge & report | Node (`src/report/`) | Combines crawl + speed into one `report-*.html` with an executive summary, findings, speed table/chart, crawl budget, and action plan |

Everything runs locally on the machine. Nothing is uploaded anywhere.

---

## 2. Prerequisites (install once)

| Software | Version | Why | Install from |
|---|---|---|---|
| **Node.js** | **20+** (tested up to 24) | Runs the speed + report engines | https://nodejs.org |
| **npm** | ships with Node.js | Installs Node dependencies | — |
| **Python** | **3.9–3.14** (tested 3.14) | Runs the crawler | https://python.org |
| **Google Chrome** | current stable | Required by Lighthouse for speed tests | https://www.google.com/chrome/ |
| **Internet connection** | — | Crawling the target site + first-time dependency download | — |

> **Windows note:** during Python install, tick **"Add python.exe to PATH"**. During Node
> install, accept the default "Add to PATH". Re-open any terminal you already had open.

Optionally install **nvm-windows** (https://github.com/coreybutler/nvm-windows) to manage
Node versions. The project includes a `.nvmrc` (`20`) — `nvm use` picks it up automatically.

---

## 3. Get the project

Put the whole project folder anywhere on disk, e.g. `C:\seo-audit\`. **Two things are
normally excluded when sharing and will be created on first run — do not copy them:**

- `node_modules/` (installed via `npm install`)
- `reports/` (generated audit output)

You need these **tracked files/folders** (everything else in the repo is generated):

```
Seo_audit/
├── config.json              ← site + audit settings (edit this)
├── config.schema.json       ← documents every setting
├── package.json             ← npm scripts + Node deps
├── package-lock.json        ← exact Node dep versions (do not hand-edit)
├── run.bat                  ← one-click launcher
├── .nvmrc                   ← recommended Node version
├── docs/                    ← documentation
├── src/
│   ├── ai/                  ← AI prompt generator
│   ├── crawler/             ← Python crawler
│   ├── report/              ← merge + HTML report builder
│   └── speed/               ← Lighthouse engine
└── scripts/doctor.mjs       ← environment checker
```

---

## 4. Install dependencies

Open a terminal (`cmd`) **inside the project folder** and run:

```bash
# 1) Node dependencies (lighthouse, chrome-launcher, chart.js)
npm install --no-fund --no-audit

# 2) Python dependencies (requests, beautifulsoup4, lxml)
pip install -r src/crawler/requirements.txt
```

`package-lock.json` pins the exact Node versions, so the recipient gets the same packages
that this project was developed with. Python requirements are pinned in
`src/crawler/requirements.txt` for the same reason.

> **Alternative:** just double-click `run.bat`. It auto-installs both as needed on first run.

---

## 5. Verify the environment

```bash
npm run doctor
```

It checks Node, npm, Python + packages, Chrome, Node deps, and `config.json`, then prints
`[OK]`/`[FAIL]` for each. Fix any `[FAIL]` before proceeding. Quick syntax check of all JS:

```bash
npm test
```

---

## 6. Configure the target site

Open **`config.json`** and set the two things that matter most:

```json
"site": {
  "baseUrl": "https://your-site.com",
  "sitemapUrl": "https://your-site.com/sitemap.xml"
}
```

- `baseUrl` — homepage URL (no trailing slash).
- `sitemapUrl` — XML sitemap. The crawler validates it, and the speed engine uses it to pick
  pages to Lighthouse-test. If you omit it, the tool derives `/sitemap.xml` from `baseUrl`.

Useful settings (all optional; `config.schema.json` documents everything):

| Setting | Default | Notes |
|---|---|---|
| `crawler.maxPages` | 5000 | Max pages to crawl. Start at `50` for a quick test |
| `crawler.robotsMode` | `respect` | `respect` = skip robots-blocked URLs like Googlebot; `ignore` = audit everything and tag blocked pages |
| `crawler.delayBetweenRequests` | 1.0 | Seconds between requests. Raise for gentle crawling |
| `crawler.checkHttps` / `checkMixedContent` / `checkLinkDepth` | `true` | Toggle the newer security/link-depth checks |
| `speed.auditMode` | `full` | `light` = performance only (faster); `full` = + SEO, a11y, best-practices |
| `speed.formFactor` | `mobile` | `mobile` or `desktop` |
| `speed.samplesPerCategory` | varies | Pages tested per URL category. Lower = faster |
| `speed.concurrency` | 1 | Parallel Lighthouse tests. Raise carefully (CPU-heavy) |
| `report.outputDir` | `./reports` | Where results are written |
| `ai.*` | — | Context for the AI prompt generator (mode 5): keywords, business goal, competitors |

---

## 7. Run an audit

### Option A — one-click launcher (recommended for Windows)

Double-click **`run.bat`**:

```
Select audit mode:
  1) Full Audit (Crawl + Speed + Combined Report + AI Prompt)
  2) Crawl Only (Technical SEO)
  3) Speed Only (Core Web Vitals)
  4) Single Page Speed Check
  5) AI Analysis (build prompt from latest results)
```

| Mode | Pipeline | Use when |
|---|---|---|
| **1** | crawl → speed → report → AI prompt | The complete audit |
| **2** | crawl only | Fast technical check, no speed tests |
| **3** | speed only | Re-test performance on existing crawl output |
| **4** | single URL Lighthouse | Quick one-page check (asks for URL + device) |
| **5** | AI prompt from latest results | Build the judgment-analysis prompt |

### Option B — npm scripts

```bash
npm run audit      # everything (crawl + speed + report + AI prompt)
npm run full       # crawl + speed + report (no AI prompt)
npm run crawl      # technical crawl only
npm run speed      # speed tests only
npm run report     # merge + unified HTML report
npm run ai         # AI prompt from latest results
```

### Option C — raw commands

```bash
python src/crawler/seo_audit.py --config config.json --cwd reports --output crawl_results.json
node src/speed/seo-speed-audit.js --config config.json --output reports/speed_results.json
node src/report/merge-report.js --config config.json --crawl reports/crawl_results.json --speed reports/speed_results.json --output reports
```

### Stale-data protection

The merge step refuses to combine data older than 24 h (override with
`--max-age-hours`), warns past 6 h, and `run.bat` deletes previous crawl/speed outputs
before each stage. A report is **always built from fresh data**.

---

## 8. Reading the results

Everything lands in `reports/`:

| File | Description |
|---|---|
| `report-<timestamp>.html` | **The deliverable.** Open in a browser. Executive summary, technical/on-page/content findings, speed table + chart, crawl budget, action plan |
| `raw-<timestamp>.json` | Unified structured data (feeds the AI prompt; reusable for other tools) |
| `crawl_results.json` | Raw crawler output (issues + page data) |
| `speed_results.json` | Raw Lighthouse results per tested page |
| `seo_issues_summary.csv` | Issues grouped with counts + % of crawled pages |
| `seo_issues_detail.csv` | Every issue per URL (Excel-friendly) |
| `ai-prompt-<timestamp>.md` | The AI judgment prompt (see §9) |

**Report sections:** Executive summary → Speed & Core Web Vitals → Technical SEO findings →
On-page findings → Content findings → Structured data → Crawl budget & efficiency →
Prioritized action plan (critical → high-impact → quick wins).

---

## 9. AI judgment analysis (mode 5)

Code measures what code can measure. Judgment still needed for: E-E-A-T & content quality,
keyword targeting/cannibalization, international SEO strategy, and Search Console index data.

1. Run mode **5** (`npm run ai`) after an audit — it reads the latest `raw-*.json` and your
   `config.json` `ai` section.
2. Open `reports/ai-prompt-<timestamp>.md`.
3. Paste the whole file into Claude, ChatGPT, or the `seo-audit` skill.
4. Save the returned judgment report next to your reports.

No API key, no cost — nothing leaves your machine until you copy-paste.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `run.bat` window flashes and closes | Run from a terminal: `cmd`, then `run.bat` to see the error. (A known npm.cmd shim bug is already worked around via `cmd /c "npm ..."`.) |
| `npm run doctor` shows `[FAIL]` | Follow the fix printed on the same line (missing Node/Python/Chrome/package). |
| "Node.js not found" | Install Node 20+ and reopen the terminal. |
| "Python not found" | Install Python 3.9+ and tick "Add python.exe to PATH". Reopen terminal. |
| Lighthouse errors / "Chrome not found" | Install Google Chrome; verify with `npm run doctor`. |
| Speed scores all `0` | Normally stale Lighthouse. Re-run the speed audit after upgrading Node/lighthouse (`npm install`). If still 0 on a fresh run, the page is likely behind a login/paywall and can't be tested. |
| Merge refuses: "data is STALE" | Re-run the crawl/speed stages (or delete `reports/crawl_results.json` / `speed_results.json`) and merge again. |
| Crawl too slow | Lower `crawler.maxPages`, `crawler.delayBetweenRequests`, or set `crawler.checkExternalLinks: false`. |
| Report empty | Both `crawl_results.json` and `speed_results.json` must exist with data before merging. |
| Speed tests fail for some pages | Login/paywall/JS-only-auth pages can't be audited; they're marked failed in the report. |
| `EPERM`/permission error cleaning Chrome temp | Harmless. Chrome was still releasing a temp folder; the audit itself succeeded. |

---

## 11. Sending this project to someone else

- Include all **tracked** files (the repo). A zip of the folder (excluding `node_modules/`
  and `reports/`) is the cleanest handoff — the recipient follows steps 3–5 to rebuild.
- Point them to this file (`docs/SETUP_GUIDE.md`).
- **Before sharing, change `config.json` to your own site** or tell them to — the current
  `site.baseUrl`/`sitemapUrl` point at the site it was developed against.

---

## 12. Supported software matrix (as shipped)

| Component | Version | Where pinned |
|---|---|---|
| Node.js | >= 20 (tested 24) | `package.json` → `engines`, `.nvmrc` |
| Python | 3.9–3.14 | docs |
| requests | 2.31.0 | `src/crawler/requirements.txt` |
| beautifulsoup4 | 4.14.3 | `src/crawler/requirements.txt` |
| lxml | 6.0.2 | `src/crawler/requirements.txt` |
| lighthouse | 13.4.1 | `package-lock.json` |
| chrome-launcher | 1.2.1 | `package-lock.json` |
| chart.js | 4.5.1 | `package-lock.json` |
| Google Chrome | current stable | installed separately |
