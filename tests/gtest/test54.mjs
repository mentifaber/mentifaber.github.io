// Fine Print (src/hive-fine.js, /api/hive/fineprint): a document in, the lines that matter out, each quoted word for word.
//  - a flag whose quote is in the document passes (case, spacing and curly quotes aside) with where it is
//  - a paraphrase, an invented clause or a repeat is dropped; kinds and severities outside the lists are corrected
//  - a reply that isn't usable is an error, not an empty "all clear"
//  - too-short documents are refused before a model is asked; long ones are cut at 24,000 characters and say so
//  - visitors get FINE_DAY readings a day; the owner has no count
import assert from "node:assert/strict";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("./harness.mjs"), { db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const V = { "cf-connecting-ip": "203.0.113.64" };
const LEASE = `RESIDENTIAL LEASE. The tenant shall pay rent of $1,450 on the first day of each month. A late fee of $95 applies to any rent received after the 3rd day of the month.
This lease renews automatically for successive twelve-month terms unless either party gives written notice at least 60 days before the end of the term.
The security deposit of $2,900 is non-refundable if the tenant ends the lease early. Any dispute shall be resolved by binding arbitration, and the tenant waives the right to a jury trial.
The landlord may share the tenant’s contact details with marketing partners.`;
H.setResponder((sys, user) => /You read documents for ordinary people/.test(sys) ? (/garbled/.test(user) ? "Sorry, I can't help with that." : JSON.stringify({ kind: "residential lease", flags: [
  { quote: "This lease renews automatically for successive twelve-month terms unless either party gives written notice at least 60 days before the end of the term.", kind: "auto-renewal", severity: "high", why: "Miss the 60-day window and you're in for another year." },
  { quote: "A LATE FEE OF $95   applies to any rent received after the 3rd day of the month.", kind: "fee", severity: "medium", why: "Rent after the 3rd costs $95 more." },
  { quote: "The landlord may share the tenant's contact details with marketing partners.", kind: "data sharing", severity: "low", why: "Your details can go to marketers." },
  { quote: "The tenant must pay for all repairs, including the roof.", kind: "unusual", severity: "high", why: "invented" },
  { quote: "The deposit is not returned if you leave early.", kind: "deposit", severity: "high", why: "a paraphrase" },
  { quote: "This lease renews automatically for successive twelve-month terms unless either party gives written notice at least 60 days before the end of the term.", kind: "auto-renewal", severity: "high", why: "repeat" },
  { quote: "Any dispute shall be resolved by binding arbitration, and the tenant waives the right to a jury trial.", kind: "court", severity: "catastrophic", why: "No court, no jury." },
] })) : null);

let r = await H.call("/fineprint", { text: LEASE, name: "lease.pdf" }, false, V);
assert.equal(r.kind, "residential lease"); assert.deepEqual(r.flags.map((f) => f.kind), ["auto-renewal", "fee", "data sharing", "unusual"], JSON.stringify(r.flags));
assert.equal(r.flags[1].quote, "A LATE FEE OF $95   applies to any rent received after the 3rd day of the month.", "kept as the model quoted it; matched ignoring case and spacing");
assert.equal(r.flags[3].severity, "medium", "an unknown severity becomes medium"); assert.match(r.flags[3].why, /No court/);
assert.ok(r.flags.every((f) => Number.isInteger(f.at) && f.at >= 0)); assert.ok(!JSON.stringify(r).includes("roof") && !JSON.stringify(r).includes("not returned"));
assert.equal(r.cut, false); assert.equal(H.calls.at(-1).user.startsWith("The document (lease.pdf):"), true);
ok("lines quoted word for word pass (case, spacing and curly quotes aside), with where they are; an invented clause, a paraphrase and a repeat are dropped; an unknown kind or severity is corrected");

r = await H.call("/fineprint", { text: "garbled " + LEASE }, false, V); assert.match(r.error, /couldn't read that one/);
ok("a reply that can't be used is an error, never an empty all-clear");

r = await H.call("/fineprint", { text: "Pay $5." }, false, V); assert.match(r.error, /too short/);
const calls = H.calls.length; r = await H.call("/fineprint", { text: LEASE + " " + "x ".repeat(20000) }, true); assert.equal(r.cut, true); assert.equal(r.read, 24000); assert.ok(H.calls.length === calls + 1);
ok("a too-short document is refused before any model is asked; a long one is read to 24,000 characters and says it was cut");

db.prepare("INSERT INTO limits(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n").run("fine:" + new Date().toISOString().slice(0, 10) + ":" + V["cf-connecting-ip"], 12);
r = await H.call("/fineprint", { text: LEASE }, false, V); assert.match(r.error, /today's 12 Fine Print readings/);
r = await H.call("/fineprint", { text: LEASE }, true); assert.equal(r.flags.length, 4, "the owner has no count");
ok("a visitor gets 12 Fine Print readings a day; the owner has no count");
console.log("test54: " + n + " checks passed");
