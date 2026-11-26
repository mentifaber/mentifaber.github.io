// Due Dates (/due) in Chromium. Every request off the page is refused and recorded: no letter leaves the device.
//  - with no Home Record on the device, none is made; with one, its warranties (and a repair's) join the list
//  - a pasted renewal letter: its three dates, each with its sentence and the date marked, from its sender; not the
//    letter's own date, not "since 2019"
//  - a summons chosen as a file: the day to report, with its time
//  - untick one, rename one: the calendar file has the rest, renamed, with the warranties; the list is kept after a reload
//  - remove, clear; axe finds nothing
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [], off = [];
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", acceptDownloads: true, locale: "en-US" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => { off.push(rt.request().url()); rt.abort(); });
await ctx.route(/localhost:8099\/api\//, (rt) => { off.push(rt.request().url()); rt.abort(); });
const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ahead = (days) => { const t = new Date(Date.now() + days * 864e5); return { iso: t.toISOString().slice(0, 10), long: t.getUTCDate() + " " + MONTHS[t.getUTCMonth()] + " " + t.getUTCFullYear(), us: MONTHS[t.getUTCMonth()] + " " + t.getUTCDate() + ", " + t.getUTCFullYear() }; };
const sent = ahead(-6), change = ahead(20), renew = ahead(36), debit = ahead(37), report = ahead(50), warr = ahead(45), repairFrom = ahead(-20);
const letter = `Northwind Insurance\n${sent.long}\n\nDear Ms Lee,\n\nYour home insurance policy HX-20391 renews on ${renew.long}. Your new premium is $1,284.00.\nIf you'd like to change your cover, please contact us before ${change.long}. Your current policy has been with us since 3 March 2019.\n\nThe first payment of $107.00 will be taken by direct debit on ${debit.long}.\n\nYours sincerely,\nCustomer Services`;
const summons = `Superior Court of the County\nJURY SUMMONS\nYou are summoned to report for jury service on ${report.us} at 8:30 a.m. at the County Courthouse, 400 Main St.`;

try {
  await p.goto("http://localhost:8099/due.html"); await p.waitForTimeout(300);
  assert.equal(await p.isHidden("#rec-box"), true); assert.deepEqual(await p.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)), [], "no Home Record is made by looking for one");
  await p.evaluate(({ warr, repairFrom }) => new Promise((ok) => { const r = indexedDB.open("homerecord", 1); r.onupgradeneeded = () => r.result.createObjectStore("things", { keyPath: "id" });
    r.onsuccess = () => { const t = r.result.transaction("things", "readwrite"); t.objectStore("things").put({ id: "t1", name: "Dishwasher", model: "Bosch SMS6", warranty: warr, passports: [] });
      t.objectStore("things").put({ id: "t2", name: "Laptop", model: "", warranty: "2020-01-01", passports: [{ ref: "RC-AB12", date: repairFrom, warrantyDays: 90 }] }); t.oncomplete = () => { r.result.close(); ok(); }; }; }), { warr: warr.iso, repairFrom: repairFrom.iso });
  // Subscription Sweep's last sweep on this phone: Netflix next charges in 12 days; one set aside as not a subscription
  await p.evaluate(({ next }) => { localStorage.setItem("subs:last", JSON.stringify({ subs: [{ key: "netflix", name: "Netflix", amount: 1799, next, every: 30.4, lapsed: false }, { key: "tesco", name: "Tesco", amount: 4200, next, every: 7, lapsed: false }] })); localStorage.setItem("subs:marks", JSON.stringify({ tesco: "not" })); }, { next: Date.parse(ahead(12).iso + "T00:00:00Z") });
  await p.reload(); await p.waitForSelector("#rec-box:not([hidden])");
  assert.match(await p.textContent("#rec"), /Warranty ends: Dishwasher \(Bosch SMS6\)[\s\S]*Repair warranty ends: Laptop \(RC-AB12\)/); assert.doesNotMatch(await p.textContent("#rec"), /2020/, "an ended warranty isn't listed"); assert.match(await p.textContent("#rec"), /Netflix charges \$17\.99[\s\S]*From Subscription Sweep/); assert.doesNotMatch(await p.textContent("#rec"), /Tesco/, "not one set aside");
  ok("no Home Record is made by looking for one; with one on the device, its warranties and a repair's join the list, not one that's ended; Subscription Sweep's next charge joins too, not one set aside");

  await p.fill("#text", letter); await p.click("#f button[type=submit]"); await p.waitForFunction(() => /3 dates found/.test(document.querySelector("#st").textContent));
  const titles = await p.$$eval("#items .ttl", (x) => x.map((e) => e.value)); assert.deepEqual(titles, ["Reply · Northwind Insurance", "Renew · Northwind Insurance", "Pay · Northwind Insurance"]);
  assert.equal(await p.textContent("#items .item:nth-child(2) mark"), renew.long); assert.match(await p.textContent("#items .item:nth-child(2) q"), /renews on .* Your new premium|renews on [^.]*\./);
  assert.doesNotMatch(await p.textContent("#items"), /2019/); assert.equal(await p.inputValue("#text"), "", "cleared for the next letter");
  ok("a pasted renewal letter: its three dates from Northwind Insurance, each with its sentence and the date marked; not the letter's own date, not 2019");

  await p.setInputFiles("#files", { name: "summons.txt", mimeType: "text/plain", buffer: Buffer.from(summons) }); await p.waitForFunction(() => /1 date found/.test(document.querySelector("#st").textContent));
  const jury = p.locator("#items .item", { hasText: "jury service" }); assert.match(await jury.textContent(), /Appointment.* at 08:30/); assert.equal(await jury.locator(".ttl").inputValue(), "Appointment · Superior Court of the County");
  ok("a summons chosen as a file: the day to report with its time, from the court");

  await p.locator("#items .item", { hasText: "direct debit" }).locator("[data-f=on]").uncheck(); await p.waitForSelector("#items .item.off");
  const ttl = jury.locator(".ttl"); await ttl.fill("Jury service, County Courthouse"); await ttl.press("Tab");
  await p.waitForFunction(() => /Add 6 to my calendar/.test(document.querySelector("#dl").textContent));
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#dl")]); assert.equal(dl.suggestedFilename(), "due-dates.ics");
  const cal = fs.readFileSync(await dl.path(), "utf8").replace(/\r\n /g, "");
   assert.match(cal, /SUMMARY:Jury service\\, County Courthouse/); assert.match(cal, new RegExp("DTSTART:" + report.iso.replace(/-/g, "") + "T083000"));
  assert.doesNotMatch(cal, /direct debit/, "the unticked one isn't in it"); assert.match(cal, /SUMMARY:Warranty ends: Dishwasher/); assert.match(cal, /SUMMARY:Netflix charges \$17\.99/); assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 6); assert.match(cal, new RegExp("DTSTART;VALUE=DATE:" + warr.iso.replace(/-/g, "")));
  await p.reload(); await p.waitForSelector("#items .item"); assert.equal(await p.$$eval("#items .item", (x) => x.length), 4); assert.equal(await p.$$eval("#items .item.off", (x) => x.length), 1);
  assert.equal(await jury.locator(".ttl").inputValue(), "Jury service, County Courthouse");
  ok("untick one, rename one: the calendar file has the rest, renamed and timed, with the Home Record's warranties; all kept after a reload");

  await p.addScriptTag({ content: AXE }); const v = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; ")));
  assert.deepEqual(v, []); ok("axe finds nothing on the list");

  await jury.locator("[data-rm]").click(); assert.equal(await p.$$eval("#items .item", (x) => x.length), 3);
  p.once("dialog", (d) => d.accept()); await p.click("#clear"); await p.waitForFunction(() => /Nothing yet/.test(document.querySelector("#items").textContent));
  ok("remove one; clear the list");

  assert.deepEqual(off, [], "nothing left the page: " + off.join(", ")); assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
