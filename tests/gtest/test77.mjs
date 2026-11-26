// Subscription Sweep's sums (assets/subs/sweep.js), on statements as banks write them:
//  - a US card's CSV (one amount column, spending negative): every subscription found with its cadence, the price rise
//    quoted, overlaps (three video services), what's due next, a lapsed one kept apart; groceries, coffee, fuel, pay and
//    one-off shopping are not subscriptions
//  - a UK bank's CSV (day first, debit and credit columns, semicolons, comma decimals) and the text of a PDF statement (no
//    year on the lines, a posting date and a running balance) read the same way
//  - who took it: card numbers, references, places and payment processors taken out
//  - the cancellation letter quotes the charge
import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const S = require(new URL("../../assets/subs/sweep.js", import.meta.url).pathname);
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const NOW = Date.UTC(2026, 10, 20), d = (y, m, dd) => `${String(m).padStart(2, "0")}/${String(dd).padStart(2, "0")}/${y}`;

// six months of a card, June to November 2026
const rows = ["Transaction Date,Post Date,Description,Category,Type,Amount,Memo"];
const add = (y, m, dd, desc, amt, cat = "Shopping") => rows.push(`${d(y, m, dd)},${d(y, m, dd + 1 > 28 ? dd : dd + 1)},"${desc}",${cat},Sale,${(-amt).toFixed(2)},`);
for (let m = 6; m <= 11; m++) {
  add(2026, m, 3, "NETFLIX.COM 866-579-7172 CA", m < 9 ? 15.49 : 17.99, "Entertainment");
  add(2026, m, 8, "SPOTIFY USA 8775576", 11.99, "Entertainment");
  add(2026, m, 12, "HULU 877-8244858 CA", 7.99, "Entertainment");
  add(2026, m, 15, "PAYPAL *DISNEYPLUS 4029357733", 13.99, "Entertainment");
  add(2026, m, 20, "APPLE.COM/BILL 866-712-7753 CA", 2.99, "Shopping");
  add(2026, m, m === 7 ? 1 : 2, "PLANET FITNESS #1234 BOSTON MA", 24.99, "Health");
  add(2026, m, 6, "WHOLEFDS MKT #10234 BOSTON MA", [84.12, 131.4, 56.02, 102.77, 73.3, 149.9][m - 6], "Groceries");
  add(2026, m, 19, "WHOLEFDS MKT #10234 BOSTON MA", [61.5, 39.95, 120.33, 44.1, 98.7, 33.2][m - 6], "Groceries");
  for (const dd of [2, 9, 10, 16, 23, 24]) add(2026, m, dd, "SQ *BLUE BOTTLE COFFEE", 5.75, "Food & Drink");
  add(2026, m, [4, 17, 9, 27, 14, 5][m - 6], "SHELL OIL 57444 BOSTON MA", [41.2, 55.9, 38.05, 61.4, 47.75, 52.1][m - 6], "Gas");
  rows.push(`${d(2026, m, 1)},${d(2026, m, 1)},"ACME CORP PAYROLL",Income,Payment,3200.00,`);
  add(2026, m, 27, "COSTCO WHSE #0123 SOMERVILLE MA", [212.4, 187.9, 240.15, 199.0, 226.75, 205.3][m - 6], "Groceries"); // once a month, but never the same amount
}
for (let m = 6; m <= 8; m++) add(2026, m, 25, "PELOTON* MEMBERSHIP", 44.0, "Health"); // cancelled in August
for (const [m, dd] of [[9, 1], [9, 8], [9, 15], [9, 22], [9, 29], [10, 6], [10, 13], [10, 20], [10, 27], [11, 3], [11, 10], [11, 17]]) add(2026, m, dd, "NYTIMES*NYTIMES DIGITAL", 4.0, "News");
add(2026, 7, 14, "BEST BUY 00012345", 249.99); add(2026, 10, 2, "IKEA BOSTON", 189.0);
const csv = rows.join("\n") + "\n";

const r = S.read(csv, { now: NOW }); assert.equal(r.format, "csv"); assert.equal(r.dayFirst, false);
assert.ok(r.tx.find((t) => /NETFLIX/.test(t.desc)).amount > 0, "spending is money out"); assert.ok(r.tx.find((t) => /PAYROLL/.test(t.desc)).amount < 0, "pay is money in");
const f = S.find(r.tx, { now: NOW }), by = Object.fromEntries(f.subs.map((s) => [s.key, s]));
assert.deepEqual(Object.keys(by).sort(), ["apple", "disneyplus", "hulu", "netflix", "nytimes", "peloton", "planet fitness", "spotify"], "found: " + Object.keys(by));
ok("a card's CSV: every subscription found; groceries, coffee, fuel, pay and one-off shopping aren't subscriptions, nor a monthly shop that never costs the same");

assert.equal(by.netflix.cadence, "monthly"); assert.equal(by.netflix.amount, 1799); assert.equal(by.netflix.perYear, 21588); assert.equal(by.netflix.count, 6);
assert.deepEqual(by.netflix.rose, [{ from: 1549, to: 1799, date: Date.UTC(2026, 8, 3) }]);
assert.equal(by.nytimes.cadence, "weekly"); assert.equal(by.nytimes.perYear, 20800);
assert.equal(by["planet fitness"].cadence, "monthly", "a charge on the 1st one month and the 2nd the next is still monthly");
assert.equal(by.peloton.lapsed, true, "not charged since August"); assert.ok(!by.netflix.lapsed);
assert.equal(f.perYear, [1799, 1199, 799, 1399, 299, 2499].reduce((a, b) => a + b * 12, 0) + 20800, "the year's cost leaves out what's lapsed");
assert.equal(f.subs[f.subs.length - 1].key, "peloton", "lapsed ones last");
ok("each one's cadence, amount and cost a year; Netflix's rise from $15.49 to $17.99 quoted; the weekly paper; a lapsed membership kept apart");

assert.deepEqual(f.overlaps.map((o) => [o.kind, o.keys.sort()]), [["Video streaming", ["disneyplus", "hulu", "netflix"]]]);
assert.deepEqual(f.due.slice(0, 3), ["nytimes", "planet fitness", "netflix"], "due next, soonest first: " + f.due);
assert.equal(new Date(by.netflix.next).toISOString().slice(0, 10), "2026-12-03");
ok("three video services overlap; what's due in the next month, soonest first");

// a UK bank: day first, semicolons, comma decimals, debit and credit columns
const uk = ["Date;Description;Debit;Credit;Balance"];
for (const [mm, dd] of [["07", "14"], ["08", "14"], ["09", "15"], ["10", "14"], ["11", "14"]]) { uk.push(`${dd}/${mm}/2026;DD VODAFONE LIMITED;32,00;;1.204,10`); uk.push(`${String(+dd + 3)}/${mm}/2026;CARD PAYMENT TO NOW TV;9,99;;1.100,00`); uk.push(`28/${mm}/2026;SALARY ACME LTD;;2.450,00;3.550,00`); }
const u = S.read(uk.join("\n"), { now: NOW }); assert.equal(u.dayFirst, true); assert.equal(u.tx.length, 15); assert.equal(u.tx[0].date, Date.UTC(2026, 6, 14)); assert.equal(u.tx[0].amount, 3200); assert.equal(u.tx.find((t) => /SALARY/.test(t.desc)).amount, -245000);
const uf = S.find(u.tx, { now: NOW }); assert.deepEqual(uf.subs.map((s) => [s.key, s.cadence, s.amount]).sort(), [["now tv", "monthly", 999], ["vodafone", "monthly", 3200]]);
assert.deepEqual(uf.overlaps, [], "a phone bill doesn't overlap anything");
ok("a UK bank's CSV (day first, semicolons, comma decimals, debit and credit columns) reads the same way");

// the text of a PDF card statement: no year on the lines, a posting date, money out positive, payments negative
const pdf = "Statement period Aug 20, 2026 - Nov 19, 2026\nTrans Post Description Amount\n" +
  ["08/22 08/23 ADOBE *CREATIVE CLOUD 408-536-6000 CA 59.99", "09/22 09/23 ADOBE *CREATIVE CLOUD 408-536-6000 CA 59.99", "10/22 10/24 ADOBE *CREATIVE CLOUD 408-536-6000 CA 59.99",
   "09/02 09/03 PAYMENT THANK YOU -500.00", "09/05 09/06 TARGET 00012345 CAMBRIDGE MA 76.20", "08/30 08/31 DROPBOX*ABC123XYZ 11.99", "09/30 10/01 DROPBOX*DEF456UVW 11.99", "10/30 10/31 DROPBOX*GHI789RST 11.99",
   "09/14 09/15 ICLOUD STORAGE APPLE.COM/BILL 2.99"].join("\n");
const p = S.read(pdf, { now: NOW }); assert.equal(p.format, "text"); assert.equal(p.tx.length, 9); assert.equal(p.tx.find((t) => /ADOBE/.test(t.desc)).date, Date.UTC(2026, 7, 22));
assert.equal(p.tx.find((t) => /PAYMENT/.test(t.desc)).amount, -50000);
const pf = S.find(p.tx, { now: NOW }); assert.deepEqual(pf.subs.map((s) => s.key).sort(), ["adobe", "dropbox"]); assert.equal(pf.subs.find((s) => s.key === "dropbox").count, 3, "one merchant, whatever reference each charge carries");
ok("a PDF statement's text (no year on the lines, a posting date, payments negative) reads the same way");

for (const [desc, key] of [["NETFLIX.COM 866-579-7172 CA", "netflix"], ["AMAZON PRIME*1A2B3C AMZN.COM/BILL WA", "amazon prime"], ["GOOGLE *YouTubePremium g.co/helppay#", "youtubepremium"], ["SQ *BLUE BOTTLE COFFEE", "blue bottle"], ["DD VODAFONE LIMITED", "vodafone"]]) assert.equal(S.who(desc), key, desc);
assert.equal(S.cents("(15.49)"), -1549); assert.equal(S.cents("1.234,56"), 123456); assert.equal(S.cents("15.49 CR"), -1549); assert.equal(S.cents("−9.99"), -999);
ok("who took it: card numbers, references, places and payment processors taken out; amounts as banks write them");

const L = S.letter(by.netflix, { name: "Ann Lee", account: "ann@example.com" }); assert.match(L, /cancel my subscription with Netflix, which charges \$17\.99 monthly \(most recently on 2026-11-03\)/); assert.match(L, /Account: ann@example\.com/); assert.match(L, /Ann Lee\n$/);
ok("the cancellation letter quotes the charge");
console.log("subscription sweep: all checks passed");
