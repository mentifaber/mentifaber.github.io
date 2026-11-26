// The Home Record (/record) in Chromium, with real Device Passports signed by the seal code (src/seal.js):
//  - it brings in the House Manual's appliances (with a Device Passport from an entry's link), never a private entry or
//    a Wi-Fi password; and Fix or Replace's checks, onto a thing already here or as a new one
//  - a warranty running out within 60 days is flagged; a passport's repair warranty counts as cover
//  - a thing's page: details, a receipt, a repair; a forged passport is refused, a genuine one is kept with its repair
//  - handing it over: one zip (record.json, the papers, a summary); the buyer opens it on their own phone and it's all
//    checked; a zip whose passport was edited or whose receipt was swapped brings those in left out, and says so
//  - one thing can be passed on alone
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs"; import os from "node:os"; import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { seal } = await import(REPO + "/src/seal.js");
let keyRec = null;
const env = { STORE: { idFromName: (x) => x, get: () => ({
  sealKey: async () => keyRec || (keyRec = await (async () => { const g = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { pub: await crypto.subtle.exportKey("jwk", g.publicKey), priv: await crypto.subtle.exportKey("jwk", g.privateKey) }; })()),
  hit: async () => true }) } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
const issue = async (b) => (await (await seal(new Request("https://mentifaber.org/api/seal/passport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), env, json, true)).json()).record;
const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const ppDish = await issue({ device: "Bosch SMS6 dishwasher", work: ["Replaced the drain pump"], date: iso(-10), warrantyDays: 90, ref: "MF-DW1", serial: "FD9801-22" });
const ppBoiler = await issue({ device: "Vaillant ecoTEC boiler", work: ["Annual service", "Replaced the ignition electrode"], date: iso(-3), warrantyDays: 365, ref: "MF-BO1" });
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", acceptDownloads: true });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/seal\//, async (rt) => { const q = rt.request(); const r = await seal(new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method() }), env, json, false); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
const errs = []; let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "record-"));

// the seller's phone already has a House Manual and a Fix or Replace check
const p = await phone(); await p.goto("http://localhost:8099/record.html"); await p.waitForSelector("#rooms .status");
await p.evaluate(({ ppDish, warr }) => {
  localStorage.setItem("house:v1", JSON.stringify([
    { id: "h1", kind: "appliance", title: "Dishwasher", where: "Kitchen, left of the sink", det: "Clean the filter monthly", model: "Bosch SMS6", warr, link: "https://mentifaber.org/passport#" + ppDish, priv: false },
    { id: "h2", kind: "appliance", title: "Boiler", where: "Utility cupboard", det: "", model: "Vaillant ecoTEC", warr: "", link: "", priv: false },
    { id: "h3", kind: "wifi", title: "Wi-Fi", where: "Router in the hall", det: "Password: hunter2-secret", model: "", warr: "", link: "", priv: false },
    { id: "h4", kind: "appliance", title: "Alarm panel", where: "Front door", det: "Code 4471", model: "Yale", warr: "", link: "", priv: true },
    { id: "h5", kind: "shutoff", title: "Water shutoff", where: "Under the sink", det: "", model: "", warr: "", link: "", priv: false }]));
  localStorage.setItem("fix:v1", JSON.stringify([{ at: 1764000000000, o: { kind: "laptop", fault: "battery", age: 4, price: 0, model: "", warr: false, rate: 90 }, v: "fix" }]));
}, { ppDish, warr: iso(30) });
await p.reload(); await p.waitForSelector("#from-house:not([hidden])");
assert.equal(await p.textContent("#from-house"), "Bring in 2 from the House Manual"); assert.equal(await p.textContent("#from-fix"), "Bring in 1 Fix or Replace check");
await p.fill("#h-name", "12 Elm Street"); await p.press("#h-name", "Tab");
await p.click("#from-house"); await p.waitForFunction(() => /Brought in 2/.test(document.querySelector("#imp-st").textContent));
assert.match(await p.textContent("#imp-st"), /with 1 Device Passport from their links/);
await p.click("#from-fix"); await p.waitForFunction(() => /as new things/.test(document.querySelector("#imp-st").textContent));
assert.deepEqual(await p.$$eval("#rooms .row b", (x) => x.map((t) => t.textContent)), ["Boiler", "Dishwasher", "Laptop"]);
const seen = await p.innerText("#home") + JSON.stringify(await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open("homerecord"); r.onsuccess = () => { const q = r.result.transaction("things").objectStore("things").getAll(); q.onsuccess = () => ok(q.result.map(({ docs, ...t }) => t)); }; })));
assert.ok(!/hunter2|4471|Alarm panel|Wi-Fi/.test(seen), "no private entry, no Wi-Fi password, on the page or in the record");
assert.match(await p.textContent("#rooms .row:has-text('Dishwasher')"), /1 passport/); assert.ok(await p.isHidden("#from-house") && await p.isHidden("#from-fix"), "nothing left to bring in");
assert.match(await p.textContent("#due-box"), /Running out soon\s*Dishwasher\s*warranty ends .*30 days/);
ok("it brings in the House Manual's appliances (a passport from a link), never a private entry or the Wi-Fi password; a Fix or Replace check; a warranty ending in 30 days is flagged");

// the boiler's page
await p.click("#rooms button:has-text('Boiler')"); await p.waitForSelector("#thing:not([hidden])");
assert.equal(await p.inputValue("#t-model"), "Vaillant ecoTEC"); assert.equal(await p.inputValue("#t-notes"), "Utility cupboard");
await p.fill("#t-room", "Utility"); await p.press("#t-room", "Tab"); await p.fill("#t-bought", "2021-03-14"); await p.dispatchEvent("#t-bought", "change"); await p.fill("#t-price", "2450"); await p.press("#t-price", "Tab");
const receipt = path.join(tmp, "boiler-receipt.pdf"); fs.writeFileSync(receipt, "%PDF-1.4 Vaillant ecoTEC plus, fitted, $2,450.00");
await p.selectOption("#d-what", "receipt"); await p.setInputFiles("#d-files", receipt); await p.waitForSelector("#docs a.lnk");
await p.fill("#l-date", "2024-10-02"); await p.fill("#l-what", "Pressure valve replaced"); await p.fill("#l-cost", "180"); await p.click("#log-f button[type=submit]"); await p.waitForSelector("#log li:has-text('Pressure valve')");
const forged = ppBoiler.replace(/^([^.]+)\.(.)/, (m, a, c) => a + "." + (c === "A" ? "B" : "A"));
const [pl, sig] = ppBoiler.split("."); const body = JSON.parse(Buffer.from(pl, "base64url")); body.data.warrantyDays = 3650; const edited = Buffer.from(JSON.stringify(body)).toString("base64url") + "." + sig;
for (const bad of [forged, edited]) { await p.fill("#pp-in", "https://mentifaber.org/passport#" + bad); await p.click("#pp-f button[type=submit]"); await p.waitForFunction(() => /isn't a genuine Device Passport/.test(document.querySelector("#pp-st").textContent)); await p.evaluate(() => (document.querySelector("#pp-st").textContent = "")); }
await p.fill("#pp-in", "https://mentifaber.org/passport#" + ppBoiler); await p.click("#pp-f button[type=submit]"); await p.waitForSelector("#pps .y");
assert.match(await p.textContent("#pps"), /✓ signed by the workshop · Vaillant ecoTEC boiler[\s\S]*Annual service; Replaced the ignition electrode · repair warranty to/);
assert.match(await p.textContent("#log"), /Workshop repair: Annual service; Replaced the ignition electrode[\s\S]*Pressure valve replaced\s*(Oct 2, 2024|2 Oct 2024) · \$180\.00/);
assert.match(await p.textContent("#t-head"), /Boiler · covered to /, "the repair warranty covers it");
ok("a thing's page: details, a receipt and a repair; a forged or edited passport is refused, a genuine one is kept and its repair added to the history");

// the laptop's Fix or Replace check
await p.click("#back"); await p.waitForFunction(() => document.querySelectorAll("#rooms .room").length === 2); assert.deepEqual(await p.$$eval("#rooms .room > b", (x) => x.map((t) => t.textContent)), ["Around the house", "Utility"]);
await p.click("#rooms button:has-text('Laptop')"); await p.waitForSelector("#checks li"); assert.match(await p.textContent("#checks"), /Fix it[\s\S]*Laptop, 4 years old[\s\S]*Weigh it up again/);
assert.equal(await p.getAttribute("#checks a", "href"), "fix#laptop/battery/4");
const [one] = await Promise.all([p.waitForEvent("download"), p.click("#pass")]); assert.match(one.suggestedFilename(), /^home-record-laptop-\d{4}-\d\d-\d\d\.zip$/);
const onePath = path.join(tmp, "one.zip"); await one.saveAs(onePath);
await p.click("#back"); await p.waitForSelector("#rooms .room");
ok("the laptop's Fix or Replace check reopens the check; one thing can be passed on alone");

// hand the whole record over
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#export")]); assert.match(dl.suggestedFilename(), /^home-record-12-elm-street-\d{4}-\d\d-\d\d\.zip$/);
const zipPath = path.join(tmp, "house.zip"); await dl.saveAs(zipPath);
const names = execFileSync("python3", ["-c", "import sys,zipfile\nprint('\\n'.join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))", zipPath]).toString().trim().split("\n");
assert.deepEqual(names.filter((x) => !x.startsWith("papers/")), ["HOW-TO-OPEN.txt", "record.json", "summary.html"]); assert.equal(names.filter((x) => x.startsWith("papers/boiler-")).length, 1);
const rec = JSON.parse(execFileSync("python3", ["-c", "import sys,zipfile\nprint(zipfile.ZipFile(sys.argv[1]).read('record.json').decode())", zipPath]).toString());
assert.equal(rec.things.length, 3); assert.ok(!JSON.stringify(rec).includes("hunter2"));
const sum = execFileSync("python3", ["-c", "import sys,zipfile\nprint(zipfile.ZipFile(sys.argv[1]).read('summary.html').decode())", zipPath]).toString();
assert.match(sum, /<h1>12 Elm Street<\/h1>[\s\S]*Boiler[\s\S]*Bought<\/dt><dd>(Mar 14, 2021|14 Mar 2021) for \$2,450\.00/);
ok("the whole record downloads as one zip: record.json, the papers, a summary anyone can read, how to open it");

// the buyer's phone
const B = await phone(); await B.goto("http://localhost:8099/record.html"); await B.waitForSelector("#rooms .status");
await B.setInputFiles("#open", zipPath); await B.waitForSelector("#open-out .verdict");
assert.match(await B.textContent("#open-out .verdict.ok"), /✓ Brought in, all of it checked\. 3 things, 1 paper, 2 Device Passports signed by the workshop/);
assert.equal(await B.inputValue("#h-name"), "12 Elm Street"); assert.deepEqual(await B.$$eval("#rooms .row b", (x) => x.map((t) => t.textContent)), ["Dishwasher", "Laptop", "Boiler"]);
await B.click("#rooms button:has-text('Boiler')"); await B.waitForSelector("#docs a.lnk"); assert.match(await B.textContent("#docs"), /boiler-receipt\.pdf\s*Receipt/); assert.match(await B.textContent("#log"), /Pressure valve replaced/);
const [rdl] = await Promise.all([B.waitForEvent("download"), B.click("#docs a.lnk")]); assert.equal(fs.readFileSync(await rdl.path(), "utf8"), "%PDF-1.4 Vaillant ecoTEC plus, fitted, $2,450.00");
ok("the buyer opens it on their own phone: three things, the receipt (byte for byte), two passports, all checked");

// someone edited it on the way
const bad = path.join(tmp, "edited.zip");
execFileSync("python3", ["-c", "import sys,zipfile,json\ni=zipfile.ZipFile(sys.argv[1]);o=zipfile.ZipFile(sys.argv[2],'w')\nfor n in i.namelist():\n d=i.read(n)\n if n=='record.json':\n  j=json.loads(d)\n  for t in j['things']:\n   t['passports']=[sys.argv[3] if p==sys.argv[4] else p for p in t['passports']]\n  d=json.dumps(j).encode()\n elif n.startswith('papers/'): d=b'%PDF-1.4 a different receipt'\n o.writestr(n,d)\no.close()", zipPath, bad, edited, ppBoiler]);
const C = await phone(); await C.goto("http://localhost:8099/record.html"); await C.waitForSelector("#rooms .status");
await C.setInputFiles("#open", bad); await C.waitForSelector("#open-out .verdict.bad");
assert.match(await C.textContent("#open-out .verdict"), /Brought in, with 2 things left out: 3 things, 0 papers, 1 Device Passport signed by the workshop/);
assert.match(await C.textContent("#open-out"), /✗ Boiler: a passport whose signature doesn't check out[\s\S]*✗ Boiler: boiler-receipt\.pdf doesn't match its fingerprint/);
await C.setInputFiles("#open", onePath); await C.waitForFunction(() => /1 thing, 0 papers, 0 Device Passports/.test(document.querySelector("#open-out").textContent));
ok("a record edited on the way: the edited passport and the swapped receipt are left out, and it says which; a single thing's file opens too");

assert.deepEqual(errs, []); for (const x of [p, B, C]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
