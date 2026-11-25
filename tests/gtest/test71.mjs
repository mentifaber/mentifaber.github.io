// Bill Watch's comparison (assets/bills/compare.js), the code the page runs on the device: a month's bill against the
// one before, matched by label with dates and "4 of 24" counters taken out:
//  - amounts read as written: $1,234.56, -$10.00, −10.00, ($15.00), 10.00 CR; lines with no amount are skipped
//  - what went up (with the percent), what's new, a discount that ended or got smaller, what went away, what's the same
//  - payments and previous balances aren't charges; a "late payment fee" is; subtotals and totals aren't lines
//  - the total is "current charges" over "amount due" over "total"; what the lines don't explain is called out
//  - a line written twice is matched twice; a heads-up ("will increase", "promotion ends") is quoted
//  - the questions to ask quote each change; tax that only follows the charges isn't asked about
import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse, compare, money, signed } = require(new URL("../../assets/bills/compare.js", import.meta.url).pathname);
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);

const p = parse("Plan $1,234.56\nAutopay discount -$10.00\nLoyalty credit −10.00\nPromo credit ($15.00)\nRefund 10.00 CR\nWelcome to your bill\nAccount 4471-22\nCall 555 0100");
assert.deepEqual(p.lines.map((l) => [l.label, l.amount, l.kind]), [["Plan", 123456, "charge"], ["Autopay discount", -1000, "discount"], ["Loyalty credit", -1000, "discount"], ["Promo credit", -1500, "discount"], ["Refund", -1000, "discount"]]);
assert.equal(money(-1500), "−$15.00"); assert.equal(signed(2500), "+$25.00"); assert.equal(money(123456), "$1,234.56");
ok("amounts as bills write them, credits as negatives; lines without an amount (or with only an account number) are skipped");

const k = parse("Previous balance $92.10\nPayment received - thank you -92.10\nPayment -10.00\nLate payment fee 7.00\nSubtotal 99.00\nTotal 98.00\nAmount due by Dec 21 $130.10\nTotal current charges $120.10");
assert.deepEqual(k.lines.map((l) => [l.label, l.kind]), [["Previous balance", "account"], ["Payment received - thank you", "account"], ["Payment", "account"], ["Late payment fee", "charge"]]);
assert.equal(k.total.amount, 12010, "current charges, not the amount due (which carries the last balance)");
assert.equal(parse("Subtotal 99.00\nTotal 98.00").total.amount, 9800); assert.equal(parse("Plan 10.00\nAmount due $12.00").total.amount, 1200); assert.equal(parse("Plan 10.00").total, null);
ok("payments and balances aren't charges, a late payment fee is; the total is current charges, then amount due, then total, never a subtotal");

const OCT = `Bill period Oct 1 - Oct 31, 2026
Previous balance $92.10
Payment received - thank you -92.10
Unlimited Plus plan (Oct 1 - Oct 31) $70.00
Line 2 access 20.00
Device payment 3 of 24 $25.00
Autopay discount -$10.00
New customer promo credit (6 of 12) ($15.00)
Paper bill fee 2.00
Regulatory cost recovery fee 2.49
Sales tax 4.11
Total current charges $98.60
Amount due by 11/21/2026 $98.60`;
const NOV = `Bill period Nov 1 - Nov 30, 2026
Previous balance $98.60
Payment received - thank you -98.60
Unlimited Plus plan (Nov 1 - Nov 30) $75.00
Line 2 access 20.00
Device payment 4 of 24 $25.00
Autopay discount -$5.00
Regulatory cost recovery fee 3.49
Late payment fee 7.00
Sales tax 4.61
Total current charges $135.10
Amount due by 12/21/2026 $135.10
Your plan price will increase to $80.00 from January 2027.`;
const r = compare(OCT, NOV), st = (s) => r.rows.filter((x) => x.status === s).map((x) => x.label);
assert.deepEqual(st("up"), ["Unlimited Plus plan (Nov 1 - Nov 30)", "Regulatory cost recovery fee", "Sales tax"]);
assert.equal(r.rows.find((x) => x.label.startsWith("Unlimited")).pct, 7);
assert.deepEqual(st("same"), ["Line 2 access", "Device payment 4 of 24"], "dates and 'n of 24' are taken out of the label");
assert.deepEqual(st("new"), ["Late payment fee"]); assert.deepEqual(st("discount-smaller"), ["Autopay discount"]); assert.deepEqual(st("discount-ended"), ["New customer promo credit (6 of 12)"]); assert.deepEqual(st("gone"), ["Paper bill fee"]);
assert.equal(r.rows.find((x) => x.status === "new").after.raw, "Late payment fee 7.00", "quoted as written");
ok("two months of a phone bill: up (with the percent), new, a discount smaller, a promo ended, a fee gone, the rest the same");

assert.equal(r.total.change, 3650); assert.equal(r.explained, 3150); assert.equal(r.unexplained, 500);
assert.deepEqual(r.notes, ["Your plan price will increase to $80.00 from January 2027."]);
assert.equal(r.questions.length, 7, r.questions.join("\n"));
assert.match(r.questions[0], /^“Unlimited Plus plan \(Nov 1 - Nov 30\)” went from \$70\.00 to \$75\.00 \(\+\$5\.00\)\. Why, and can it go back to \$70\.00\?$/);
assert.ok(!r.questions.some((q) => /Sales tax/.test(q)), "tax that follows the charges isn't asked about");
assert.ok(r.questions.some((q) => /^My “New customer promo credit \(6 of 12\)” \(−\$15\.00\) isn't on this bill\. Has it ended\?/.test(q)));
assert.ok(r.questions.some((q) => q === "The bill went up by $36.50, but the charges listed account for +$31.50. What's the other $5.00?"));
assert.ok(r.questions.some((q) => q === "The bill says: “Your plan price will increase to $80.00 from January 2027.” What will that mean for what I pay, and from when?"));
ok("the total went up $36.50; the lines explain $31.50 and the other $5.00 is asked about; the price rise ahead is quoted; seven questions");

const two = compare("Streaming add-on 9.99\nStreaming add-on 9.99\nPlan 50.00", "Streaming add-on 9.99\nStreaming add-on 12.99\nStreaming add-on 12.99\nPlan 50.00");
assert.deepEqual(two.rows.map((x) => x.status), ["same", "up", "new", "same"], "a line written twice is matched twice, in order");
assert.equal(two.total, null); assert.equal(two.explained, 1599);
const flat = compare("Plan 50.00\nTotal 50.00", "Plan 50.00\nTotal 50.00"); assert.deepEqual(flat.questions, []); assert.equal(flat.total.change, 0);
ok("a repeated line is matched one for one (a third copy is new); with no total the lines' sum is the change; the same bill asks nothing");
console.log("bill watch: all checks passed");
