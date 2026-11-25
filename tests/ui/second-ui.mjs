// Second Opinion (/second) in Chromium. /api/hive/quote answers with the real checks (src/hive-quote.js checkQuote) over a
// canned model reply, so what the page shows is what the server would send:
//  - a pasted quote: the lines that look high are counted and drawn against their typical range; the sums don't add up
//    and it says so; hours × rate and a line charged twice are caught; "What to ask them" lists each, and copies
//  - a text file is read on the device and checked the same way; a server refusal is shown as it's worded
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { checkQuote } = await import(REPO + "/src/hive-quote.js");
const QUOTE = `Riverside Auto Repair — Estimate #4471
Front brake pads (ceramic), pair .......... $189.00
Front rotors, pair ........................ $420.00
Labour: 2.5 hrs @ $140/hr ................. $380.00
Brake fluid flush ......................... $149.99
Brake fluid flush ......................... $149.99
Sales tax ................................. $48.12
TOTAL ..................................... $1,400.00`;
const REPLY = { trade: "car brake repair", lines: [
  { quote: "Front brake pads (ceramic), pair .......... $189.00", desc: "Front brake pads", kind: "part", amount: 189, lo: 60, hi: 150, why: "Ceramic pads for one axle usually run $60–150." },
  { quote: "Front rotors, pair ........................ $420.00", desc: "Front rotors", kind: "part", amount: 420, lo: 120, hi: 300, why: "Two rotors." },
  { quote: "Labour: 2.5 hrs @ $140/hr ................. $380.00", desc: "Labour", kind: "labour", amount: 380, hours: 2.5, rate: 140, lo: 150, hi: 400, why: "Pads and rotors take 1.5 to 2.5 hours." },
  { quote: "Brake fluid flush ......................... $149.99", desc: "Brake fluid flush", kind: "other", amount: 149.99, lo: 80, hi: 150 },
  { quote: "Brake fluid flush ......................... $149.99", desc: "Brake fluid flush", kind: "other", amount: 149.99, lo: 80, hi: 150 },
  { quote: "Sales tax ................................. $48.12", desc: "Sales tax", kind: "tax", amount: 48.12 }],
  total: { quote: "TOTAL ..................................... $1,400.00", amount: 1400 }, notes: ["No warranty is stated on the parts or the work."] };
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
let refuse = null; const asked = [];
await ctx.route(/\/api\/hive\/quote/, (rt) => { const body = JSON.parse(rt.request().postData()); asked.push(body);
  if (refuse) return rt.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: refuse }) });
  rt.fulfill({ contentType: "application/json", body: JSON.stringify({ ...checkQuote(JSON.stringify(REPLY), body.text), cut: false, read: body.text.length }) }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);

await p.goto("http://localhost:8099/second.html"); await p.fill("#text", "too short"); await p.click("#go"); assert.match(await p.textContent("#st"), /Paste the whole quote/); assert.equal(asked.length, 0);
await p.fill("#text", QUOTE); await p.click("#go"); await p.waitForSelector("#out .ln");
assert.equal(await p.textContent("#out h2"), "car brake repair"); assert.equal(await p.textContent("#n-high"), "2"); assert.equal(await p.textContent("#adds"), "No");
assert.equal(await p.$$eval("#out .ln", (x) => x.length), 6); assert.equal(await p.$$eval("#out .ln.high", (x) => x.length), 2);
assert.match(await p.textContent("#out .ln.high"), /Front brake pads[\s\S]*High[\s\S]*\$189[\s\S]*Typical \$60–\$150[\s\S]*This line \$189/);
assert.equal(await p.$$eval("#out .ln.high .range .tick", (x) => x.length), 2, "the line's price is drawn on its typical range");
assert.match(await p.textContent("#out .lines"), /2\.5 h × \$140 = \$350, not \$380/); assert.equal(await p.$$eval("#out .ln .warn", (x) => x.filter((w) => /more than once/.test(w.textContent)).length), 2);
ok("a pasted quote: two lines look high, each drawn against its typical range; hours × rate and a line charged twice are caught; the total doesn't add up");

const asks = await p.$$eval("#ask li", (x) => x.map((l) => l.textContent));
assert.match(asks[0], /“Front brake pads” is \$189; that's usually \$60–\$150/); assert.match(asks[1], /“Front rotors” is \$420/);
assert.ok(asks.some((a) => /“Labour”: 2\.5 hours at \$140 is \$350, but the line says \$380/.test(a))); assert.ok(asks.some((a) => /“Brake fluid flush” appears 2 times/.test(a)));
assert.ok(asks.some((a) => /add up to \$1,337\.10, but the total says \$1,400/.test(a)), JSON.stringify(asks)); assert.ok(asks.includes("No warranty is stated on the parts or the work."));
await p.click("#copy"); await p.waitForFunction(() => document.querySelector("#copy").textContent === "Copied");
if (!M) assert.match(await p.evaluate(() => navigator.clipboard.readText()), /^A few questions about the quote:\n1\. “Front brake pads”/);
ok("What to ask them: each high line with its usual price, the hours × rate, the repeat, the total that doesn't add up, and the notes; one tap copies them");

await p.setInputFiles("#file", { name: "estimate.txt", mimeType: "text/plain", buffer: Buffer.from(QUOTE) }); await p.waitForFunction(() => document.querySelectorAll("#out .ln").length === 6);
assert.equal(asked.at(-1).name, "estimate.txt"); assert.equal(asked.at(-1).text, QUOTE);
refuse = "that's today's 12 second opinions; more tomorrow"; await p.click("#go"); await p.waitForSelector("#st.bad"); assert.equal(await p.textContent("#st"), "That's today's 12 second opinions; more tomorrow.");
ok("a text file is read on the device and checked the same way; a refusal is shown as the server words it");
assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
