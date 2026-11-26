// Due Dates (assets/due/dates.js): the dates in letters that ask something of you, and the calendar file.
//  - an insurance renewal: renew on, contact us before, the direct debit; not "with us since 2019", not the letter's date
//  - a jury summons: an appointment with its time, a reply by, a request no later than, a permit valid until
//  - a bill and an email: pay by, expires; dates written day first; a date with no year is the next one; past dates out
//  - the .ics: one event each, all-day unless there's a time, a reminder before, text escaped, lines folded, CRLF
import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const D = require(new URL("../../assets/due/dates.js", import.meta.url).pathname);
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const NOW = Date.UTC(2026, 10, 20, 15), brief = (xs) => xs.map((x) => [x.date, x.time, x.kind]);

const insurance = `Northwind Insurance
14 November 2026

Dear Ms Lee,

Your home insurance policy HX-20391 renews on 1 January 2027. Your new premium is $1,284.00, up from $1,140.00 last year.
If you'd like to change your cover, please contact us before 15 December 2026. Your current policy has been with us since 3 March 2019.

The first payment of $107.00 will be taken by direct debit on 2 January 2027.

Yours sincerely,
Customer Services`;
let f = D.find(insurance, { now: NOW, source: "Northwind Insurance" });
assert.deepEqual(brief(f), [["2026-12-15", null, "reply"], ["2027-01-01", null, "renew"], ["2027-01-02", null, "pay"]]);
assert.equal(f[1].sentence, "Your home insurance policy HX-20391 renews on 1 January 2027."); assert.equal(f[1].sentence.slice(f[1].at, f[1].at + f[1].len), "1 January 2027"); assert.equal(f[0].source, "Northwind Insurance");
ok("an insurance renewal: renew on, contact us before, the direct debit; not the policy's start in 2019, not the letter's own date");

const summons = `SUPERIOR COURT OF THE COUNTY
JURY SUMMONS
Date of notice: 11/02/2026
You are summoned to report for jury service on Monday, January 12, 2027 at 8:30 a.m. at the County Courthouse, 400 Main St.
Complete and return the enclosed questionnaire by December 10, 2026. If you need to postpone, you may request a new date online no later than 12/20/2026.
Your parking permit is valid until 01/16/2027.`;
f = D.find(summons, { now: NOW });
assert.deepEqual(brief(f), [["2026-12-10", null, "reply"], ["2026-12-20", null, "deadline"], ["2027-01-12", "08:30", "appointment"], ["2027-01-16", null, "expires"]]);
ok("a jury summons: the day to report with its time, a reply by, a request no later than, a permit valid until");

const uk = "Dear Customer,\nYour MOT certificate expires on 03/02/2027. Book your test before then.\nPayment of £45.00 is due by 28/12/2026. Your account was opened on 05/06/2015.\nYour boiler service engineer will visit on Thursday 10th December between 8am and 1pm.";
f = D.find(uk, { now: NOW, dayFirst: true });
assert.deepEqual(brief(f), [["2026-12-10", "08:00", "appointment"], ["2026-12-28", null, "pay"], ["2027-02-03", null, "expires"]]);
ok("day-first dates (03/02/2027 is 3 February); a date with no year is the next one; an account opened in 2015 isn't a deadline");

const email = "Hi Ann, your Acme Cloud subscription expires on Dec 31. Renew now to keep your files. Your last payment was on Nov 1, 2026.\nPayment due date: 2026-12-05. Minimum payment $25.00.\nThe offer ended on 1 October 2026.";
f = D.find(email, { now: NOW });
assert.deepEqual(brief(f), [["2026-12-05", null, "pay"], ["2026-12-31", null, "expires"]], JSON.stringify(f));
ok("an email: a payment due date, a subscription that expires on Dec 31; the last payment and an offer already over are left out");

assert.deepEqual(D.find("We met on 3 April 2027 and had lunch. The weather was fine on May 4.", { now: NOW }), [], "dates in passing");
ok("dates in passing aren't asked of you");

const items = [{ date: "2027-01-12", time: "08:30", kind: "appointment", label: "Appointment", title: "Jury service, County Courthouse", sentence: "You are summoned to report for jury service; bring ID, your summons, and a pen.", source: "Superior Court" },
  { date: "2026-12-15", time: null, kind: "reply", label: "Reply", title: "Northwind: change cover before this", sentence: "Please contact us before 15 December 2026. " + "x".repeat(120) }];
const cal = D.ics(items, { now: NOW }), flat = cal.replace(/\r\n /g, ""); // unfolded, as a calendar reads it
assert.ok(cal.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")); assert.ok(cal.endsWith("END:VCALENDAR\r\n")); assert.ok(!/[^\r]\n/.test(cal), "CRLF line ends");
assert.match(flat, /DTSTART:20270112T083000\r\nDURATION:PT1H/); assert.match(flat, /DTSTART;VALUE=DATE:20261215\r\nDTEND;VALUE=DATE:20261216/);
assert.match(flat, /SUMMARY:Jury service\\, County Courthouse/); assert.match(flat, /bring ID\\, your summons\\, and a pen\.\\n\\nFrom: Superior Court/);
assert.match(flat, /TRIGGER:-P1D[\s\S]*TRIGGER:-P3D/, "a day before an appointment, three before a deadline");
for (const line of cal.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, "folded: " + line);
assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 2); assert.equal(new Set(cal.match(/^UID:.*$/gm)).size, 2);
ok("the .ics: an event each, timed or all-day, a reminder before, commas and newlines escaped, long lines folded, CRLF");
console.log("due dates: all checks passed");
