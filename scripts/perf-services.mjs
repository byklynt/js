// Dev only: npm run perf:services
// Measures the user pages that list services against a running server whose store holds ~5,000 services
// (the real Likeo catalogue, or `npm run perf:seed` for 5,000 synthetic ones).
//
//   1. npm run perf:seed                      (optional: writes .data/perf-store.json with 5,000 synthetic services)
//   2. npm run build
//   3. AUTH_SECRET=perf-local-secret-0123456789abcdef SG_STORE_PATH=.data/perf-store.json npx next start -p 3100
//   4. npm run perf:services                  (PERF_BASE=http://localhost:3100 by default)
//
// Prints, per page: DOM node count, first contentful paint, time until the page is usable, scripting time and long tasks
// while scrolling, and the typing latency in the search box (worst input event + long tasks). Targets: < 1,500 DOM nodes
// initially, first paint < 1 s locally, no long task > 100 ms while typing or scrolling.
// Needs Playwright (devDependency). Signs up a throw-away user; the signup rate limit is 10 per hour per IP.
import { chromium } from "playwright";

const BASE = process.env.PERF_BASE ?? "http://localhost:3100";
const PASSWORD = "Perf-test-12345";
const LIMITS = { nodes: 1500, paint: 1000, longTask: 100 };

const INIT = () => {
  window.__lt = [];
  window.__ev = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ev.push(e.duration))).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
};

const nodes = (page) => page.evaluate(() => document.getElementsByTagName("*").length);
const takeLong = (page) => page.evaluate(() => { const a = window.__lt; window.__lt = []; return a; });
const takeEv = (page) => page.evaluate(() => { const a = window.__ev; window.__ev = []; return a; });
const max = (a) => (a.length ? Math.round(Math.max(...a)) : 0);

async function cpu(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { script: m.ScriptDuration * 1000, task: m.TaskDuration * 1000, layout: m.LayoutDuration * 1000 };
}

async function measure(browser, storageState, label, path, { searchSelector, term, scrollSteps = 12 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const out = { page: label };

  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: "load" });
  out.loadMs = Date.now() - t0;
  out.fcpMs = Math.round(await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0));
  // "Usable": the page heading is there and the main content has settled (DOM size stable for 300 ms).
  let prev = -1, stable = 0;
  const t1 = Date.now();
  while (stable < 3 && Date.now() - t1 < 15000) {
    const n = await nodes(page);
    stable = n === prev ? stable + 1 : 0;
    prev = n;
    await page.waitForTimeout(100);
  }
  out.interactiveMs = Date.now() - t0 - 300;
  out.domNodes = await nodes(page);
  out.initialLongTasksMax = max(await takeLong(page));

  // Scroll
  const c0 = await cpu(cdp);
  for (let i = 0; i < scrollSteps; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const c1 = await cpu(cdp);
  out.scrollScriptMs = Math.round(c1.script - c0.script);
  out.scrollTaskMs = Math.round(c1.task - c0.task);
  const scrollLong = await takeLong(page);
  out.scrollLongTasks = scrollLong.length;
  out.scrollLongTaskMax = max(scrollLong);
  out.domNodesAfterScroll = await nodes(page);

  // Typing
  if (searchSelector) {
    const box = page.locator(searchSelector).first();
    if (await box.count()) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await box.click();
      await takeLong(page); await takeEv(page);
      const c2 = await cpu(cdp);
      const keyMs = [];
      for (const ch of term) {
        const s = Date.now();
        await page.keyboard.type(ch);
        keyMs.push(Date.now() - s);
        await page.waitForTimeout(40);
      }
      const tType = Date.now();
      let p2 = -1, st = 0;
      while (st < 3 && Date.now() - tType < 10000) {
        const n = await nodes(page);
        st = n === p2 ? st + 1 : 0;
        p2 = n;
        await page.waitForTimeout(100);
      }
      const c3 = await cpu(cdp);
      out.typingKeyMsMax = Math.max(...keyMs);
      out.typingInputEventMax = max(await takeEv(page));
      const typeLong = await takeLong(page);
      out.typingLongTasks = typeLong.length;
      out.typingLongTaskMax = max(typeLong);
      out.typingScriptMs = Math.round(c3.script - c2.script);
      out.settleAfterTypingMs = Date.now() - tType - 300;
      out.domNodesAfterTyping = await nodes(page);
    } else out.typing = `(no ${searchSelector})`;
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
try {
  const name = "perf" + Date.now().toString(36).slice(-5);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/signup", { waitUntil: "networkidle" });
  await page.getByLabel(/Username/i).first().fill(name);
  await page.getByLabel(/^Email/i).first().fill(`${name}@contoh.test`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/Konfirmasi/i).fill(PASSWORD);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  const state = await ctx.storageState();
  await ctx.close();

  const rows = [];
  rows.push(await measure(browser, state, "/dashboard/services", "/dashboard/services", { searchSelector: "#services-search", term: "instagram followers" }));
  rows.push(await measure(browser, state, "/dashboard (order form)", "/dashboard", { searchSelector: null }));
  rows.push(await measure(browser, state, "/dashboard/mass-order", "/dashboard/mass-order", { searchSelector: null, scrollSteps: 3 }));
  for (const r of rows) {
    console.log(`\n${r.page}`);
    for (const [k, v] of Object.entries(r)) if (k !== "page") console.log(`  ${k.padEnd(24)} ${v}`);
  }
  const s = rows[0];
  const checks = [
    ["initial DOM nodes < " + LIMITS.nodes, s.domNodes < LIMITS.nodes],
    ["first contentful paint < " + LIMITS.paint + " ms", s.fcpMs > 0 && s.fcpMs < LIMITS.paint],
    ["no long task > " + LIMITS.longTask + " ms while scrolling", s.scrollLongTaskMax <= LIMITS.longTask],
    ["no long task > " + LIMITS.longTask + " ms while typing", (s.typingLongTaskMax ?? 0) <= LIMITS.longTask],
  ];
  console.log("\nTargets (/dashboard/services):");
  for (const [n, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"} ${n}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
