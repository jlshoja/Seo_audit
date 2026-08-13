# How to Use SEO Audit Pro

A practical, step-by-step guide for running an SEO audit on your website.

## What you need

- **Windows PC**
- **Node.js 20+** — https://nodejs.org
- **Python 3.9+** — https://python.org
- A **Google Chrome** install (used by Lighthouse for speed tests)
- An internet connection (for crawling + first-time package install)

> New machine? Follow the **[Complete Setup & Running Guide →](SETUP_GUIDE.md)** first —
> it covers prerequisites, dependency install, the `npm run doctor` environment check, and
> end-to-end troubleshooting.

---

## First-time setup (do once)

### 1. Install dependencies

The tool checks and installs what it needs on first run. If you prefer doing it manually:

```bash
# Node packages (lighthouse, chrome-launcher, chart.js)
npm install --no-fund --no-audit

# Python packages
pip install -r src/crawler/requirements.txt
```

### 2. Point the tool at your site

Open **`config.json`** and change the `site` section:

```json
"site": {
  "baseUrl": "https://yoursite.com",
  "sitemapUrl": "https://yoursite.com/sitemap.xml"
}
```

- `baseUrl` — your homepage URL.
- `sitemapUrl` — your XML sitemap. The crawler validates it and the speed engine uses it to pick test pages.

### 3. Optional: tune the audit

- **`crawler.maxPages`** — how many pages to crawl (start with 50–100 for a quick test, raise to 1000+ for production).
- **`crawler.robotsMode`** — `respect` crawls like Googlebot (skips blocked URLs), `ignore` audits everything and tags blocked pages.
- **`speed.formFactor`** — `mobile` or `desktop`; `speed.auditMode` — `light` (faster) or `full` (all Lighthouse categories).
- **`speed.samplesPerCategory`** — how many pages per URL category get speed-tested (fewer = faster).
- **`ai` section** — keywords, business goal, competitors (used by mode 5 only).

---

## Running an audit

### Option A — One-click (recommended)

Double-click **`run.bat`**. You'll see a menu:

```
Select audit mode:
  1) Full Audit (Crawl + Speed + Combined Report + AI Prompt)
  2) Crawl Only (Technical SEO)
  3) Speed Only (Core Web Vitals)
  4) Single Page Speed Check
  5) AI Analysis (build prompt from latest results)
Enter choice [1-5]:
```

| Mode | What it does | Good for |
|---|---|---|
| **1** | Full pipeline: crawl all → speed-test samples → unified report → AI prompt | The complete audit |
| **2** | Technical crawl only (no speed tests) | Fast check of crawl/indexability issues |
| **3** | Speed tests only on existing crawl output | Re-testing performance without re-crawling |
| **4** | One URL + device full Lighthouse test | Single page quick check |
| **5** | Build the AI judgment prompt from the latest results | Getting the judgment analysis |

The window stays open when done so you can read errors.

### Option B — Command line / npm

```bash
npm run audit        # everything: crawl + speed + report + AI prompt
npm run full         # crawl + speed + report (no AI prompt)
npm run crawl        # technical crawl only
npm run speed        # speed tests only
npm run report       # merge + unified HTML report
npm run ai           # AI prompt from latest results
```

### Option C — Step by step

```bash
python src/crawler/seo_audit.py --config config.json --cwd reports --output crawl_results.json
node src/speed/seo-speed-audit.js --config config.json --output reports/speed_results.json
node src/report/merge-report.js --config config.json --crawl reports/crawl_results.json --speed reports/speed_results.json --output reports
```

---

## Reading the results

Everything is written to the **`reports/`** folder at the project root:

| File | What it is |
|---|---|
| `report-<timestamp>.html` | **The main deliverable** — open in any browser. Executive summary, all findings, speed table + chart, prioritized action plan. |
| `raw-<timestamp>.json` | Unified structured data (feeds the AI prompt, reusable for other tools). |
| `crawl_results.json` | Raw crawler output (all found issues per URL). |
| `seo_issues_summary.csv` | Issues grouped with counts + percentages. |
| `seo_issues_detail.csv` | Every issue per URL — good for Excel filtering. |
| `speed_results.json` | Raw Lighthouse results per tested page. |
| `ai-prompt-<timestamp>.md` | Prompt to paste into an AI (see next section). |

**In the HTML report:**

1. **Executive Summary** — average performance & SEO scores, issue counts by priority, top issues.
2. **Speed & Core Web Vitals** — per-page LCP / INP / CLS / TBT / TTFB / FCP.
3. **Technical SEO Findings** — crawlability, indexation, canonicals, redirects, sitemap, security, schema, hreflang.
4. **On-Page Findings** — titles, meta descriptions, headings, images, internal links.
5. **Content Findings** — thin content, soft 404s.
6. **Prioritized Action Plan** — critical fixes → high-impact → quick wins.

---

## Getting the AI judgment analysis (mode 5)

The tool measures what code can measure. Human/AI judgment is still needed for:

- E-E-A-T signals & content quality
- Keyword targeting / cannibalization
- International SEO strategy
- Index status (Google Search Console data)

**To get this part:**

1. After a full audit (or any time), run mode **5** (`npm run ai`) — it reads the latest `raw-*.json` + your `config.json` `ai` section.
2. Open `reports/ai-prompt-<timestamp>.md`.
3. **Paste the whole file** into Claude, ChatGPT, or the `seo-audit` skill.
4. The AI returns a judgment report (E-E-A-T, content quality, keywords, international, Search Console checklist, 30-day action plan). Save it next to your reports.

No API key, no cost, nothing leaves your machine until you copy-paste.

---

## Speed vs. coverage tips

| Goal | Change |
|---|---|
| Quick sanity check | `maxPages: 50`, `samplesPerCategory` all `1` |
| Full site audit | `maxPages: 5000`, keep default sampling |
| Faster speed tests | `speed.auditMode: "light"`, `speed.concurrency: 2` |
| Slow sites being crawled | lower `requestTimeout` / `delayBetweenRequests`, disable `checkExternalLinks` |
| E-commerce faceted nav | keep `autoSample: true` to avoid crawling infinite parameter URLs |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `run.bat` window flashes and closes | Run it from a terminal (`cmd`, type `run.bat`) to see the real error. Known Windows bug with the `npm.cmd` shim is already worked around via `cmd /c "npm ..."`. |
| "Node.js not found" | Install from https://nodejs.org and reopen the terminal. |
| "Python not found" | Install from https://python.org and make sure `python` is in PATH. |
| Lighthouse not found | `npm install --no-fund --no-audit`, or check internet access. |
| Too slow / hangs | Lower `maxPages`, reduce delay, run mode 2 (crawl only) then mode 3 (speed only). |
| Report empty | Make sure `reports/crawl_results.json` and `reports/speed_results.json` exist before the merge step. |
| Speed tests fail for some pages | Pages behind login/paywall/JS-only auth can't be tested. Sample size is per-category; those pages are marked as failed in the report. |

---

## Where to go next

- Read the **reports/report-*.html** and pick the top 3 issues to fix first.
- Use the **AI prompt (mode 5)** for the judgment-based parts.
- Re-run the audit after fixes to measure improvement (scores change over time).
- For very large sites, run the crawl first (mode 2), then decide if a speed pass is worth it (mode 3).