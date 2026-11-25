// Accessibility: axe-core (WCAG 2.1 A and AA rules) finds nothing on the site's main pages, light on desktop and dark
// on a phone; and the lawn in Watch Your Grass can be played from the keyboard (arrows move, Enter plants).
// CI installs axe-core beside Playwright (AXE points at axe.min.js); locally, set AXE or have axe-core installed.
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["index.html", "os.html", "services.html", "terms.html", "contact.html", "privacy.html", "hive.html", "checkin.html", "blackout.html", "letters.html", "witness.html", "passport.html", "portal.html", "status.html", "house.html",
  "skylens.html", "makers.html", "local-ai.html", "conflict-atlas-app.html", "orbit-app.html", "crime-dashboard-app.html", "ballast-app.html", "doccrawler-app.html", "watchyourgrass-app.html",
  "omnilogos-app.html", "meshnet-app.html", "shop-app.html"];
const b = await chromium.launch({ args: ["--no-proxy-server"] }); let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const fresh = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", reducedMotion: "reduce", colorScheme: M ? "dark" : "light" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort()); return ctx; };
const found = [];
for (const f of PAGES) {
  const ctx = await fresh(), p = await ctx.newPage();
  await p.goto("http://localhost:8099/" + f, { waitUntil: "load" }); await p.waitForTimeout(800);
  await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }); await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations
    .map((x) => x.id + " ×" + x.nodes.length + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ") + " (" + (y.failureSummary || "").split("\n")[1] + ")").join("; ")));
  for (const x of v) found.push(f + " " + x); await ctx.close();
}
assert.deepEqual(found, [], "axe found:\n" + found.join("\n")); ok(PAGES.length + " pages pass axe's WCAG 2.1 A/AA rules (" + (M ? "phone, dark" : "desktop, light") + ")");

const ctx = await fresh(), p = await ctx.newPage(); await p.goto("http://localhost:8099/watchyourgrass-app.html"); await p.waitForSelector("#board [role=row] [role=gridcell]");
assert.equal(await p.$$eval("#board [role=gridcell][tabindex='0']", (x) => x.length), 1, "one tab stop for the whole lawn");
await p.focus("#board [role=gridcell][tabindex='0']"); assert.match(await p.evaluate(() => document.activeElement.getAttribute("aria-label")), /^Row 1, column 1: /);
await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowRight"); assert.match(await p.evaluate(() => document.activeElement.getAttribute("aria-label")), /^Row 2, column 2: grass|^Row 2, column 2: the path/);
const sun0 = await p.evaluate(() => WYG.S.sun), k = await p.evaluate(() => { const [k, P] = Object.entries(WYG.PLANTS).filter(([, P]) => !P.tree).sort((a, b) => a[1].cost - b[1].cost)[0]; WYG.S.sel = k; return k; });
await p.keyboard.press("Enter"); assert.equal(await p.evaluate(() => WYG.S.grid[1][1] && WYG.S.grid[1][1].k), k, "Enter plants on the focused tile");
assert.ok((await p.evaluate(() => WYG.S.sun)) < sun0); assert.match(await p.evaluate(() => document.querySelector("#board [role=row]:nth-child(2) [role=gridcell]:nth-child(2)").getAttribute("aria-label")), new RegExp("^Row 2, column 2: "));
ok("the lawn plays from the keyboard: one tab stop, arrows move, Enter plants, each tile says what's on it");
await b.close();
