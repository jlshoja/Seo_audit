#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extended SEO Auditor - Integrated Technical SEO Crawl
Features:
- Full site crawl with robots.txt awareness
- Canonical tag validation
- Redirect chain/loop detection
- Soft 404 detection
- XML Sitemap validation
- Structured data (JSON-LD) detection
- Hreflang validation
- Thin content detection (word counts)
- Internal link analysis (orphan detection, link depth)
- Security headers
- Response codes with error categorization
- Resume/checkpoint support
- URL sampling for faceted navigation
"""

import os
import sys
import csv
import json
import time
import signal
import re
import argparse
from collections import defaultdict, deque
from urllib.parse import urljoin, urlparse, parse_qs
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

DEFAULT_CONFIG = {
    "max_pages": 500,
    "request_timeout": 15,
    "delay_between_requests": 1.0,
    "max_retries": 3,
    "backoff_factor": 1.5,
    "user_agent": "googlebot",
    "robots_mode": "respect",
    "check_external_links": False,
    "external_link_timeout": 10,
    "auto_sample": True,
    "sample_limit": 3,
    "sample_params": [],
    "check_canonicals": True,
    "check_redirect_chains": True,
    "check_soft404": True,
    "check_schema": True,
    "check_hreflang": True,
    "check_thin_content": True,
    "min_content_words": 200,
    "sitemap_validation": True,
    "check_schema_types": True,
    "check_https": True,
    "check_mixed_content": True,
    "check_link_depth": True,
    "max_link_depth": 3,
    "page_type_patterns": {},
    "state_file": "crawl_state.json",
    "detail_csv_file": "seo_issues_detail.csv",
    "summary_csv_file": "seo_issues_summary.csv",
    "checkpoint_every_n_pages": 25,
}

USER_AGENTS = {
    "default": "Mozilla/5.0 (compatible; LocalSEOAudit/1.0; +https://example.com/bot)",
    "googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "chrome": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
}

SECURITY_HEADERS = [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "Referrer-Policy",
]

SOFT_404_PATTERNS = [
    r"page not found",
    r"404.*error",
    r"not found",
    r"doesn't exist",
    r"no results",
    r"empty",
    r"page you requested",
    r"cannot be found",
    r"nothing here",
    r"nothing found",
    r"missing page",
    r"oops",
]


class GoogleStyleRobotsParser:
    """Minimal robots.txt parser supporting Google's wildcard syntax."""

    def __init__(self, robots_txt_text):
        self.disallow_patterns = []
        self.allow_patterns = []
        self._parse(robots_txt_text)

    def _parse(self, text):
        applicable = False
        for raw_line in text.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            field, _, value = line.partition(":")
            field = field.strip().lower()
            value = value.strip()
            if field == "user-agent":
                applicable = (value == "*")
            elif applicable and field == "disallow" and value:
                self.disallow_patterns.append(value)
            elif applicable and field == "allow" and value:
                self.allow_patterns.append(value)

    @staticmethod
    def _pattern_matches(pattern, path):
        end_anchor = pattern.endswith("$")
        if end_anchor:
            pattern = pattern[:-1]
        regex = "^" + re.escape(pattern).replace(r"\*", ".*")
        if end_anchor:
            regex += "$"
        return re.match(regex, path) is not None

    def can_fetch(self, url):
        parsed = urlparse(url)
        path = parsed.path or "/"
        if parsed.query:
            path += "?" + parsed.query
        best_match_len = -1
        allowed = True
        for pattern in self.disallow_patterns:
            if self._pattern_matches(pattern, path) and len(pattern) > best_match_len:
                best_match_len = len(pattern)
                allowed = False
        for pattern in self.allow_patterns:
            if self._pattern_matches(pattern, path) and len(pattern) > best_match_len:
                best_match_len = len(pattern)
                allowed = True
        return allowed


def normalize_url(url):
    parsed = urlparse(url)
    path = parsed.path if parsed.path else "/"
    normalized = f"{parsed.scheme}://{parsed.netloc}{path}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    return normalized


def strip_protocol(url):
    """Normalize for comparison: drop scheme, www, and trailing slash."""
    return re.sub(r"^[a-z]+://", "", url).replace("www.", "").rstrip("/")


def is_external(url, domain):
    return urlparse(url).netloc != domain


def classify_page_type(url, patterns=None):
    """Guess the template type of an internal URL from its path.
    Used for template-aware checks (e.g. products must have Product schema)."""
    path = urlparse(url).path.lower()
    p = patterns or {}
    for key, keywords in p.items():
        for kw in keywords:
            if kw in path:
                return key
    if path == "/" or path == "":
        return "home"
    if any(seg in path for seg in ("/product/", "/p/", "/item/", "/shop/", "/goods/")):
        return "product"
    if any(seg in path for seg in ("/blog/", "/news/", "/article/", "/post/", "/%d8%a8%d9%84%d8%a7%da%af")):
        return "blog"
    if any(seg in path for seg in ("/category/", "/collections/", "/%da%af%d8%b1%d9%88%d9%87", "/%d8%af%d8%b3%d8%aa%d9%87")):
        return "category"
    if any(seg in path for seg in ("/cart", "/basket", "/%d8%b3%d8%a8%d8%af")):
        return "cart"
    if any(seg in path for seg in ("/checkout", "/%d9%be%d8%b1%d8%af%d8%a7%d8%ae%d8%aa")):
        return "checkout"
    if any(seg in path for seg in ("/my-account", "/account", "/login", "/register", "/%d8%ad%d8%b3%d8%a7%d8%a8")):
        return "account"
    if any(seg in path for seg in ("/search", "?s=", "/%d8%ac%d8%b3%d8%aa%d8%ac%d9%88")):
        return "search"
    return "other"


class SEOAuditor:
    def __init__(self, config, resume=False):
        self.cfg = {**DEFAULT_CONFIG, **config}
        self.start_url = (self.cfg.get("start_url") or "").rstrip("/")
        if self.cfg.get("sitemap_url"):
            self.sitemap_url = self.cfg["sitemap_url"]
        else:
            self.sitemap_url = self.start_url.rstrip("/") + "/sitemap.xml"
        if not self.start_url:
            raise ValueError("start_url required in config")
        self.domain = urlparse(self.start_url).netloc
        self.resume = resume
        self._interrupted = False
        self._pages_since_checkpoint = 0

        self.visited = set()
        self.to_visit = deque([self.start_url])
        self.depth = {self.start_url: 0}
        self.fetched_count = 0
        self.robots_skipped_count = 0
        self.sample_skipped_count = 0
        self.url_blocked_status = {}

        self.session = requests.Session()
        ua = USER_AGENTS.get(self.cfg["user_agent"], USER_AGENTS["default"])
        self.session.headers.update({"User-Agent": ua})

        self.auto_sample_all = self.cfg["auto_sample"]
        self.sample_params = set(self.cfg["sample_params"])
        self.sample_limit = self.cfg["sample_limit"]
        self.sample_counts = defaultdict(int)

        self.robots_mode = self.cfg["robots_mode"]
        self.robot_parser = None
        self._load_robots_txt()

        self.titles_seen = defaultdict(list)
        self.h1_seen = defaultdict(list)
        self.meta_desc_seen = defaultdict(list)
        self.canonicals_seen = defaultdict(list)
        self.internal_link_counts = defaultdict(int)
        self.inbound_links = defaultdict(set)
        self.external_link_cache = {}
        self.issues = []
        self.page_data = {}
        self.transition_chain = {}

        self._page_issue_buffer = defaultdict(list)
        self._current_page_blocked = False
        self._current_url = None

        self._detail_file = None
        self._detail_writer = None

        signal.signal(signal.SIGINT, self._handle_interrupt)

        loaded = False
        if self.resume and os.path.exists(self.cfg["state_file"]):
            loaded = self._load_checkpoint()
            if loaded:
                age_hours = (time.time() - os.path.getmtime(self.cfg["state_file"])) / 3600
                if age_hours > 24:
                    print(f"Warning: checkpoint is {age_hours:.1f} hours old. The site may have "
                          "changed since; consider a fresh crawl instead of --resume.")

        self._open_detail_writer(append=loaded)

    # ---------- Checkpoint / Resume ----------
    def _handle_interrupt(self, signum, frame):
        if self._interrupted:
            print("\nForce-quitting without saving further progress.")
            sys.exit(1)
        print("\n\nCtrl+C received. Finishing current page, then stopping safely...")
        print("(Press Ctrl+C again to force-quit immediately.)")
        self._interrupted = True

    def _open_detail_writer(self, append):
        mode = "a" if append and os.path.exists(self.cfg["detail_csv_file"]) else "w"
        write_header = (mode == "w")
        self._detail_file = open(self.cfg["detail_csv_file"], mode, newline="", encoding="utf-8-sig")
        self._detail_writer = csv.writer(self._detail_file)
        if write_header:
            self._detail_writer.writerow(
                ["Issue Name", "Issue Type", "Issue Priority", "URL", "Detail", "Blocked By robots.txt"]
            )
        else:
            print(f"Resuming: appending to {self.cfg['detail_csv_file']}")
            self._reload_previous_issues()

    def _reload_previous_issues(self):
        try:
            with open(self.cfg["detail_csv_file"], "r", newline="", encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                next(reader, None)
                for row in reader:
                    if len(row) != 6:
                        continue
                    name, itype, priority, url, detail, blocked_str = row
                    blocked = blocked_str.strip().lower() == "true"
                    self.issues.append((name, itype, priority, url, detail, blocked))
        except FileNotFoundError:
            pass

    def _save_checkpoint(self):
        state = {
            "start_url": self.start_url,
            "config": {
                "user_agent": self.cfg["user_agent"],
                "robots_mode": self.cfg["robots_mode"],
                "max_pages": self.cfg["max_pages"],
                "check_external_links": self.cfg["check_external_links"],
                "sample_params": sorted(self.sample_params),
                "sample_limit": self.sample_limit,
                "auto_sample_all": self.auto_sample_all,
            },
            "visited": list(self.visited),
            "to_visit": list(self.to_visit),
            "titles_seen": {k: list(v) for k, v in self.titles_seen.items()},
            "h1_seen": {k: list(v) for k, v in self.h1_seen.items()},
            "meta_desc_seen": {k: list(v) for k, v in self.meta_desc_seen.items()},
            "canonicals_seen": {k: list(v) for k, v in self.canonicals_seen.items()},
            "internal_link_counts": dict(self.internal_link_counts),
            "inbound_links": {k: list(v) for k, v in self.inbound_links.items()},
            "url_blocked_status": self.url_blocked_status,
            "robots_skipped_count": self.robots_skipped_count,
            "sample_counts": [[k, v] for k, v in self.sample_counts.items()],
            "sample_skipped_count": self.sample_skipped_count,
            "fetched_count": self.fetched_count,
            "page_data": self.page_data,
            "transition_chain": self.transition_chain,
        }
        tmp_path = self.cfg["state_file"] + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp_path, self.cfg["state_file"])

    def _load_checkpoint(self):
        try:
            with open(self.cfg["state_file"], "r", encoding="utf-8") as f:
                state = json.load(f)
        except (OSError, json.JSONDecodeError):
            print("Could not read checkpoint. Starting fresh crawl.")
            return False

        if state.get("start_url") != self.start_url:
            print("Checkpoint is for a different URL. Starting fresh crawl.")
            return False

        self.visited = set(state.get("visited", []))
        self.to_visit = deque(state.get("to_visit", [self.start_url]))
        self.titles_seen = defaultdict(list, state.get("titles_seen", {}))
        self.h1_seen = defaultdict(list, state.get("h1_seen", {}))
        self.meta_desc_seen = defaultdict(list, state.get("meta_desc_seen", {}))
        self.canonicals_seen = defaultdict(list, state.get("canonicals_seen", {}))
        self.internal_link_counts = defaultdict(int, state.get("internal_link_counts", {}))
        self.inbound_links = defaultdict(set, {k: set(v) for k, v in state.get("inbound_links", {}).items()})
        self.url_blocked_status = state.get("url_blocked_status", {})
        self.robots_skipped_count = state.get("robots_skipped_count", 0)
        self.sample_skipped_count = state.get("sample_skipped_count", 0)
        self.fetched_count = state.get("fetched_count", 0)
        self.page_data = state.get("page_data", {})
        self.transition_chain = state.get("transition_chain", {})
        self.sample_counts = defaultdict(int)
        for entry in state.get("sample_counts", []):
            if len(entry) == 2:
                self.sample_counts[entry[0]] += entry[1]
        print(f"Resuming previous crawl: {self.fetched_count} page(s) fetched, "
              f"{len(self.to_visit)} still queued.")
        return True

    def _load_robots_txt(self):
        robots_url = f"{urlparse(self.start_url).scheme}://{self.domain}/robots.txt"
        try:
            resp = self.session.get(robots_url, timeout=self.cfg["request_timeout"])
            if resp.status_code == 200:
                self.robot_parser = GoogleStyleRobotsParser(resp.text)
                # Record robots.txt for sitemap validation report
                self.robots_txt_text = resp.text
                print(f"Loaded robots.txt: {robots_url}")
            else:
                print(f"No robots.txt found (status {resp.status_code}). Treating all URLs as allowed.")
                self.robot_parser = None
                self.robots_txt_text = ""
        except requests.RequestException as e:
            print(f"Could not fetch robots.txt ({type(e).__name__}). Treating all URLs as allowed.")
            self.robot_parser = None
            self.robots_txt_text = ""

    def is_allowed_by_robots(self, url):
        if self.robot_parser is None:
            return True
        try:
            return self.robot_parser.can_fetch(url)
        except Exception:
            return True

    def get_sampling_keys(self, url):
        parsed = urlparse(url)
        if not parsed.query:
            return []
        qs = parse_qs(parsed.query)
        if self.auto_sample_all:
            return list(qs.keys())
        if not self.sample_params:
            return []
        return [name for name in self.sample_params if name in qs]

    def add_issue(self, name, issue_type, priority, url, detail=""):
        blocked = (self._current_page_blocked or self.url_blocked_status.get(url, False))
        tag = "[BLOCKED BY ROBOTS.TXT - not seen by Google] " if blocked else ""
        row = (name, issue_type, priority, url, f"{tag}{detail}", blocked)
        self.issues.append(row)
        self._detail_writer.writerow(row)
        self._detail_file.flush()

    def buffer_issue(self, name, issue_type, priority, url, detail=""):
        self._page_issue_buffer[(name, issue_type, priority, url)].append(detail)

    def _flush_page_issue_buffer(self):
        for (name, issue_type, priority, url), details in self._page_issue_buffer.items():
            count = len(details)
            if count == 1:
                detail_text = details[0]
            else:
                shown = [d for d in details[:5] if d]
                detail_text = f"{count} instance(s) found."
                if shown:
                    detail_text += " Examples: " + "; ".join(shown)
                    remaining = count - len(shown)
                    if remaining > 0:
                        detail_text += f" (+{remaining} more)"
            self.add_issue(name, issue_type, priority, url, detail_text)
        self._page_issue_buffer = defaultdict(list)

    def is_internal(self, url):
        return urlparse(url).netloc == self.domain

    def fetch_url(self, url):
        for attempt in range(self.cfg["max_retries"]):
            try:
                resp = self.session.get(url, timeout=self.cfg["request_timeout"], allow_redirects=True)
                if 500 <= resp.status_code < 600 and attempt < self.cfg["max_retries"] - 1:
                    wait_time = self.cfg["backoff_factor"] ** attempt
                    print(f"    [!] Server error {resp.status_code}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                return resp
            except requests.RequestException as e:
                if attempt == self.cfg["max_retries"] - 1:
                    raise e
                wait_time = self.cfg["backoff_factor"] ** attempt
                print(f"    [!] Network error: {type(e).__name__}. Retrying in {wait_time}s...")
                time.sleep(wait_time)

    def crawl(self):
        print(f"Starting crawl: {self.start_url}")
        print(f"Using User-Agent: {self.session.headers['User-Agent']}")
        print(f"robots.txt mode: {self.robots_mode.upper()}")
        print(f"Max pages to crawl: {self.cfg['max_pages']}")

        if self.cfg["sitemap_validation"]:
            self.validate_sitemap()

        count = self.fetched_count
        stopped_by_interrupt = False

        while self.to_visit and count < self.cfg["max_pages"]:
            if self._interrupted:
                stopped_by_interrupt = True
                break

            url = self.to_visit.popleft()
            if url in self.visited:
                continue
            self.visited.add(url)

            sample_keys = self.get_sampling_keys(url)
            if sample_keys:
                over_limit_keys = [k for k in sample_keys if self.sample_counts[k] >= self.sample_limit]
                if over_limit_keys:
                    self.sample_skipped_count += 1
                    print(f"[--] Skipped (sampling limit reached for "
                          f"{', '.join(sorted(set(over_limit_keys)))}): {url}")
                    continue
                for k in sample_keys:
                    self.sample_counts[k] += 1

            blocked = not self.is_allowed_by_robots(url)

            if blocked and self.robots_mode == "respect":
                self.robots_skipped_count += 1
                print(f"[--] Skipped (blocked by robots.txt): {url}")
                continue

            count += 1
            self.fetched_count = count
            if blocked:
                print(f"[{count}] Checking (BLOCKED BY ROBOTS.TXT, audit mode): {url}")
            else:
                print(f"[{count}] Checking: {url}")
            self.url_blocked_status[url] = blocked
            self.check_page(url, blocked_by_robots=blocked)
            time.sleep(self.cfg["delay_between_requests"])

            self._pages_since_checkpoint += 1
            if self._pages_since_checkpoint >= self.cfg["checkpoint_every_n_pages"]:
                self._save_checkpoint()
                self._pages_since_checkpoint = 0

        if stopped_by_interrupt:
            self._save_checkpoint()
            print(f"\nStopped by user. Progress saved to {self.cfg['state_file']}.")
            print(f"Findings so far already in {self.cfg['detail_csv_file']}.")
            print("Run again with --resume to continue.")
            self._close()
            sys.exit(0)

        self.check_cross_page_duplicates()
        self.check_canonical_cross_page()
        self.check_orphans()
        self.check_link_depth()
        self.check_https_hsts()
        self.check_mixed_content()
        print(f"\nCrawl finished. Pages actually fetched: {self.fetched_count}")
        print(f"Total URLs discovered and de-duplicated: {len(self.visited)}")
        if self.robots_mode == "respect" and self.robots_skipped_count:
            print(f"Pages skipped due to robots.txt: {self.robots_skipped_count}")
        if self.sample_skipped_count:
            print(f"Pages skipped due to sampling limit: {self.sample_skipped_count}")

        if self.to_visit and count >= self.cfg["max_pages"]:
            print(f"NOTE: Stopped because max-pages limit ({self.cfg['max_pages']}) reached.")
            print(f"      {len(self.to_visit)} more discovered URL(s) were NOT checked.")
            self._save_checkpoint()
        else:
            if os.path.exists(self.cfg["state_file"]):
                os.remove(self.cfg["state_file"])

    def _close(self):
        if self._detail_file:
            self._detail_file.close()

    # ===================== SITEMAP VALIDATION =====================
    def validate_sitemap(self):
        print(f"\nValidating sitemap: {self.sitemap_url}")
        try:
            resp = self.session.get(self.sitemap_url, timeout=self.cfg["request_timeout"])
        except requests.RequestException as e:
            self.add_issue("Sitemap: Fetch Failed", "Issue", "High", self.sitemap_url, str(e))
            return

        if resp.status_code != 200:
            self.add_issue("Sitemap: HTTP Error", "Issue", "High", self.sitemap_url,
                           f"status={resp.status_code}")
            return

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError as e:
            self.add_issue("Sitemap: Invalid XML", "Issue", "High", self.sitemap_url, str(e))
            return

        ns_sitemap = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        is_index = root.tag == f"{ns_sitemap}sitemapindex"

        urls = root.findall(f"{ns_sitemap}url")
        sitemaps = root.findall(f"{ns_sitemap}sitemap")
        locs = [u.findtext(f"{ns_sitemap}loc") for u in urls]
        lastmods = [u.findtext(f"{ns_sitemap}lastmod") for u in urls]

        if is_index:
            print(f"  Sitemap index with {len(sitemaps)} child sitemaps")
            if not sitemaps:
                self.add_issue("Sitemap: Empty Index", "Issue", "Medium", self.sitemap_url)
        else:
            print(f"  Sitemap with {len(urls)} URLs")
            if not urls:
                self.add_issue("Sitemap: Empty", "Issue", "Medium", self.sitemap_url)
            missing_lastmod = sum(1 for lm in lastmods if not lm)
            if missing_lastmod:
                self.add_issue("Sitemap: Missing Lastmod", "Warning", "Low", self.sitemap_url,
                               f"{missing_lastmod}/{len(urls)} entries lack <lastmod>")

        self.sitemap_urls = [u for u in locs if u]
        self.sitemap_is_index = is_index

    # ===================== PAGE CHECK =====================
    def check_page(self, url, blocked_by_robots=False):
        self._current_page_blocked = blocked_by_robots
        self._current_url = url
        self._page_issue_buffer = defaultdict(list)

        # Record page type and depth
        page_type = classify_page_type(url, self.cfg.get("page_type_patterns") or None)
        self.page_data.setdefault(url, {})["page_type"] = page_type
        self.page_data.setdefault(url, {})["link_depth"] = self.depth.get(url, 0)

        try:
            resp = self.fetch_url(url)
        except requests.exceptions.Timeout as e:
            self.add_issue("Response Codes: Internal Timeout", "Issue", "Medium", url, str(e))
            return
        except requests.exceptions.ConnectionError as e:
            self.add_issue("Response Codes: Connection Error / Refused", "Issue", "High", url, str(e))
            return
        except requests.exceptions.ProxyError as e:
            self.add_issue("Response Codes: Proxy Error", "Issue", "High", url, str(e))
            return
        except requests.RequestException as e:
            self.add_issue("Response Codes: Internal No Response (Other)", "Issue", "High", url, str(e))
            return

        status = resp.status_code
        url_after_redirect = resp.url

        self.response_times = getattr(self, "response_times", [])
        self.response_times.append(resp.elapsed.total_seconds() * 1000)
        self.page_data.setdefault(url, {}).update({
            "status_code": status,
            "final_url": url_after_redirect,
            "response_headers": dict(resp.headers),
        })

        # Redirect chain detection via resp.history (requests records each hop)
        if self.cfg["check_redirect_chains"] and len(resp.history) > 0:
            hops = [h.headers.get("Location", "") for h in resp.history]
            chain_desc = " -> ".join([url] + hops + [resp.url])
            self.transition_chain[url] = resp.url
            if len(resp.history) >= 4:
                self.add_issue("Links: Redirect Chain", "Warning", "Medium", url,
                               f"{len(resp.history)} hops: {chain_desc}")
            if len(resp.history) > 1:
                self.add_issue("Links: Redirect with Multiple Hops", "Opportunity", "Low", url,
                               f"{len(resp.history)} hops: {chain_desc}")

        if 300 <= status < 400:
            self.add_issue("Response Codes: Client Redirect (3xx)", "Warning", "Low", url, f"status={status}")
        elif 400 <= status < 500:
            self.add_issue("Response Codes: Internal Client Error (4xx)", "Issue", "High", url, f"status={status}")
        elif status >= 500:
            self.add_issue("Response Codes: Internal Server Error (5xx)", "Issue", "High", url, f"status={status}")

        if status == 200 and self.cfg["check_soft404"]:
            self._check_soft404(resp.text, url)

        if status != 200:
            return

        for header in SECURITY_HEADERS:
            if header not in resp.headers:
                self.add_issue(f"Security: Missing {header} Header", "Warning", "Low", url)

        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            return

        soup = BeautifulSoup(resp.text, "html.parser")

        if self.cfg.get("check_mixed_content", True) and url_after_redirect.startswith("https://"):
            self.page_data.setdefault(url, {})["mixed_content_count"] = len(
                re.findall(r'(?:src|href)=["\']http://', resp.text, re.IGNORECASE))

        self.check_title(soup, url)
        self.check_meta_description(soup, url)
        self.check_headings(soup, url)
        self.check_images(soup, url, url_after_redirect)
        self.check_links(soup, url, url_after_redirect)
        self.check_internal_links(soup, url, url_after_redirect)
        self.check_noindex(soup, url)
        self.check_url_format(url)
        self.check_multiple_head_body(resp.text, url)

        if self.cfg["check_canonicals"]:
            self.check_canonical(soup, url)
        if self.cfg["check_schema"]:
            self.check_schema(soup, url)
        if self.cfg["check_hreflang"]:
            self.check_hreflang(soup, url)
        if self.cfg["check_thin_content"]:
            self.check_content_depth(soup, url)

        for link in soup.find_all("a", href=True):
            href = urljoin(url_after_redirect, link["href"])
            href = normalize_url(href)
            if self.is_internal(href) and href not in self.visited and href.startswith("http"):
                if href not in self.to_visit:
                    self.to_visit.append(href)
                    self.depth[href] = self.depth.get(url, 0) + 1

        self._flush_page_issue_buffer()

    # ---------- Soft 404 ----------
    def _check_soft404(self, html_text, url):
        if len(html_text) < 500:
            return
        text = re.sub(r"<[^>]+>", " ", html_text).lower()
        matches = [p for p in SOFT_404_PATTERNS if re.search(p, text)]
        if len(matches) >= 3:
            self.add_issue("Content: Likely Soft 404", "Issue", "Medium", url,
                           f"Matching patterns: {', '.join(matches[:4])}")

    # ---------- Canonicals ----------
    def check_canonical(self, soup, url):
        tags = soup.find_all("link", rel="canonical")
        if len(tags) == 0:
            self.add_issue("Canonicalization: Missing Canonical", "Warning", "Medium", url)
            return
        if len(tags) > 1:
            self.add_issue("Canonicalization: Multiple Canonicals", "Issue", "High", url,
                           f"count: {len(tags)}")

        canon = tags[0].get("href", "").strip()
        if not canon:
            self.add_issue("Canonicalization: Empty Canonical", "Issue", "High", url)
            return

        canon_norm = strip_protocol(canon)
        url_norm = strip_protocol(url)

        if canon_norm == url_norm:
            self.canonicals_seen[canon].append(url)  # self-referencing, record for cross-page check
            return

        self.canonicals_seen[canon].append(url)
        self.add_issue("Canonicalization: Canonical Points Elsewhere", "Warning", "Low", url,
                       f"canonical={canon}")

        # Trailing slash mismatch
        if canon_norm.rstrip("/") == url_norm.rstrip("/"):
            self.add_issue("Canonicalization: Trailing Slash Mismatch", "Opportunity", "Low", url,
                           f"canonical={canon} vs url={url}")

        # www mismatch
        if re.sub(r"^www\.", "", canon_norm) != re.sub(r"^www\.", "", url_norm):
            self.add_issue("Canonicalization: WWW/Non-WWW Mismatch", "Opportunity", "Low", url,
                           f"canonical={canon} vs url={url}")

    def check_canonical_cross_page(self):
        for canon, urls in self.canonicals_seen.items():
            if len(urls) > 1:
                for u in urls:
                    self.add_issue("Canonicalization: Multiple Pages Point to Same Canonical",
                                   "Opportunity", "Low", u,
                                   f"canonical={canon} shared by {len(urls)} page(s)")

    # ---------- Schema ----------
    def check_schema(self, soup, url):
        ld_json = soup.find_all("script", {"type": "application/ld+json"})
        if not ld_json:
            self.add_issue("Schema: No Structured Data", "Opportunity", "Low", url)
            return
        valid = 0
        invalid = 0
        types = []
        for script in ld_json:
            raw = script.string or ""
            if not raw.strip():
                continue
            try:
                data = json.loads(raw)
                valid += 1
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("@type"):
                            types.append(item["@type"])
                elif isinstance(data, dict) and data.get("@type"):
                    types.append(data["@type"])
            except json.JSONDecodeError:
                invalid += 1
        if invalid:
            self.add_issue("Schema: Invalid JSON-LD", "Issue", "Medium", url,
                           f"{invalid} malformed block(s)")
        if valid:
            self.page_data.setdefault(url, {})["schema_types"] = types[:5]

        # Schema validation against expected rich-result types per page type
        if self.cfg.get("check_schema_types", True):
            page_type = self.page_data.get(url, {}).get("page_type", "other")
            expected = {
                "product": {"Product", "Offer"},
                "blog": {"Article", "BlogPosting"},
                "category": {"ItemList", "BreadcrumbList"},
                "home": {"Organization", "WebSite"},
            }.get(page_type, set())
            if expected:
                found = set(types)
                missing = expected - found
                for miss in missing:
                    self.add_issue(f"Schema: Missing {miss} Markup on {page_type.title()} Page",
                                   "Issue", "Medium", url,
                                   f"expected {', '.join(sorted(expected))}")

    # ---------- Hreflang ----------
    def check_hreflang(self, soup, url):
        links = soup.find_all("link", rel=True)
        hreflangs = [l for l in links if "hreflang" in (l.get("rel") or [])]
        if not hreflangs:
            # Only report as missing if the site is multilingual (heuristic: has hreflang elsewhere)
            return

        self.page_data.setdefault(url, {})["hreflangs"] = [l.get("hreflang") for l in hreflangs]
        codes = [l.get("hreflang", "").strip() for l in hreflangs]
        hrefs = [l.get("href", "").strip() for l in hreflangs]

        if "x-default" not in codes:
            self.add_issue("Hreflang: Missing x-default", "Warning", "Medium", url)

        for code in codes:
            if code and code != "x-default":
                lang = code.split("-")[0]
                if len(lang) != 2 or not lang.isalpha():
                    self.add_issue(f"Hreflang: Invalid Code", "Issue", "Medium", url, f"code={code}")
                elif code.count("-") >= 2:
                    self.add_issue("Hreflang: Over-specified Code", "Warning", "Low", url, f"code={code}")

        # Self-referencing check: page must include itself in hreflang set
        url_norm = strip_protocol(url)
        self_ref = any(strip_protocol(h) == url_norm for h in hrefs)
        if not self_ref:
            self.add_issue("Hreflang: Missing Self-Reference", "Warning", "Medium", url,
                           "Page must include itself in its hreflang set")

        # Check duplicate codes pointing to different URLs
        seen_code_url = {}
        for code, href in zip(codes, hrefs):
            if code in seen_code_url and seen_code_url[code] != href:
                self.add_issue("Hreflang: Duplicate Code, Different URLs", "Issue", "High", url,
                               f"code={code}")
            seen_code_url[code] = href

        # Check reciprocal (pointing to external locales we can't verify, just note)
        self.page_data.setdefault(url, {})["has_hreflang"] = True

    # ---------- Content depth / thin content ----------
    def check_content_depth(self, soup, url):
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            tag.decompose()
        main_area = soup.find("main") or soup.find("article") or soup.body or soup
        text = main_area.get_text(" ", strip=True)
        word_count = len(text.split())

        self.page_data.setdefault(url, {})["word_count"] = word_count

        min_words = self.cfg["min_content_words"]
        if word_count < min_words:
            self.add_issue("Content: Thin Content", "Warning", "Medium", url,
                           f"{word_count} words (min recommended: {min_words})")
        elif word_count < min_words * 0.6:
            self.add_issue("Content: Very Thin Content", "Issue", "High", url,
                           f"only {word_count} words")

    # ---------- Title ----------
    def check_title(self, soup, url):
        titles = soup.find_all("title")
        if len(titles) == 0:
            self.add_issue("Page Titles: Missing", "Issue", "High", url)
            return
        if len(titles) > 1:
            self.add_issue("Page Titles: Multiple", "Issue", "High", url, f"count: {len(titles)}")

        title_text = titles[0].get_text(strip=True)
        if not title_text:
            self.add_issue("Page Titles: Missing", "Issue", "High", url)
        else:
            if len(title_text) > 60:
                self.add_issue("Page Titles: Over 60 Characters", "Opportunity", "Medium", url,
                               f"length: {len(title_text)}")
            elif len(title_text) < 15:
                self.add_issue("Page Titles: Too Short", "Opportunity", "Low", url,
                               f"length: {len(title_text)}")
            self.titles_seen[title_text].append(url)
            self.page_data.setdefault(url, {})["title"] = title_text

    # ---------- Meta description ----------
    def check_meta_description(self, soup, url):
        meta = soup.find("meta", attrs={"name": "description"})
        if not meta or not meta.get("content", "").strip():
            self.add_issue("Meta Description: Missing", "Opportunity", "Low", url)
            return
        desc = meta["content"].strip()
        self.meta_desc_seen[desc].append(url)
        self.page_data.setdefault(url, {})["meta_description"] = desc
        if len(desc) < 70:
            self.add_issue("Meta Description: Below 70 Characters", "Opportunity", "Low", url,
                           f"length: {len(desc)}")
        if len(desc) > 155:
            self.add_issue("Meta Description: Over 155 Characters", "Opportunity", "Low", url,
                           f"length: {len(desc)}")

    # ---------- Headings ----------
    def check_headings(self, soup, url):
        h1s = soup.find_all("h1")
        if len(h1s) == 0:
            self.add_issue("H1: Missing", "Issue", "Medium", url)
        elif len(h1s) > 1:
            self.add_issue("H1: Multiple", "Warning", "Medium", url, f"count: {len(h1s)}")

        for h1 in h1s:
            text = h1.get_text(strip=True)
            if text:
                self.h1_seen[text].append(url)
                self.page_data.setdefault(url, {})["h1"] = text

        h2s = soup.find_all("h2")
        if len(h2s) == 0:
            self.add_issue("H2: Missing", "Warning", "Low", url)

        seen_h2 = defaultdict(int)
        for h2 in h2s:
            text = h2.get_text(strip=True)
            if text:
                seen_h2[text] += 1
        for text, c in seen_h2.items():
            if c > 1:
                self.add_issue("H2: Duplicate", "Opportunity", "Low", url,
                               f"duplicate text: {text[:50]}")

        # Heading level skipping detection
        levels = []
        for tag in soup.find_all(re.compile(r"^h[1-6]$")):
            levels.append(int(tag.name[1]))
        if levels and any(b - a > 1 for a, b in zip(levels, levels[1:])):
            self.add_issue("Headings: Skipped Levels", "Warning", "Low", url,
                           f"h-levels found: {levels}")

    # ---------- Images ----------
    def check_images(self, soup, url, base_url):
        for img in soup.find_all("img"):
            src = img.get("src")
            if not src:
                continue
            alt = img.get("alt")
            if alt is None:
                self.buffer_issue("Images: Missing Alt Attribute", "Issue", "Low", url, src)
            elif not alt.strip():
                self.buffer_issue("Images: Missing Alt Text", "Issue", "Low", url, src)

            if not img.get("width") or not img.get("height"):
                self.buffer_issue("Images: Missing Size Attributes", "Opportunity", "Low", url, src)

            if not img.get("loading") == "lazy":
                pass  # lazy not required on all images (esp. LCP); skip to avoid noise

            img_url = urljoin(base_url, src)
            if self.is_internal(img_url):
                try:
                    head = self.session.head(img_url, timeout=self.cfg["request_timeout"],
                                             allow_redirects=True)
                    size = int(head.headers.get("Content-Length", 0))
                    if size > 100 * 1024:
                        self.buffer_issue("Images: Over 100 kB", "Opportunity", "Medium", url,
                                          f"{src} ({size // 1024} kB)")
                except requests.RequestException:
                    pass

    # ---------- Links ----------
    def check_links(self, soup, url, base_url):
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
                continue
            full_url = urljoin(base_url, href)
            text = a.get_text(strip=True)
            rel = a.get("rel", [])

            if self.is_internal(full_url):
                if not text and not a.find("img"):
                    self.buffer_issue("Links: Internal Outlinks With No Anchor Text",
                                      "Opportunity", "Low", url, full_url)
                if "nofollow" in rel:
                    self.buffer_issue("Links: Internal Nofollow Outlinks", "Warning", "Low", url, full_url)
            else:
                if self.cfg["check_external_links"]:
                    self.check_external_link(full_url, url)

    def check_internal_links(self, soup, url, base_url):
        """Count internal outbound links per URL (for orphan detection)."""
        outbound = set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
                continue
            full_url = normalize_url(urljoin(base_url, href))
            if self.is_internal(full_url) and full_url.startswith("http"):
                outbound.add(full_url)
                self.inbound_links[full_url].add(url)
        self.internal_link_counts[url] = len(outbound)
        self.page_data.setdefault(url, {})["outbound_links"] = sorted(outbound)

    def check_external_link(self, link_url, source_page_url):
        if link_url in self.external_link_cache:
            ok = self.external_link_cache[link_url]
        else:
            ok = True
            try:
                resp = self.session.head(link_url, timeout=self.cfg["external_link_timeout"],
                                         allow_redirects=True)
                if resp.status_code >= 400:
                    resp = self.session.get(link_url, timeout=self.cfg["external_link_timeout"],
                                            allow_redirects=True)
                if resp.status_code >= 400:
                    ok = False
            except requests.RequestException:
                ok = False
            self.external_link_cache[link_url] = ok

        if not ok:
            self.add_issue("Response Codes: External No Response", "Warning", "Low",
                           source_page_url, link_url)

    # ---------- Noindex ----------
    def check_noindex(self, soup, url):
        robots = soup.find("meta", attrs={"name": "robots"})
        if robots and "noindex" in robots.get("content", "").lower():
            detail_msg = ("Page has noindex directive. WARNING: This is based on crawler response; "
                          "verify with Google Search Console before taking action.")
            self.add_issue("Directives: Noindex", "Warning", "High", url, detail_msg)

    # ---------- URL format ----------
    def check_url_format(self, url):
        if " " in url or "%20" in url:
            self.add_issue("URL: Contains Space", "Issue", "Low", url)
        if "_" in url:
            self.add_issue("URL: Underscores", "Opportunity", "Low", url)
        if "?" in url:
            self.add_issue("URL: Parameters", "Warning", "Low", url)
        if len(url) > 100:
            self.add_issue("URL: Over 100 Characters", "Opportunity", "Low", url,
                           f"length: {len(url)}")
        try:
            url.encode("ascii")
        except UnicodeEncodeError:
            self.add_issue("URL: Non ASCII Characters", "Warning", "Low", url)

    # ---------- HTML structure ----------
    def check_multiple_head_body(self, html_text, url):
        self._check_duplicate_tag(html_text, "head", "HTML: Multiple <head> Tags", url)
        self._check_duplicate_tag(html_text, "body", "HTML: Multiple <body> Tags", url)
        self._check_duplicate_tag(html_text, "html", "HTML: Multiple <html> Tags", url)

    def _check_duplicate_tag(self, html_text, tag_name, issue_name, url):
        matches = list(re.finditer(rf"<{tag_name}[\s>]", html_text, re.IGNORECASE))
        if len(matches) <= 1:
            return
        self.add_issue(issue_name, "Issue", "High", url, f"count: {len(matches)}")

    # ---------- Cross-page checks ----------
    def check_cross_page_duplicates(self):
        for title, urls in self.titles_seen.items():
            if len(urls) > 1:
                for u in urls:
                    if not title:
                        continue
                    self._current_page_blocked = self.url_blocked_status.get(u, False)
                    self.add_issue("Page Titles: Duplicate", "Opportunity", "Medium", u,
                                   f"duplicate with {len(urls)-1} other page(s): {title[:60]}")
        for h1text, urls in self.h1_seen.items():
            if len(urls) > 1:
                for u in urls:
                    self._current_page_blocked = self.url_blocked_status.get(u, False)
                    self.add_issue("H1: Duplicate", "Opportunity", "Low", u,
                                   f"duplicate with {len(urls)-1} other page(s)")
        for desc, urls in self.meta_desc_seen.items():
            if len(urls) > 1:
                for u in urls:
                    self._current_page_blocked = self.url_blocked_status.get(u, False)
                    self.add_issue("Meta Description: Duplicate", "Opportunity", "Low", u,
                                   f"duplicate with {len(urls)-1} other page(s)")

    def check_orphans(self):
        """Detect internal pages with no inbound internal links (orphans)."""
        for url in self.visited:
            if url == self.start_url:
                continue
            if url not in self.page_data:
                continue  # only flag pages we actually rendered as HTML
            inbounds = self.inbound_links.get(url, set())
            if not inbounds:
                self.add_issue("Links: Orphan Page (No Inbound Internal Links)",
                               "Warning", "Medium", url)

    def check_link_depth(self):
        """Detect pages more than max_link_depth clicks from homepage."""
        if not self.cfg.get("check_link_depth", True):
            return
        max_depth = self.cfg.get("max_link_depth", 3)
        for url, depth in self.depth.items():
            if depth > max_depth:
                self.add_issue(
                    f"Links: Page Depth > {max_depth} Clicks from Home",
                    "Warning", "Medium", url,
                    detail=f"This page is {depth} clicks from the homepage (max recommended: {max_depth})"
                )

    def check_https_hsts(self):
        """Check HTTPS enforcement, HSTS header, and mixed content."""
        if not self.cfg.get("check_https", True):
            return
        for url in self.visited:
            if url not in self.page_data:
                continue
            data = self.page_data[url]
            if not data.get("final_url", "").startswith("https://"):
                self.add_issue(
                    "HTTPS: Page Not Served Over HTTPS",
                    "Error", "High", url,
                    detail=f"Page loads via HTTP: {data.get('final_url', url)}"
                )
            headers = data.get("response_headers", {})
            hsts = headers.get("strict-transport-security", "")
            if not hsts:
                self.add_issue(
                    "HTTPS: Missing HSTS Header",
                    "Warning", "Medium", url,
                    detail="Strict-Transport-Security header not present"
                )
            elif "max-age" not in hsts.lower():
                self.add_issue(
                    "HTTPS: HSTS Header Missing max-age",
                    "Warning", "Low", url,
                    detail=f"HSTS header present but missing max-age: {hsts}"
                )

    def check_mixed_content(self):
        """Report HTTP resources loaded on HTTPS pages (counted during crawl)."""
        if not self.cfg.get("check_mixed_content", True):
            return
        for url in self.visited:
            data = self.page_data.get(url)
            if not data:
                continue
            final_url = data.get("final_url", url)
            if not final_url.startswith("https://"):
                continue
            count = data.get("mixed_content_count", 0)
            if count:
                self.add_issue(
                    "HTTPS: Mixed Content Detected",
                    "Error", "High", url,
                    detail=f"Found {count} HTTP resource(s) on HTTPS page"
                )

    def _get_status_code_distribution(self):
        """Get distribution of HTTP status codes from crawled pages."""
        from collections import Counter
        codes = []
        for data in self.page_data.values():
            status = data.get("status_code")
            if status:
                codes.append(status)
        return dict(Counter(codes))

    # ---------- Export ----------
    def export_json(self, output_path):
        summary = defaultdict(lambda: [0, "", ""])
        for name, itype, priority, url, detail, blocked in self.issues:
            summary[name][0] += 1
            summary[name][1] = itype
            summary[name][2] = priority

        summary_issues = [
            {"name": name, "type": t, "priority": p, "count": c}
            for name, (c, t, p) in sorted(summary.items(), key=lambda x: -x[1][0])
        ]

        detail_issues = [
            {"name": name, "type": itype, "priority": priority, "url": url,
             "detail": detail, "blocked": blocked}
            for name, itype, priority, url, detail, blocked in self.issues
        ]

        report = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "site": {
                "start_url": self.start_url,
                "domain": self.domain,
                "sitemap_url": self.sitemap_url,
            },
            "crawl_stats": {
                "pages_fetched": self.fetched_count,
                "urls_discovered": len(self.visited),
                "robots_skipped": self.robots_skipped_count,
                "sample_skipped": self.sample_skipped_count,
            },
            "crawl_budget": {
                "total_discovered": len(self.visited),
                "pages_crawled": self.fetched_count,
                "crawl_efficiency": round(self.fetched_count / len(self.visited) * 100, 2) if self.visited else 0,
                "robots_txt_blocked": self.robots_skipped_count,
                "sampled_out": self.sample_skipped_count,
                "avg_response_time_ms": round(sum(getattr(self, 'response_times', [0])) / max(len(getattr(self, 'response_times', [1])), 1), 2),
                "status_codes": self._get_status_code_distribution(),
            },
            "issues_summary": summary_issues,
            "issues_detail": detail_issues,
            "pages": [
                {
                    "url": u,
                    "title": d.get("title"),
                    "h1": d.get("h1"),
                    "word_count": d.get("word_count"),
                    "outbound_links": d.get("outbound_links", []),
                    "schema_types": d.get("schema_types", []),
                    "has_hreflang": d.get("has_hreflang", False),
                    "hreflangs": d.get("hreflangs", []),
                }
                for u, d in self.page_data.items()
            ],
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\nJSON report written to: {output_path}")

    def export_csv(self):
        summary = defaultdict(lambda: [0, "", ""])
        total_urls = self.fetched_count or 1
        for name, itype, priority, url, detail, blocked in self.issues:
            summary[name][0] += 1
            summary[name][1] = itype
            summary[name][2] = priority

        with open(self.cfg["summary_csv_file"], "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["Issue Name", "Issue Type", "Issue Priority", "Count",
                             "% of Crawled URLs"])
            for name, (count, itype, priority) in sorted(summary.items(), key=lambda x: -x[1][0]):
                pct = round(100 * count / total_urls, 2)
                writer.writerow([name, itype, priority, count, f"{pct}%"])

        self._close()
        print(f"\nOutput files created:")
        print(f"  - {self.cfg['summary_csv_file']}")
        print(f"  - {self.cfg['detail_csv_file']}")

    def export(self, json_output_path=None):
        if json_output_path:
            self.export_json(json_output_path)
        self.export_csv()


# ===================== MAIN =====================
def parse_args():
    parser = argparse.ArgumentParser(description="Extended SEO Technical Auditor")
    parser.add_argument("--config", help="Path to config.json (overrides defaults)")
    parser.add_argument("--resume", action="store_true", help="Resume previous crawl")
    parser.add_argument("--output", help="Output JSON path", default="crawl_results.json")
    parser.add_argument("--start-url", help="Override start URL")
    parser.add_argument("--max-pages", type=int, help="Override max pages")
    parser.add_argument("--cwd", help="Working directory for state/output files")
    return parser.parse_args()


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # Map the high-level config.json structure to crawler config keys
    result = {}
    if "site" in cfg:
        result["start_url"] = cfg["site"].get("baseUrl", "")
        result["sitemap_url"] = cfg["site"].get("sitemapUrl", "")
    if "crawler" in cfg:
        c = cfg["crawler"]
        result["max_pages"] = c.get("maxPages")
        result["request_timeout"] = c.get("requestTimeout")
        result["delay_between_requests"] = c.get("delayBetweenRequests")
        result["max_retries"] = c.get("maxRetries")
        result["backoff_factor"] = c.get("backoffFactor")
        result["user_agent"] = c.get("userAgent")
        result["robots_mode"] = c.get("robotsMode")
        result["check_external_links"] = c.get("checkExternalLinks")
        result["external_link_timeout"] = c.get("externalLinkTimeout")
        result["auto_sample"] = c.get("autoSample")
        result["sample_limit"] = c.get("sampleLimit")
        result["sample_params"] = c.get("sampleParams", [])
        result["check_canonicals"] = c.get("checkCanonicals", True)
        result["check_redirect_chains"] = c.get("checkRedirectChains", True)
        result["check_soft404"] = c.get("checkSoft404", True)
        result["check_schema"] = c.get("checkSchema", True)
        result["check_hreflang"] = c.get("checkHreflang", True)
        result["check_thin_content"] = c.get("checkThinContent", True)
        result["min_content_words"] = c.get("minContentWords", 200)
        result["sitemap_validation"] = c.get("sitemapValidation", True)
        result["check_schema_types"] = c.get("checkSchemaTypes", True)
        result["check_https"] = c.get("checkHttps", True)
        result["check_mixed_content"] = c.get("checkMixedContent", True)
        result["check_link_depth"] = c.get("checkLinkDepth", True)
        result["max_link_depth"] = c.get("maxLinkDepth", 3)
        result["page_type_patterns"] = c.get("pageTypePatterns", {})
    return result


def main():
    args = parse_args()
    config = {}
    if args.config:
        config = load_config(args.config)
        if args.cwd:
            os.chdir(args.cwd)
    elif args.start_url:
        config["start_url"] = args.start_url
    else:
        print("Error: provide --config or --start-url")
        sys.exit(1)

    if args.start_url:
        config["start_url"] = args.start_url
    if args.max_pages:
        config["max_pages"] = args.max_pages

    auditor = SEOAuditor(config, resume=args.resume)
    auditor.crawl()
    auditor.export(json_output_path=args.output)


if __name__ == "__main__":
    main()