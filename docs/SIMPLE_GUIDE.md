# Checking Your Website — a Simple, Non-Technical Guide

This guide is for people who just want to check their website — **no coding knowledge
needed**. If you can double-click an icon and copy-paste a line, you can do this.

## First, the important good news

- Everything runs **on your own computer**. Nothing about your site is sent to anyone.
- You only do the "set up" part once. After that, checking your site is two clicks.
- If you get stuck, ask whoever gave you this project — the computer will tell us
  exactly what's wrong on the screen.

---

## Step 1 — What is this thing?

It's a check-up program for websites. Think of it like a doctor for your site. It looks at
real pages and tells you, in plain words:

- **Is your site fast?** (how quickly pages load)
- **Can search engines find your pages?** (technical things like broken links, duplicate
  pages, missing descriptions)
- **What should you fix first?** (it gives you a to-do list, easiest first)

At the end you get **one file you open in your web browser** (like opening a webpage) with
everything organised and easy to read.

---

## Step 2 — Install three free programs (only once)

You need three programs installed on the computer. All are free and safe.

| # | Program | Why you need it | Where to get it |
|---|---|---|---|
| 1 | **Google Chrome** | The browser we use to test your site | https://www.google.com/chrome/ |
| 2 | **Node.js** | Helps the speed-testing work | https://nodejs.org |
| 3 | **Python** | Helps the site-crawling work | https://python.org |

**How to install (the important details):**

- **Chrome** — download and double-click the downloaded file. Nothing special needed.
- **Node.js** — download the version that says "LTS", double-click the downloaded file, and
  just keep clicking **Next** until it finishes.
- **Python** — download the version offered latest, double-click it, and this next part is
  **the only easy-to-miss step**:
  1. BEFORE clicking install, tick the little box at the bottom that says
     **"Add python.exe to PATH"**.
  2. Then click **Install Now**, and click through until done.

> If the computer asks "Are you sure you want to change this computer?" → click **Yes**.
> After installing, restart the computer to be safe.

---

## Step 3 — Get the project folder

You need the project folder on your computer (it came from the person who gave you this).

1. Put the folder anywhere easy to find, for example: `C:\Users\YourName\Desktop\Seo_audit`
2. Open the folder. You should see a file called **`run.bat`** (it may look like a blank
   white square or gears icon — that's it). **This is the "big green button" of the program.**

> Don't worry about all the other files. You only ever touch `run.bat` and `config.json`.

---

## Step 4 — Tell it which website to check (one time)

The program needs to know your website's address. You'll edit one small file, like editing
a note.

1. In the project folder, find the file called **`config.json`**.
2. **Right-click it → Open with → Notepad** (on some computers: "NotePad" or "Editor").
3. Find these two lines near the top (they might look slightly different but will contain
   "baseUrl" and "sitemapUrl"):

```
"baseUrl": "https://your-site.com",
"sitemapUrl": "https://your-site.com/sitemap.xml"
```

4. Replace **`https://your-site.com`** with your real website address, for example
   `https://mycompany.com`.

   - For the first line, use the plain homepage: `https://mycompany.com`
   - For the second line, leave it exactly the same shape but with your address:
     `https://mycompany.com/sitemap.xml`
     (If you don't know your sitemap address, leave the second one as-is —
     it's usually just your address with `/sitemap.xml` at the end. If it can't find
     it, the report will simply say so—no harm done.)

5. Save the file (Ctrl + S or File → Save) and close Notepad.

---

## Step 5 — Run the check-up

1. **Double-click `run.bat`.** A black window opens and shows a menu:

```
Select audit mode:
  1) Full Audit (Crawl + Speed + Combined Report + AI Prompt)
  2) Crawl Only (Technical SEO)
  3) Speed Only (Core Web Vitals)
  4) Single Page Speed Check
  5) AI Analysis (build prompt from latest results)
```

2. Type the number **`1`** and press **Enter**. (Always choose **1** — it does everything.)

3. **The first time only:** the window will quietly install some helper packages
   automatically. This can take a few minutes — just let it work. You'll see "Lighthouse
   found" or similar; this is normal.

4. Then the check-up starts. It will print lines like `[1] Checking: https://...` and open
   Chrome windows briefly for speed tests (this is normal).

**How long will it take?**

- A small site (a few pages): about **2–10 minutes**.
- A big shop: **30 minutes to 2+ hours** — it checks every page one by one on purpose.

> Let it finish. When it's done the window will say **"Done!"** and then close when you
> press any key.

---

## Step 6 — Open your report

When it's finished, look in the folder called **`reports`** inside the project folder.
You'll see files like `report-2026-...html`. That **`report-....html`** file is your report.

- There may be several (from old check-ups) — open the **newest one** (the date is in the
  filename).
- **Double-click it.** It opens in your web browser like a webpage — that's exactly right.

---

## Step 7 — What you're looking at (plain language)

The report page has a few sections. Summary:

| What you see | What it means |
|---|---|
| **Executive Summary** | Numbers at a glance: average speed score (0–100, higher = better) and SEO score, how many problems it found. |
| **Speed & Core Web Vitals** | How fast each tested page loads. Green = good, orange = ok, red = needs work. |
| **Technical SEO Findings** | Boring-but-important stuff: links that lead nowhere, pages search engines can't reach, unsafe (non-HTTPS) pages. |
| **On-Page Findings** | Small missing pieces: missing page titles, missing descriptions, missing headings. |
| **Content Findings** | Thin pages with almost no text (search engines don't like those). |
| **Crawl Budget** | How many pages it found vs. checked — big gap means search engines are wasting effort. |
| **Prioritized Action Plan** | The to-do list. Fix **Section 1 (Critical)** first, then Section 2, then the Easy Wins (Section 3). |

**Tip:** Don't panic at a long list. No site is perfect — even the best sites have dozens of
small issues. Fix the top few, check again in a few weeks, and watch the numbers go up.

---

## Very common simple questions

**"The black window opened then closed too fast to see anything."**
This happens sometimes on Windows. Instead of double-clicking, open the folder, click in the
address bar at the top, type `cmd` and press Enter, then type `run.bat` and press Enter.
The window will stay open and show you the error message.

**"It says `python not found` / `Node.js not found`."**
One of the three programs in Step 2 isn't installed properly. Install it again, and on
Python make sure to tick **"Add python.exe to PATH"**.

**"It's asking me to enter a number but I don't know which."**
Type `1`, press Enter. That's the full check-up.

**"Some pages show 0 or 'Failed' in the speed table."**
Those pages probably require a login, a shopping cart, or are behind a paywall, so the test
can't open them. That's normal — a website can't expect search engines or robots to log in
either.

**"Scores are all 0 for everything."**
This means the speed data is old (from an earlier broken version). Just run the check-up
again — it always cleans and makes everything fresh now.

**"Can I show the report to someone else?"**
Yes — that's the whole point. You can email the `report-...html` file; it opens in any
browser on any computer.

---

## Optional: get a second opinion from an AI

The program also creates a file with questions for an AI assistant (like ChatGPT or Claude)
to review things a computer can't judge — like whether your content and keywords are good.

1. In `config.json` (Notepad again), find the section starting with `"ai"` and you can fill
   in your business details: what your site sells, your main keywords, etc. (optional).
2. Run the check-up with option **1**.
3. Open `reports\ai-prompt-....md` (right-click → Open with → Notepad).
4. Copy all the text, paste it into your AI chat, and send it. The AI answers with
   recommendations you can read like a letter.

That's it — no API keys, no accounts, no money, and nothing leaves your computer until you
decide to copy-paste yourself.

---

## The golden rule if anything looks wrong

The program only ever says what it measured. If something seems off or confusing, note the
exact words the black window showed and send them (with a screenshot if you can) to the
person who gave you the project. The message on screen tells us exactly where the problem is.