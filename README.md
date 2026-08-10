# SEO Audit Pro

An integrated, Windows-local SEO audit tool that combines two engines into one pipeline:

1. **Technical crawler** (Python, `crawler/seo_audit.py`) — crawls the whole site as Googlebot, validating on-page + technical SEO (robots.txt, sitemap, canonicals, redirect chains, soft 404s, schema, hreflang, thin content, internal links / orphans, titles, meta descriptions, headings, images, security headers, response codes, URL structure).
2. **Core Web Vitals engine** (Node/Lighthouse, `speed/seo-speed-audit.js`) — runs real Lighthouse tests on sampled pages (LCP, INP, CLS, TBT, TTFB, FCP, Speed Index, page size, requests, opportunities).
3. **Merge & report builder** (`report/merge-report.js`) — combines both outputs into one unified HTML report with an executive summary, technical/on-page/content findings, speed table, and a prioritized action plan.

Everything runs locally on your Windows PC — no VPS, no paid service.

---

## Quick start

1. Install **Node.js 18+** (https://nodejs.org) and **Python 3.9+** (https://python.org) if you don't have them.
2. Edit **`config.json`** and set your site: `site.baseUrl` and `site.sitemapUrl`.
3. Double-click **`run.bat`**, pick mode `1` (Full Audit).

You can also run the steps individually:

```
python crawler/seo_audit.py --config config.json --output crawler/crawl_results.json
node speed/seo-speed-audit.js --config config.json --output speed/speed_results.json
node report/merge-report.js --config config.json --crawl crawler/crawl_results.json --speed speed/speed_results.json --output reports
```

---

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

---

## What the report includes (mirrors the seo-audit skill)

- **Executive summary** — average performance/SEO scores, issue counts by priority, top issues.
- **Technical SEO findings** — crawlability, indexation, canonicals, redirects, sitemap, security, URL structure, schema, hreflang.
- **On-page SEO findings** — titles, meta descriptions, headings, images, internal links.
- **Content findings** — thin content, soft 404s.
- **Speed & Core Web Vitals** — per-page table with LCP/INP/CLS/TBT/TTFB/FCP + chart.
- **Prioritized action plan** — critical fixes, high-impact improvements, quick wins.

## What requires judgment (not measurable by code)

These skill areas are handled by having an AI (or the [seo-audit skill](seo-audit-skill/SKILL.md)) interpret the output:

- E-E-A-T signals & content quality
- Keyword targeting / cannibalization
- International SEO strategy (the crawler checks hreflang syntax, not strategy)
- Index status (needs Google Search Console access)

---

## Outputs

- `reports/report-*.html` — the unified visual report (open in any browser).
- `reports/raw-*.json` — merged structured data for further processing.
- `crawler/seo_issues_summary.csv`, `crawler/seo_issues_detail.csv` — crawl findings as CSV.
- `crawler/crawl_results.json`, `speed/speed_results.json` — raw per-engine outputs.

## Troubleshooting

- **Lighthouse not found** → `run.bat` auto-installs it, or the tool falls back to the bundled worker's `node_modules`. If you're offline and no copy exists, run `npm install lighthouse chrome-launcher --no-fund --no-audit`.
- **Crawl too slow** → lower `crawler.delayBetweenRequests`, disable `checkExternalLinks`, or raise `sampleLimit` and lower `maxPages`.
- **Report empty** → confirm both raw JSON files have data before running the merge step.