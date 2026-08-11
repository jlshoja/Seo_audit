# SEO Audit Pro

An integrated, Windows-local SEO audit tool that combines two engines into one pipeline:

1. **Technical crawler** (Python, `src/crawler/seo_audit.py`) — crawls the whole site as Googlebot, validating on-page + technical SEO (robots.txt, sitemap, canonicals, redirect chains, soft 404s, schema, hreflang, thin content, internal links / orphans, titles, meta descriptions, headings, images, security headers, response codes, URL structure).
2. **Core Web Vitals engine** (Node/Lighthouse, `src/speed/seo-speed-audit.js`) — runs real Lighthouse tests on sampled pages (LCP, INP, CLS, TBT, TTFB, FCP, Speed Index, page size, requests, opportunities).
3. **Merge & report builder** (`src/report/merge-report.js`) — combines both outputs into one unified HTML report with an executive summary, technical/on-page/content findings, speed table, and a prioritized action plan.

Everything runs locally on your Windows PC — no VPS, no paid service.

## Project layout

```
Seo_audit/
├── src/               code
│   ├── crawler/       technical SEO crawler (Python)
│   ├── speed/         Core Web Vitals / Lighthouse engine (Node)
│   └── report/        unified HTML report builder (Node)
├── reports/           ALL generated results live here
│   ├── report-*.html            unified visual report
│   ├── raw-*.json               merged structured data
│   ├── crawl_results.json       crawler raw output
│   ├── speed_results.json       speed raw output
│   ├── seo_issues_summary.csv   crawl findings summary
│   └── seo_issues_detail.csv    per-URL crawl findings
├── config.json        site + audit settings
└── run.bat            one-click launcher
```

All results are written to a single `reports/` folder at the project root.

## Quick start

1. Install **Node.js 18+** (https://nodejs.org) and **Python 3.9+** (https://python.org) if you don't have them.
2. Edit **`config.json`** and set your site: `site.baseUrl` and `site.sitemapUrl`.
3. Double-click **`run.bat`**, pick mode `1` (Full Audit).

You can also run the steps individually:

```
python src/crawler/seo_audit.py --config config.json --cwd reports --output crawl_results.json
node src/speed/seo-speed-audit.js --config config.json --output reports/speed_results.json
node src/report/merge-report.js --config config.json --crawl reports/crawl_results.json --speed reports/speed_results.json --output reports
```

## Config reference (`config.json`)

| Section | Key | Meaning |
|---|---|---|
| `site` | `baseUrl` / `sitemapUrl` | The site to audit + sitemap location |
| `crawler` | `maxPages` | Max pages to crawl (raise for large stores) |
| | `userAgent` | `googlebot` (recommended), `chrome`, or `default` |
| | `robotsMode` | `respect` (like Googlebot) or `ignore` (full audit, tags blocked findings) |
| | `sampleLimit` / `autoSample` | Sampling for faceted-navigation query params |
| | `checkCanonicals` | Canonical presence / self-reference / trailing-slash / www checks |
| | `checkRedirectChains` | Redirect hops / chains detection |
| | `checkSoft404` | Heuristic soft-404 detection |
| | `checkSchema` | JSON-LD structured data detection & parsing |
| | `checkHreflang` | hreflang codes, x-default, self-reference checks |
| | `checkThinContent` | Word-count based thin content detection |
| | `minContentWords` | Threshold for thin content |
| | `sitemapValidation` | Sitemap XML health / lastmod validation |
| `speed` | `auditMode` | `light` (perf only) or `full` (perf + SEO + a11y + best-practices) |
| | `formFactor` | `mobile` or `desktop` |
| | `samplesPerCategory` | How many pages to Lighthouse-test per URL category |
| | `concurrency` | Parallel Lighthouse tests (raise carefully) |
| | `alwaysInclude` | URLs always tested (homepage) |
| `report` | `outputDir` | Where the final report goes |

## SEO audit coverage

The tool is built to mirror the **seo-audit skill** output format:

- **Executive summary** — average performance/SEO scores, issue counts by priority, top issues.
- **Technical SEO findings** — crawlability, indexation, canonicals, redirects, sitemap, security, URL structure, schema, hreflang.
- **On-page SEO findings** — titles, meta descriptions, headings, images, internal links.
- **Content findings** — thin content, soft 404s.
- **Speed & Core Web Vitals** — per-page table with LCP/INP/CLS/TBT/TTFB/FCP + chart.
- **Prioritized action plan** — critical fixes, high-impact improvements, quick wins.

### What requires human judgment (not measurable by code)

These skill areas are handled by having an AI (or the seo-audit skill) interpret the output:

- E-E-A-T signals & content quality
- Keyword targeting / cannibalization
- International SEO strategy (the crawler checks hreflang syntax, not strategy)
- Index status (needs Google Search Console access)

## Troubleshooting

- **`run.bat` closes instantly** — this was a known Windows bug: the `npm.cmd` shim swallows the rest of the batch file. Fixed by calling npm through `cmd /c "npm ..."`. If you still see it, run `run.bat` from a terminal to read the error before `pause`.
- **Lighthouse not found** — `run.bat` auto-installs Node packages on first run (`npm install`). If you're offline and no copy exists, install manually: `npm install --no-fund --no-audit`.
- **Crawl too slow** — lower `crawler.delayBetweenRequests`, disable `checkExternalLinks`, or lower `maxPages`.
- **Report empty** — confirm both raw JSON files have data before running the merge step.