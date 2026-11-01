// Exports (assets/hive/export.js): an answer's Markdown tables become CSV (quoted where needed, and no cell can run as a
// formula when the file is opened); private sessions keep nothing on the server.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const H = await import("./harness.mjs"); const { calls, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const X = createRequire(import.meta.url)(REPO + "/assets/hive/export.js");

const md = "Intro.\n\n| City | Pop. (m) | Note |\n|---|---:|:--|\n| **Lisbon** | 0.55 | coast, \"white city\" |\n| Porto | 0.23 | =HYPERLINK(\"x\") |\n\nBetween.\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```\n| not | a table |\n|---|---|\n| in | code |\n```";
const t = X.tables(md); assert.equal(t.length, 2); assert.deepEqual(t[0][0], ["City", "Pop. (m)", "Note"]); assert.deepEqual(t[0][1], ["Lisbon", "0.55", "coast, \"white city\""]);
const c = X.csv(md); assert.match(c, /^City,Pop\. \(m\),Note\r\nLisbon,0\.55,"coast, ""white city"""\r\nPorto,0\.23,"'=HYPERLINK\(""x""\)"\r\n\r\nA,B\r\n1,2$/);
ok("Markdown tables become CSV: the |---| line skipped, bold stripped, commas and quotes quoted, a formula can't run on open, tables in code ignored");
assert.equal(X.slug("Plan a 3-day trip to Lisbon!"), "plan-a-3-day-trip-to-lisbon");
ok("downloads are named after the question");

// a private session: Mind and Genesis keep nothing
H.setResponder(() => "Noted.");
await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", mind: false, cid: "priv1", messages: [{ role: "user", text: "remember that my sister is called Hanna" }] });
const mem = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name='mem'").get().c ? db.prepare("SELECT COUNT(*) c FROM mem WHERE text LIKE '%Hanna%'").get().c : 0;
assert.equal(mem, 0, "nothing remembered");
const turns = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name).filter((nm) => /turn|act|log/.test(nm));
for (const tb of turns) { const cols = db.prepare("PRAGMA table_info(" + tb + ")").all().map((x) => x.name), col = cols.find((x) => /text|said|ask/.test(x)); if (col) assert.equal(db.prepare("SELECT COUNT(*) c FROM " + tb + " WHERE " + col + " LIKE '%Hanna%'").get().c, 0, tb + " kept it"); }
// the control: the same message in an ordinary session is remembered, so the check above means something
await H.call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", cid: "pub1", messages: [{ role: "user", text: "remember that my sister is called Ingrid" }] });
assert.ok(db.prepare("SELECT COUNT(*) c FROM mem WHERE text LIKE '%Ingrid%'").get().c > 0, "an ordinary session remembers it");
ok("a private session (mind: false) leaves nothing in AutoFaber's memory, its activity log or its conversation record");
console.log("exports and private sessions: all checks passed");
