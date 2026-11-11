import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = ".rec/sweep"; mkdirSync(OUT, { recursive: true });
const pub = ["/", "/tour", "/security", "/shopper", "/pass", "/s/maya-clay", "/merchant/login", "/nope-404"];
const mer = ["/merchant", "/merchant/products", "/merchant/orders", "/merchant/negotiations", "/merchant/capture", "/merchant/settings"];
const browser = await chromium.launch();
const errors = [];
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: tag === "m", hasTouch: tag === "m", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${tag} ${page.url()} ${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errors.push(`${tag} ${page.url()} pageerror: ${e.message.slice(0, 200)}`));
  const shot = async (path, name) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) errors.push(`${tag} ${path} horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true });
  };
  for (const p of pub) await shot(p, p.replace(/\W+/g, "_") || "root");
  // product + receipt
  await page.goto(BASE + "/s/maya-clay");
  const href = await page.locator("a[href*='/p/']").first().getAttribute("href");
  if (href) await shot(href, "product");
  await page.goto(BASE + "/merchant/login");
  await page.fill("#email", "maya@demo.agentshelf.dev");
  await page.fill("#password", "demo-maya-2026");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  for (const p of mer) await shot(p, p.replace(/\W+/g, "_"));
  await page.goto(BASE + "/merchant/negotiations", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const neg = await page.locator("a[href*='/merchant/negotiations/']").first().getAttribute("href").catch(() => null);
  if (neg) await shot(neg, "neg_detail");
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors / overflow");
