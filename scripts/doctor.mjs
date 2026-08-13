#!/usr/bin/env node
/**
 * SEO Audit Pro - environment check ("npm run doctor")
 * Verifies that a machine has everything needed to run the audit pipeline:
 *   - Node.js >= 20 and npm
 *   - Python 3.9+ with the pinned packages (requests, beautifulsoup4, lxml)
 *   - A Google Chrome browser (used by Lighthouse)
 *   - The Node dependencies (chart.js, chrome-launcher, lighthouse)
 *   - A valid config.json with site.baseUrl
 * Exits 0 if all checks pass, 1 otherwise.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const ok = (msg) => console.log(`  [OK]   ${msg}`);
const fail = (msg) => console.log(`  [FAIL] ${msg}`);
let failed = false;

console.log("\nSEO Audit Pro - environment check\n");

// ---------- Node ----------
console.log("Node.js / npm");
try {
  const nodeVer = spawnSync("node", ["--version"], { encoding: "utf8" }).stdout.trim();
  const major = parseInt(String(nodeVer).replace(/^v/, "").split(".")[0], 10);
  if (major >= 20) ok(`Node ${nodeVer} (>= 20 required)`);
  else { failed = true; fail(`Node ${nodeVer} is too old (>= 20 required). Upgrade: https://nodejs.org`); }
} catch { failed = true; fail("Node.js not found. Install from https://nodejs.org"); }

try {
  const npmVer = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).stdout.trim();
  ok(`npm ${npmVer}`);
} catch { failed = true; fail("npm not found. It ships with Node.js."); }

// ---------- Python ----------
console.log("\nPython");
const py = spawnSync("python", ["--version"], { encoding: "utf8" });
const pyVersionRaw = ((py.stdout || py.stderr) || "").trim();
const pyNum = String(pyVersionRaw).match(/(\d+)\.(\d+)/);
const pyMajor = pyNum ? parseInt(pyNum[1], 10) : 0;
if (pyMajor >= 3) ok(`Python ${pyVersionRaw}`);
else { failed = true; fail(`Python not usable (got: ${pyVersionRaw || "none"}). Install from https://python.org (3.9+).`); }

if (pyMajor >= 3) {
  const probe = spawnSync("python", ["-c",
    "import requests, bs4, lxml; print(requests.__version__, bs4.__version__, lxml.__version__)"],
    { encoding: "utf8" });
  if (probe.status === 0) ok(`Python packages installed (${probe.stdout.trim()})`);
  else {
    failed = true;
    fail("Python packages missing. Run: pip install -r src/crawler/requirements.txt");
  }
}

// ---------- Chrome ----------
console.log("\nBrowser (used by Lighthouse)");
const chromeCandidates = [
  process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];
const chromeExe = chromeCandidates.find((p) => p && fs.existsSync(p));
if (chromeExe) {
  ok(`Chrome found: ${chromeExe}`);
} else {
  let fromLauncher = null;
  try {
    const cl = await import("chrome-launcher");
    if (typeof cl.getChromePath === "function") fromLauncher = cl.getChromePath();
  } catch { /* launcher missing, handled below */ }
  if (fromLauncher && fs.existsSync(fromLauncher)) {
    ok(`Chrome found: ${fromLauncher}`);
  } else {
    failed = true;
    fail("Google Chrome not found. Install from https://www.google.com/chrome/ (required for speed tests).");
  }
}

// ---------- Node dependencies ----------
console.log("\nNode dependencies");
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
for (const dep of Object.keys(pkg.dependencies || {})) {
  try {
    const ver = JSON.parse(fs.readFileSync(path.join(rootDir, "node_modules", dep, "package.json"), "utf-8")).version;
    ok(`${dep}@${ver}`);
  } catch {
    failed = true;
    fail(`${dep} not installed. Run: npm install`);
  }
}

// ---------- config.json ----------
console.log("\nConfiguration");
const cfgPath = path.join(rootDir, "config.json");
if (fs.existsSync(cfgPath)) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  if (cfg.site?.baseUrl) {
    ok(`config.json found, site.baseUrl = ${cfg.site.baseUrl}`);
    if (!cfg.site.sitemapUrl) ok("(no sitemapUrl set — will be derived from baseUrl)");
  } else { failed = true; fail("config.json exists but site.baseUrl is missing."); }
} else {
  failed = true;
  fail("config.json not found at project root.");
}

console.log(failed ? "\nResult: problems found — fix the [FAIL] items above.\n" : "\nResult: everything looks good. Run 'run.bat' or 'npm run audit'.\n");
process.exit(failed ? 1 : 0);