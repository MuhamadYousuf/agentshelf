// Scripted, repeatable screen captures of the LOCAL recording copy (D:/agentshelf-rec on :3000).
// Usage: node capture/record.mjs <beat> [<beat> ...]   (beats: see BEATS below)
import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.REC_URL ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Recording only runs against a local copy.");
const OUT = "public/capture";
const VIEW = { width: 1600, height: 900 };
const VIDEO = VIEW;
mkdirSync(OUT, { recursive: true });
mkdirSync(".rec", { recursive: true });

// Seed demo merchant (values from lib/db/seed.ts, local test account).
const MAYA = { email: "maya@demo.agentshelf.dev", password: "demo-maya-2026" };

const CURSOR_JS = `
(() => {
  if (window.__fakeCursor) return; window.__fakeCursor = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:-50px;top:-50px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);transition:transform .05s';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.8L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(80,70,229,.28);z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .35s, transform .35s;transform:scale(.4)';
    document.documentElement.appendChild(ring);
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => { ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.style.transition='none'; ring.style.opacity = '1'; ring.style.transform='scale(.4)'; requestAnimationFrame(()=>{ ring.style.transition='opacity .45s, transform .45s'; ring.style.opacity='0'; ring.style.transform='scale(1.4)'; }); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };

async function moveTo(page, x, y, steps = 28) {
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(12);
  }
  mouse = { x, y };
}

async function point(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("No box for locator");
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
}

async function click(page, locator) {
  await point(page, locator);
  await sleep(180);
  await locator.click();
  await sleep(250);
}

async function typeSlow(page, locator, text, delay = 55) {
  await click(page, locator);
  await locator.fill("");
  await locator.pressSequentially(text, { delay });
}

async function smoothScroll(page, dy, ms = 1400) {
  const steps = Math.max(10, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(16);
  }
}

async function newRecordingContext(browser, name, { auth = false } = {}) {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: ".rec", size: VIDEO },
    storageState: auth && existsSync(".rec/maya.json") ? ".rec/maya.json" : undefined,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.addInitScript(CURSOR_JS);
  const page = await context.newPage();
  mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };
  return { context, page, name };
}

async function finish({ context, page, name }) {
  const video = page.video();
  await context.close();
  const src = await video.path();
  const dest = join(OUT, `${name}.webm`);
  renameSync(src, dest);
  console.log("saved", dest);
}

async function login(browser) {
  const context = await browser.newContext({ viewport: VIEW });
  const page = await context.newPage();
  await page.goto(`${BASE}/merchant/login`);
  await page.locator("#email").fill(MAYA.email);
  await page.locator("#password").fill(MAYA.password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  await context.storageState({ path: ".rec/maya.json" });
  await context.close();
  console.log("logged in");
}

/** Wait until the page has painted real content (fonts + images). */
async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForFunction(() => [...document.images].every((img) => img.loading === "lazy" && img.getBoundingClientRect().top > innerHeight ? true : img.complete && img.naturalWidth > 0), null, { timeout: 20000 }).catch(() => undefined);
  await sleep(ms);
}

/** Visit pages once without recording so images/data are hot in every cache. */
async function warm(browser, paths) {
  const context = await browser.newContext({ viewport: VIEW, storageState: existsSync(".rec/maya.json") ? ".rec/maya.json" : undefined });
  const page = await context.newPage();
  for (const path of paths) {
    await page.goto(`${BASE}${path}`).catch(() => undefined);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 900); await sleep(250); }
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  await context.close();
}

const BLUR_SECRETS_JS = `
(() => {
  const css = '.pass-token-row code{filter:blur(9px)!important;user-select:none}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

/**
 * Morning beat, HEADED: Agent Pass creation → the USER approves in the PayPal sandbox window →
 * key read from the page (blurred on screen, never printed or saved) → Shopper pays with it (Flow B) → receipt.
 * Server must run with APP_URL=localhost (server.ps1 -Mode local) so the PayPal return lands here.
 */
async function passflow() {
  const browser = await chromium.launch({ headless: false, channel: process.env.PW_CHANNEL ?? "msedge" });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, recordVideo: { dir: ".rec", size: VIDEO } });
  await context.addInitScript(CURSOR_JS);
  await context.addInitScript(BLUR_SECRETS_JS);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };
  try {
    await page.goto(`${BASE}/pass`);
    await settle(page, 1200);
    mark("passForm");
    await typeSlow(page, page.getByLabel(/Pass name/i), "Gifts for Mom", 60);
    await sleep(500);
    await smoothScroll(page, 420, 1500);
    await sleep(700);
    mark("continue");
    await click(page, page.getByRole("button", { name: /Continue to PayPal/i }));
    console.log(">>> Approve the Agent Pass in the PayPal sandbox window now (waiting up to 10 minutes).");
    await page.waitForURL((u) => u.origin === BASE && /\/pass\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 600000 });
    mark("passReturned");
    const code = page.locator(".pass-token-row code");
    await code.waitFor({ timeout: 30000 });
    const token = (await code.textContent())?.trim();
    if (!token?.startsWith("asp_")) throw new Error("Pass key not found on the page.");
    await settle(page, 2500);
    await smoothScroll(page, 300, 1200);
    await sleep(1500);
    mark("shopper");
    await page.goto(`${BASE}/shopper`);
    await settle(page, 1200);
    await typeSlow(page, page.getByLabel(/Shopping goal/i), process.env.SHOPPER_GOAL ?? "A handmade ceramic mug for my mom, under $35", 50);
    await typeSlow(page, page.getByLabel(/My budget/i), process.env.SHOPPER_BUDGET ?? "35", 120);
    const passInput = page.locator("#shopper-pass");
    await click(page, passInput);
    await passInput.fill(token);
    await sleep(500);
    await click(page, page.getByRole("button", { name: /Send my agent shopping/i }));
    await sleep(1200);
    const live = page.getByText(/Live shopping run/i).first();
    await live.waitFor({ timeout: 15000 }).catch(() => undefined);
    const top = await live.evaluate((el) => el.getBoundingClientRect().top).catch(() => 400);
    await smoothScroll(page, Math.max(0, top - 40), 1600);
    const done = page.getByText(/Paid autonomously|Approve in PayPal|Retry this search/i).first();
    await done.waitFor({ timeout: 180000 });
    mark("paid");
    await sleep(800);
    const bottom = await done.evaluate((el) => el.getBoundingClientRect().bottom).catch(() => VIEW.height);
    await smoothScroll(page, Math.max(0, bottom - VIEW.height + 140), 1500);
    await sleep(3500);
    const receipt = page.getByRole("link", { name: /View receipt/i }).first();
    if (await receipt.count()) {
      mark("receipt");
      await click(page, receipt);
      await settle(page, 1500);
      await smoothScroll(page, 350, 1500);
      await sleep(3000);
    }
    mark("end");
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    renameSync(await video.path(), join(OUT, "passflow.webm"));
    writeFileSync(join(OUT, "passflow-marks.json"), JSON.stringify(marks, null, 2));
    console.log("saved passflow", marks);
  }
}

const BEATS = {
  async storefront(browser) {
    const rec = await newRecordingContext(browser, "storefront");
    const { page } = rec;
    await page.goto(`${BASE}/s/maya-clay`);
    await settle(page, 1200);
    await moveTo(page, 820, 420);
    await sleep(800);
    await smoothScroll(page, 520, 1800);
    await sleep(900);
    const card = page.getByRole("link", { name: /Hand-glazed speckled mug/i }).first();
    await click(page, card);
    await settle(page, 1500);
    await smoothScroll(page, 300, 1200);
    await sleep(1800);
    await finish(rec);
  },

  async capture(browser) {
    const rec = await newRecordingContext(browser, "capture", { auth: true });
    const { page } = rec;
    await page.goto(`${BASE}/merchant/capture`);
    await settle(page, 1000);
    const drop = page.getByRole("button", { name: /Add photos of one item/i });
    await point(page, drop);
    await sleep(400);
    await page.locator("input[type=file]").setInputFiles(process.env.CAPTURE_PHOTO ?? "capture/photos/new-item.jpg");
    await sleep(1200);
    await typeSlow(page, page.locator("#capture-hint"), "Set of three, about 4 inches tall, reclaimed clay", 45);
    await sleep(500);
    await click(page, page.getByRole("button", { name: /Draft my listing/i }));
    await page.waitForURL(/\/merchant\/products\/[0-9a-f-]{36}/, { timeout: 120000 });
    const productId = page.url().split("/").pop();
    writeFileSync(".rec/last-capture-product.txt", productId ?? "");
    await settle(page, 1500);
    await moveTo(page, 900, 300);
    await sleep(1000);
    await smoothScroll(page, 450, 1800);
    await sleep(1200);
    const publish = page.getByRole("button", { name: /Publish listing/i });
    await click(page, publish);
    await page.getByRole("button", { name: /Unpublish/i }).waitFor({ timeout: 60000 });
    await sleep(800);
    await smoothScroll(page, -900, 1500);
    await sleep(2200);
    await finish(rec);
  },

  async pass(browser) {
    const rec = await newRecordingContext(browser, "pass");
    const { page } = rec;
    await page.goto(`${BASE}/pass`);
    await settle(page, 1200);
    const name = page.getByLabel(/Pass name/i);
    if (await name.count()) await typeSlow(page, name, "Gifts for family", 60);
    await sleep(600);
    await smoothScroll(page, 420, 1600);
    await sleep(800);
    const cont = page.getByRole("button", { name: /Continue to PayPal/i });
    if (await cont.count()) await point(page, cont);
    await sleep(1800);
    await finish(rec);
  },

  async shopper(browser) {
    const rec = await newRecordingContext(browser, "shopper");
    const { page } = rec;
    await page.goto(`${BASE}/shopper`);
    await settle(page, 1500);
    await typeSlow(page, page.getByLabel(/Shopping goal/i), process.env.SHOPPER_GOAL ?? "A handmade ceramic mug for my mom, under $35", 50);
    const budget = page.getByLabel(/My budget/i);
    await typeSlow(page, budget, process.env.SHOPPER_BUDGET ?? "35", 120);
    if (process.env.AGENT_PASS_TOKEN) {
      const pass = page.locator("#shopper-pass");
      await click(page, pass);
      await pass.fill(process.env.AGENT_PASS_TOKEN);
    }
    await sleep(500);
    await click(page, page.getByRole("button", { name: /Send my agent shopping/i }));
    await sleep(1200);
    // Glide down to the live run so the negotiation is on screen while it streams.
    const live = page.getByText(/Live shopping run/i).first();
    await live.waitFor({ timeout: 15000 }).catch(() => undefined);
    const top = await live.evaluate((el) => el.getBoundingClientRect().top).catch(() => 400);
    await smoothScroll(page, Math.max(0, top - 40), 1600);
    await moveTo(page, 1100, 600);
    // Follow the live run until a terminal card appears.
    const done = page.getByText(/Paid autonomously|Approve in PayPal|You saved|Retry this search/i).first();
    const started = Date.now();
    while (Date.now() - started < 150000) {
      if (await done.isVisible().catch(() => false)) break;
      await sleep(500);
    }
    await sleep(800);
    const bottom = await done.evaluate((el) => el.getBoundingClientRect().bottom).catch(() => VIEW.height);
    await smoothScroll(page, Math.max(0, bottom - VIEW.height + 140), 1500);
    await sleep(4000);
    await finish(rec);
  },

  async dashboard(browser) {
    const rec = await newRecordingContext(browser, "dashboard", { auth: true });
    const { page } = rec;
    await page.goto(`${BASE}/merchant`);
    await page.locator("canvas").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await settle(page, 2500);
    await moveTo(page, 900, 380);
    await sleep(1200);
    await smoothScroll(page, 500, 1800);
    await sleep(1600);
    await click(page, page.getByRole("link", { name: /^Orders$/ }).first());
    await page.locator(".ag-row").first().waitFor({ timeout: 30000 });
    await settle(page, 2500);
    await moveTo(page, 1000, 500);
    await sleep(2000);
    await finish(rec);
  },

  async copilot(browser) {
    const rec = await newRecordingContext(browser, "copilot", { auth: true });
    const { page } = rec;
    await page.goto(`${BASE}/merchant/orders`);
    await page.locator(".ag-row").first().waitFor({ timeout: 30000 });
    await settle(page, 2000);
    await click(page, page.getByRole("button", { name: /Copilot/i }).first());
    await sleep(900);
    const box = page.getByPlaceholder(/Ask about sales or an order/i);
    await typeSlow(page, box, process.env.COPILOT_Q1 ?? "How did agent sales go this week?", 38);
    await box.press("Enter");
    await waitForCopilot(page);
    await sleep(3500);
    await typeSlow(page, box, process.env.COPILOT_Q2 ?? "Show agent orders over $20", 38);
    await box.press("Enter");
    await waitForCopilot(page);
    await sleep(4500);
    await finish(rec);
  },

  async negotiation(browser) {
    const rec = await newRecordingContext(browser, "negotiation", { auth: true });
    const { page } = rec;
    await page.goto(`${BASE}/merchant/negotiations`);
    await settle(page, 2000);
    const first = page.locator(".ag-row:not(.ag-row-pinned) [col-id=product]").first();
    await first.waitFor({ timeout: 20000 });
    await moveTo(page, 700, 300);
    await sleep(1200);
    await click(page, first);
    await page.waitForURL(/\/merchant\/negotiations\/[0-9a-f-]{36}/, { timeout: 20000 });
    await settle(page, 2000);
    await moveTo(page, 900, 450);
    await sleep(1200);
    await smoothScroll(page, 500, 2200);
    await sleep(2000);
    await smoothScroll(page, 500, 2200);
    await sleep(2000);
    await finish(rec);
  },

  async products(browser) {
    const rec = await newRecordingContext(browser, "products", { auth: true });
    const { page } = rec;
    await page.goto(`${BASE}/merchant/products`);
    await settle(page, 2500);
    const row = page.locator(".ag-row:not(.ag-row-pinned)").filter({ hasText: /Incense holder/ }).first();
    const fallbackRow = page.locator(".ag-row:not(.ag-row-pinned)").nth(2);
    const target = (await row.count()) ? row : fallbackRow;
    // Pinned product column lives in a separate container; locate the stock cell by row index.
    const rowIndex = await target.getAttribute("row-index");
    const stock = page.locator(`.ag-row:not(.ag-row-pinned)[row-index="${rowIndex}"] [col-id=stock]`).first();
    await moveTo(page, 800, 420);
    await sleep(1200);
    await point(page, stock);
    await sleep(400);
    await stock.dblclick();
    await sleep(500);
    await page.keyboard.press("Control+A");
    await page.keyboard.type(process.env.PRODUCTS_STOCK ?? "30", { delay: 160 });
    await sleep(400);
    await page.keyboard.press("Enter");
    await sleep(3500);
    await moveTo(page, 1100, 700);
    await sleep(1500);
    await finish(rec);
  },

  async security(browser) {
    const rec = await newRecordingContext(browser, "security");
    const { page } = rec;
    await page.goto(`${BASE}/security`);
    await settle(page, 1500);
    await smoothScroll(page, 650, 2400);
    await sleep(1400);
    await smoothScroll(page, 700, 2400);
    await sleep(2500);
    await finish(rec);
  },

  async tour(browser) {
    const rec = await newRecordingContext(browser, "tour");
    const { page } = rec;
    await page.goto(`${BASE}/tour`);
    await settle(page, 1500);
    await smoothScroll(page, 600, 2400);
    await sleep(2000);
    await finish(rec);
  },

  async landing(browser) {
    const rec = await newRecordingContext(browser, "landing");
    const { page } = rec;
    await page.goto(`${BASE}/`);
    await settle(page, 2500);
    await moveTo(page, 700, 500);
    await smoothScroll(page, 700, 2600);
    await sleep(2000);
    await finish(rec);
  },
};

async function waitForCopilot(page) {
  const thinking = page.getByText(/Checking your shop/i).first();
  await thinking.waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
  await thinking.waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
  await sleep(400);
}

const wanted = process.argv.slice(2);
if (wanted[0] === "passflow") { await passflow(); process.exit(0); }
const browser = await chromium.launch({ headless: true });
try {
  if (wanted.some((b) => ["capture", "dashboard", "copilot", "negotiation", "products"].includes(b)) || !existsSync(".rec/maya.json")) {
    await login(browser);
  }
  await warm(browser, ["/", "/s/maya-clay", "/s/lahore-threads", "/security", "/tour", "/shopper", "/pass", "/merchant", "/merchant/orders", "/merchant/negotiations", "/merchant/products"]);
  const mug = await (async () => {
    const context = await browser.newContext({ viewport: VIEW });
    const page = await context.newPage();
    await page.goto(`${BASE}/s/maya-clay`);
    const href = await page.getByRole("link", { name: /Hand-glazed speckled mug/i }).first().getAttribute("href").catch(() => null);
    await context.close();
    return href;
  })();
  if (mug) await warm(browser, [mug]);
  for (const beat of wanted.length ? wanted : Object.keys(BEATS)) {
    if (!BEATS[beat]) { console.log("unknown beat", beat); continue; }
    try { await BEATS[beat](browser); } catch (error) { console.log("FAILED", beat, error.message); }
  }
} finally {
  await browser.close();
}
