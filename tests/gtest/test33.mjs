// AutoFaber Deep Research (src/hive-research.js): a plan of searches run side by side, the best pages read in full, a
// cited report, and the evidence check, where a second model (never the writer) reads each cited claim beside its source.
// Citations to sources that don't exist are caught without a model. Visitors get a few reports a day.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { calls, db } = H; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const R = await import("./src/hive-research.js");

// ── citations, read without a model ──
let c = R.citedClaims("Tides follow the moon [1]. Spring tides peak at new and full moon [2, 3]. Neap tides are weaker [1–3]. Some say tides cause earthquakes [9].\n\n- A list item without a source.\n```js\nconst x = a[1];\n```", 3);
assert.deepEqual(c.claims.map((x) => x.cites), [[1], [2, 3], [1, 2, 3]]); assert.deepEqual(c.bad, [9]); assert.match(c.claims[0].claim, /^Tides follow the moon\.$/);
ok("cited claims are read from the report, ranges and lists included; a citation to a source that doesn't exist is caught; code is ignored");
assert.deepEqual(R.parsePlan('Sure! {"queries": ["tidal forces moon", "spring vs neap tides", "tidal forces moon"]}'), ["tidal forces moon", "spring vs neap tides"]); assert.deepEqual(R.parsePlan("no idea"), []);
ok("the search plan is read from the planner's JSON, without repeats");

// ── the whole flow, as a visitor ──
const page = (t) => "<html><head><title>" + t + "</title></head><body><nav>menu</nav><p>" + ("The " + t + " article explains that tides are caused mainly by the Moon's gravity, with the Sun adding spring tides. ").repeat(8) + "</p></body></html>";
const seen = []; globalThis.fetch = async (u) => { u = String(u); seen.push(u);
  if (/wikipedia\.org\/w\/api\.php/.test(u)) return Response.json({ query: { search: [{ title: "Tide", snippet: "Tides are the rise and fall of sea levels" }] } });
  if (/wikipedia\.org\/api\/rest_v1/.test(u)) return Response.json({ title: "Tide", extract: "Tides are the rise and fall of sea levels caused by the gravitational forces of the Moon and the Sun.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Tide" } } });
  if (/example\.org/.test(u)) return new Response(page(decodeURIComponent(u.split("/").pop())), { headers: { "content-type": "text/html" } });
  return new Response("{}", { status: 404 }); };
H.hive.web = async (q) => [{ title: "Guide: " + q, url: "https://example.org/" + encodeURIComponent(q), text: "A guide to " + q }, { title: "More on " + q, url: "https://example.org/more-" + encodeURIComponent(q), text: "More about " + q }];
let checkerSaw = null;
H.setResponder((sys, user) => {
  if (/You plan web research/.test(sys)) return '{"queries": ["what causes tides", "spring and neap tides", "tides and the sun"]}';
  if (/You check claims against source text/.test(sys)) { checkerSaw = { sys, user, model: calls[calls.length - 1].model }; return '{"v": ["S", "N", "P"]}'; }
  if (/RESEARCH MODE/.test(sys)) return "Tides are caused mainly by the Moon's gravity [1]. Tides are also caused by underwater volcanoes [2]. The Sun adds spring tides [3]. Some claim the tides stop on Sundays [42].";
  return "ok";
});
const sse = async (body, owner = false, ip = "198.51.100.7") => { const r = await H.hive.fetch(new Request("https://mentifaber.org/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", ...(owner ? { "x-hive-owner": "1" } : {}), "cf-connecting-ip": ip }, body: JSON.stringify({ stream: true, ...body }) }));
  if (!/event-stream/.test(r.headers.get("content-type") || "")) return [["http", await r.json()]];
  const t = await r.text(), ev = []; for (const x of t.split("\n\n")) { const e = (/^event: (.*)$/m.exec(x) || [])[1], d = (/^data: (.*)$/m.exec(x) || [])[1]; if (e && d) ev.push([e, JSON.parse(d)]); } return ev; };
const OSS = "workers-ai|@cf/openai/gpt-oss-120b", ask = [{ role: "user", text: "What causes tides, and why are some higher than others?" }];
H.hive.sql(); db.prepare("DELETE FROM reply").run(); let c0 = calls.length;
let ev = await sse({ model: OSS, research: true, messages: ask });
const text = ev.filter((e) => e[0] === "delta").map((e) => e[1].t).join(""), done = ev.find((e) => e[0] === "done")[1], mine = calls.slice(c0);
const writer = mine.find((x) => /RESEARCH MODE/.test(x.sys));
assert.ok(writer && writer.model === "@cf/openai/gpt-oss-120b", "the chosen model writes the report");
assert.match(writer.sys, /MATERIAL GATHERED[\s\S]*\(read in full\)[\s\S]*caused mainly by the Moon/); assert.match(writer.sys, /WIKIPEDIA: Tides are the rise and fall/);
assert.ok(seen.filter((u) => /example\.org/.test(u)).length >= 3, "the best pages were read in full");
assert.ok(done.tools.some((t) => /^researched: 3 searches, \d pages read in full, \d+ sources$/.test(t)), done.tools.join(" | "));
assert.equal(mine.filter((x) => /You decide which tools/.test(x.sys)).length, 0, "research makes its own plan; the chat planner isn't called as well");
ok("a research question is planned three ways, searched side by side, its best pages read in full, and the chosen model writes from all of it");

assert.ok(checkerSaw, "the evidence check ran"); assert.equal(checkerSaw.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "a different model checks the report");
assert.match(checkerSaw.user, /CLAIM 1: Tides are caused mainly by the Moon's gravity\.\nSOURCE TEXT \(\[1\]\):/); assert.doesNotMatch(checkerSaw.user, /Sundays/, "the claim citing a missing source isn't sent to the checker");
assert.match(text, /\*\*Evidence check\*\* \(llama-3\.3-70b-instruct-fp8-fast read each cited source; it checks support, not truth\): \*\*1 of 3\*\* cited claims are stated by their source \(33%\), 1 partly, 1 not found in the source cited\./);
assert.match(text, /- Not found in \[2\]: “Tides are also caused by underwater volcanoes\.”/); assert.match(text, /- Cites source 42, which isn't among the \d+ gathered: treat what it supports as unsourced\./);
assert.ok(done.tools.includes("evidence check: 1 of 3 cited claims stated by their source"));
ok("the evidence check: another model reads each claim beside its source; the reader sees 1 of 3 supported, the unsupported claim, and the citation to a source that doesn't exist");
assert.equal(db.prepare("SELECT kind FROM reply").get().kind, "research");
ok("the report is counted in reply health as research");

// the checker fails: the report says its citations are unchecked, it never pretends
H.setResponder((sys) => /You plan web research/.test(sys) ? '{"queries": ["q"]}' : /You check claims/.test(sys) ? "I think they look fine!" : /RESEARCH MODE/.test(sys) ? "The Moon's gravity raises the tides [1]. The Sun adds a smaller pull [2]." : "ok");
ev = await sse({ model: OSS, research: true, messages: ask }, true);
assert.match(ev.filter((e) => e[0] === "delta").map((e) => e[1].t).join(""), /\*\*Evidence check\*\* _\(couldn't run this time: the checker didn't give a verdict for every claim\. The citations above are unchecked\.\)_/);
ok("when the check can't run, the report says its citations are unchecked");

// a report written by Llama is checked by gpt-oss
H.setResponder((sys) => /You plan web research/.test(sys) ? '{"queries": ["q"]}' : /You check claims/.test(sys) ? '{"v": ["S"]}' : /RESEARCH MODE/.test(sys) ? "The Moon's gravity raises the tides [1]." : "ok");
c0 = calls.length; await sse({ model: "workers-ai|@cf/meta/llama-3.3-70b-instruct-fp8-fast", research: true, messages: ask }, true);
assert.equal(calls.slice(c0).find((x) => /You check claims/.test(x.sys)).model, "@cf/openai/gpt-oss-120b");
ok("the writer never checks itself: a report by Llama is checked by gpt-oss");

// visitors: six reports a day
for (let i = 0; i < 4; i++) await sse({ model: OSS, research: true, messages: ask }); // 1 + these 4 = 5
ev = await sse({ model: OSS, research: true, messages: ask }); assert.ok(ev.some((e) => e[0] === "done"), "the sixth is allowed");
ev = await sse({ model: OSS, research: true, messages: ask }); assert.equal(ev[0][0], "http"); assert.match(ev[0][1].error, /today's 6 researched reports/);
ev = await sse({ model: OSS, research: true, messages: ask }, true); assert.ok(ev.some((e) => e[0] === "done"), "the owner has no limit");
ok("a visitor gets six researched reports a day; the owner has no limit");
console.log("AutoFaber Deep Research: all checks passed");
