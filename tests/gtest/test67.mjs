// Second Opinion (src/hive-quote.js, /api/hive/quote): a quote in, each line out against what it typically costs.
//  - a line is kept only if its words are in the quote word for word; an amount, hours or a rate not written on that
//    line is dropped
//  - the verdict (high, fair, low) is worked out from the amount and the typical range, not taken from the model; a line
//    with no range or no amount is "unclear"
//  - the arithmetic is checked here: hours × rate against the line; the lines (less a discount) against the total; the
//    same work charged twice is marked
//  - a reply that can't be used is an error; text with no prices is refused before a model is asked; visitors get
//    QUOTE_DAY a day
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("./harness.mjs"), { db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const V = { "cf-connecting-ip": "203.0.113.67" };
const QUOTE = `Riverside Auto Repair — Estimate #4471
Front brake pads (ceramic), pair .......... $189.00
Front rotors, pair ........................ $420.00
Labour: 2.5 hrs @ $140/hr ................. $380.00
Brake fluid flush ......................... $149.99
Shop supplies fee ......................... $35.00
Brake fluid flush ......................... $149.99
Loyalty discount .......................... -$25.00
Sales tax ................................. $48.12
TOTAL ..................................... $1,347.10`;
H.setResponder((sys, user) => /You check quotes and invoices/.test(sys) ? (/garbled/.test(user) ? "I can't help with that." : JSON.stringify({ trade: "car brake repair", lines: [
  { quote: "Front brake pads (ceramic), pair .......... $189.00", desc: "Front brake pads", kind: "part", amount: 189, lo: 60, hi: 150, why: "Ceramic pads for one axle." },
  { quote: "front rotors, pair ........................ $420.00", desc: "Front rotors", kind: "part", amount: 420, lo: 120, hi: 300, why: "Two rotors." },
  { quote: "Labour: 2.5 hrs @ $140/hr ................. $380.00", desc: "Labour", kind: "labour", amount: 380, hours: 2.5, rate: 140, lo: 150, hi: 400, why: "Pads and rotors take 1.5 to 2.5 hours." },
  { quote: "Brake fluid flush ......................... $149.99", desc: "Brake fluid flush", kind: "other", amount: 149.99, lo: 80, hi: 150, why: "A flush." },
  { quote: "Brake fluid flush ......................... $149.99", desc: "Brake fluid flush", kind: "other", amount: 149.99, lo: 80, hi: 150, why: "A second flush." },
  { quote: "Shop supplies fee ......................... $35.00", desc: "Shop supplies", kind: "fee", amount: 99, lo: 0, hi: 40, why: "Often waived." },
  { quote: "Loyalty discount .......................... -$25.00", desc: "Discount", kind: "discount", amount: -25 },
  { quote: "Sales tax ................................. $48.12", desc: "Tax", kind: "tax", amount: 48.12, lo: 1, hi: 2 },
  { quote: "Caliper rebuild kit ....................... $210.00", desc: "Caliper rebuild", kind: "part", amount: 210, lo: 40, hi: 90, why: "invented" },
  { quote: "Wheel alignment ($120)", desc: "Alignment", kind: "labour", amount: 120, why: "paraphrase, not in the quote" },
  { quote: "Front brake pads (ceramic), pair .......... $189.00", desc: "repeat", kind: "part", amount: 189 },
], total: { quote: "TOTAL ..................................... $1,347.10", amount: 1347.1 }, notes: ["No warranty is stated on the parts or the work.", "The brake fluid flush is listed twice."] })) : null);

let r = await H.call("/quote", { text: QUOTE, name: "brakes.pdf" }, false, V);
assert.equal(r.trade, "car brake repair"); assert.equal(r.lines.length, 8, JSON.stringify(r.lines.map((l) => l.desc)));
assert.ok(!JSON.stringify(r).includes("Caliper") && !JSON.stringify(r).includes("alignment"), "an invented line and a paraphrase are dropped");
const L = Object.fromEntries(r.lines.map((l) => [l.desc, l]));
assert.equal(L["Front brake pads"].verdict, "high"); assert.equal(L["Front rotors"].verdict, "high"); assert.equal(L["Labour"].verdict, "fair"); assert.equal(L["Brake fluid flush"].verdict, "fair");
assert.equal(L["Shop supplies"].amount, null, "99 isn't written on that line: dropped"); assert.equal(L["Shop supplies"].verdict, "unclear");
assert.equal(L["Tax"].typical, undefined, "no typical range for tax"); assert.equal(L["Tax"].verdict, "unclear"); assert.equal(L["Discount"].amount, 25);
assert.ok(r.lines.every((l) => Number.isInteger(l.at) && l.at >= 0));
ok("lines are kept only if quoted word for word; an amount not on its line is dropped; high, fair and low come from the amount and the range, not the model");

assert.equal(L["Labour"].math, "off", "2.5 × $140 is $350, not $380"); assert.equal(L["Labour"].hours, 2.5); assert.equal(L["Labour"].rate, 140);
assert.equal(r.lines.filter((l) => l.twice).length, 2, "the flush, charged twice"); assert.ok(r.lines.filter((l) => l.twice).every((l) => l.desc === "Brake fluid flush"));
// 189 + 420 + 380 + 149.99 + 149.99 + 48.12 - 25 = 1312.10 (the shop supplies line's amount was dropped), against a stated 1347.10
assert.equal(r.total.stated, 1347.1); assert.equal(r.total.sum, 1312.1); assert.equal(r.total.ok, false);
assert.deepEqual(r.notes, ["No warranty is stated on the parts or the work.", "The brake fluid flush is listed twice."]);
ok("the arithmetic is checked here: hours × rate against the line, the lines against the total, and the same work charged twice");

r = await H.call("/quote", { text: "garbled " + QUOTE }, false, V); assert.match(r.error, /couldn't read the lines/);
const calls = H.calls.length; r = await H.call("/quote", { text: "Please fix my brakes soon, thank you very much indeed." }, false, V); assert.match(r.error, /doesn't look like a quote/); assert.equal(H.calls.length, calls, "no model asked");
ok("a reply that can't be used is an error, never an all-clear; text without prices is refused before any model is asked");

db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n").run("quote:" + new Date().toISOString().slice(0, 10) + ":" + V["cf-connecting-ip"], 12);
r = await H.call("/quote", { text: QUOTE }, false, V); assert.match(r.error, /today's 12 second opinions/);
r = await H.call("/quote", { text: QUOTE }, true); assert.equal(r.lines.length, 8, "the owner has no count");
ok("visitors get 12 a day; the owner has no count");
console.log("second opinion: all checks passed");
