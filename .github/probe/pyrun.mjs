import { chromium } from "playwright";
const b = await chromium.launch(), p = await b.newPage(); await p.goto("http://localhost:8099/.github/probe/pyrun.html");
const t0 = Date.now(); let txt = ""; while (Date.now() - t0 < 120000) { txt = await p.textContent("#log"); if (/sum 45/.test(txt) || /exception|error:/.test(txt)) break; await p.waitForTimeout(500); }
const img = await p.frameLocator("#f").locator("img").count();
console.log("after " + Math.round((Date.now() - t0) / 1000) + " s:\n" + txt + "\nmatplotlib figure shown: " + (img > 0));
if (!/mean 2\.5/.test(txt) || !/sum 45/.test(txt) || !img) process.exit(1);
await b.close();
