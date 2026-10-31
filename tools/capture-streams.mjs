#!/usr/bin/env node
// AutoFaber stream capture (the improvement brief's Phase 0, step 2): record real reply streams, byte for byte, to pin down
// why a first reply looped with "analysis" text in it, and to check the reply guards (src/hive-kit.js) against real data
// rather than synthetic streams. Every case runs several times, so a fault that happens only sometimes shows as a rate.
//
// Two layers:
//   provider  Workers AI's own stream, through its REST API, with the request src/hive-kit.js sends through the AI binding.
//             Needs CLOUDFLARE_API_TOKEN (a token allowed to use Workers AI; CLOUDFLARE_ACCOUNT_ID if it reaches several
//             accounts), or CAPTURE_URL and CAPTURE_KEY: the capture Worker (tools/capture/worker.js), which the workflow
//             deploys for the run because the deploy token may deploy Workers but not call Workers AI. Each recorded stream
//             is then replayed through streamComplete, so the summary also shows what a visitor would now be shown.
//   site      what a visitor's browser receives from mentifaber.org/api/hive/chat. No credentials: it uses one visitor's
//             daily allowance (60 messages).
//
//   node tools/capture-streams.mjs [--layer provider|site|both] [--reps 2] [--max 2048] [--out captures]
//
// Writes <out>/<time>/<layer>.<model>.<case>.<rep>.jsonl (one line per network read: ms since the request was sent, and
// the bytes as text), summary.json and summary.md. The default run asks for 12 provider replies and 6 site replies of at
// most 2,048 tokens each: well inside Workers AI's free daily allocation (10,000 neurons) even if every one runs to the cap.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const K = await import(new URL("../src/hive-kit.js", import.meta.url).href);
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const LAYER = arg("layer", "both"), REPS = Math.max(1, Math.min(10, +arg("reps", 2))), MAX = Math.max(64, Math.min(4096, +arg("max", 2048)));
const SITE = (process.env.LIVE_SITE || "https://mentifaber.org").replace(/\/$/, ""), API = (process.env.CF_API || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
let ACCT = process.env.CLOUDFLARE_ACCOUNT_ID; const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const RELAY = process.env.CAPTURE_URL, RELAY_KEY = process.env.CAPTURE_KEY; // the capture Worker, when the workflow deployed one
const MODELS = ["@cf/openai/gpt-oss-120b", "@cf/openai/gpt-oss-20b"];
const today = new Date().toISOString().slice(0, 10);
// a stand-in for the chat's system prompt (the real one is assembled on the server; the site layer goes through it)
const SYSTEM = "You are AutoFaber, the assistant on mentifaber.org. Answer the visitor directly and concisely. Today's date: " + today + " (UTC).";
const CASES = [
  ["opener", "Hi! What are you, and what can you do?"], // the audit's runaway was a first reply
  ["date", "What is today's date? One line."],
  ["math", "What is 17 × 23? Reply with just the number."],
];
const OUT = (arg("out", fileURLToPath(new URL("../captures", import.meta.url)))) + "/" + new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(OUT, { recursive: true });

// read a response body to the end, keeping every network read with its time
async function record(res, t0) {
  const rd = res.body.getReader(), dec = new TextDecoder(), reads = [];
  for (;;) { const { value, done } = await rd.read(); if (done) break; reads.push({ ms: Math.round(performance.now() - t0), t: dec.decode(value, { stream: true }) }); }
  return reads;
}
const events = (raw) => raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter((d) => d && d !== "[DONE]").map((d) => { try { return JSON.parse(d); } catch { return { unparsed: d.slice(0, 200) }; } });
const sseEvents = (raw) => raw.split("\n\n").map((c) => [(/^event: (.*)$/m.exec(c) || [])[1], (/^data: (.*)$/m.exec(c) || [])[1]]).filter(([e, d]) => e && d).map(([e, d]) => { try { return [e, JSON.parse(d)]; } catch { return [e, { unparsed: d.slice(0, 200) }]; } });
// the visible text and any separate reasoning in a provider event, whichever shape it came in
const content = (j) => typeof j.response === "string" ? j.response : (j.choices && j.choices[0] && j.choices[0].delta && typeof j.choices[0].delta.content === "string" ? j.choices[0].delta.content : "");
const reasoning = (j) => { const d = j.choices && j.choices[0] && j.choices[0].delta; return String((d && (d.reasoning_content || d.reasoning)) || j.reasoning_content || j.reasoning || ""); };
const keysOf = (j) => { const k = new Set(Object.keys(j)); const d = j.choices && j.choices[0] && j.choices[0].delta; if (d) for (const x of Object.keys(d)) k.add("choices[0].delta." + x); return k; };
const markers = (t) => ({ startsAnalysis: /^\s*(<\|start\|>assistant)?(<\|channel\|>)?analysis/.test(t), assistantfinal: /assistantfinal/.test(t), channelTags: /<\|channel\|>/.test(t) });
const loopAt = (t) => { const g = K.loopGuard(); for (let i = 40; i <= t.length; i += 40) if (g(t.slice(0, i))) return i; return g(t) ? t.length : null; };
const head = (t, n = 160) => t.replace(/\s+/g, " ").trim().slice(0, n);

async function provider(model, [name, ask], rep) {
  const body = { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: ask }], max_tokens: MAX, stream: true };
  const t0 = performance.now();
  const res = RELAY // through the capture Worker's AI binding (tools/capture/worker.js), or straight to the REST API
    ? await fetch(RELAY, { method: "POST", headers: { "x-capture-key": RELAY_KEY, "content-type": "application/json" }, body: JSON.stringify({ model, input: body }) })
    : await fetch(API + "/accounts/" + ACCT + "/ai/run/" + model, { method: "POST", headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !/event-stream/.test(res.headers.get("content-type") || "")) {
    const t = await res.text(); let msg = t.slice(0, 300); try { const j = JSON.parse(t); msg = (j.errors || []).map((e) => e.code + " " + e.message).join("; ") || msg; } catch {}
    return { layer: "provider", model, case: name, rep, error: "HTTP " + res.status + ": " + msg };
  }
  const reads = await record(res, t0), raw = reads.map((r) => r.t).join(""), evs = events(raw);
  const text = evs.map(content).join(""), think = evs.map(reasoning).join(""), keys = new Set(); evs.forEach((j) => keysOf(j).forEach((k) => keys.add(k)));
  const first = reads.findIndex((r) => events(r.t).some((j) => content(j))), last = evs.at(-1) || {};
  // replay the recorded bytes through the production path: the channel filter, the loop guard and the wall cap
  const meta = { wall: 600000 }, shown = [];
  const replay = new ReadableStream({ start(c) { const e = new TextEncoder(); for (const r of reads) c.enqueue(e.encode(r.t)); c.close(); } });
  const now = await K.streamComplete({ AI: { run: async () => replay } }, null, null, model, SYSTEM, [{ role: "user", text: ask }], MAX, (t) => shown.push(t), meta);
  writeFileSync(OUT + "/provider." + model.split("/").pop() + "." + name + "." + rep + ".jsonl", reads.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { layer: "provider", model, case: name, rep, ms: reads.at(-1) ? reads.at(-1).ms : 0, ttftMs: first >= 0 ? reads[first].ms : null, reads: reads.length, events: evs.length,
    eventKeys: [...keys].sort(), chars: text.length, reasoningChars: think.length, ...markers(text), loopAtChar: loopAt(text),
    finish: (last.choices && last.choices[0] && last.choices[0].finish_reason) || last.finish_reason || null, usage: evs.map((j) => j.usage).filter(Boolean).at(-1) || null,
    rawHead: head(text), nowShown: head(now), nowChars: now.length, nowCut: meta.cut || null };
}

async function site(model, [name, ask], rep) {
  // Cloudflare's bot check sometimes challenges a datacenter address ("Just a moment..."): that is retried and counted
  // apart, since it says nothing about the model
  let res, t0, challenged = 0;
  for (let k = 0; k < 4; k++) {
    if (k) await new Promise((r) => setTimeout(r, 5000 * k));
    t0 = performance.now();
    res = await fetch(SITE + "/api/hive/chat", { method: "POST", headers: { "content-type": "application/json", "user-agent": "AutoFaber capture (tools/capture-streams.mjs)" }, body: JSON.stringify({ model: "workers-ai|" + model, messages: [{ role: "user", text: ask }], stream: true }) });
    if (/event-stream/.test(res.headers.get("content-type") || "")) break;
    const t = await res.text();
    if (res.status === 403 && /Just a moment/i.test(t)) { challenged++; continue; }
    return { layer: "site", model, case: name, rep, challenged, error: "HTTP " + res.status + ": " + t.slice(0, 300) };
  }
  if (!/event-stream/.test(res.headers.get("content-type") || "")) return { layer: "site", model, case: name, rep, challenged, error: "Cloudflare's bot check blocked all " + challenged + " tries" };
  const reads = await record(res, t0), evs = sseEvents(reads.map((r) => r.t).join(""));
  const text = evs.filter(([e]) => e === "delta").map(([, d]) => d.t || "").join(""), done = (evs.find(([e]) => e === "done") || [])[1] || null, err = (evs.find(([e]) => e === "error") || [])[1];
  const firstDelta = reads.findIndex((r) => /event: delta/.test(r.t)), meta = (evs.find(([e]) => e === "meta") || [])[1] || {};
  writeFileSync(OUT + "/site." + model.split("/").pop() + "." + name + "." + rep + ".jsonl", reads.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { layer: "site", model, case: name, rep, challenged, ms: reads.at(-1) ? reads.at(-1).ms : 0, ttftMs: firstDelta >= 0 ? reads[firstDelta].ms : null, reads: reads.length,
    deltas: evs.filter(([e]) => e === "delta").length, chars: text.length, ...markers(text), loopAtChar: loopAt(text), cut: done ? done.cut || null : null,
    answeredBy: (done && done.model) || meta.model || null, tools: (done && done.tools) || meta.tools || [], error: err ? err.error : undefined, shown: head(text) };
}

const rows = [];
const run = async (layer, fn, models) => { for (const model of models) for (const c of CASES) for (let rep = 1; rep <= REPS; rep++) {
  let r; try { r = await fn(model, c, rep); } catch (e) { r = { layer, model, case: c[0], rep, error: String(e && e.message || e) }; }
  rows.push(r); console.log(JSON.stringify(r));
} };
const skipped = [];
// the account ID is optional when the token belongs to one account: it is looked up, as wrangler does
if (TOKEN && !ACCT && !RELAY) try { const j = await (await fetch(API + "/accounts", { headers: { authorization: "Bearer " + TOKEN } })).json(); if (j.success && j.result && j.result.length === 1) ACCT = j.result[0].id; else console.log("account lookup: " + (j.result ? j.result.length + " accounts; set CLOUDFLARE_ACCOUNT_ID" : JSON.stringify(j.errors || j).slice(0, 200))); } catch (e) { console.log("account lookup failed: " + e.message); }
if (LAYER === "provider" || LAYER === "both") { if (RELAY ? RELAY_KEY : ACCT && TOKEN) await run("provider", provider, MODELS); else skipped.push("provider (" + (TOKEN ? "the token's Cloudflare account couldn't be found; set CLOUDFLARE_ACCOUNT_ID" : "CLOUDFLARE_API_TOKEN isn't set") + ")"); }
if (LAYER === "site" || LAYER === "both") await run("site", site, MODELS.slice(0, 1)); // the model the audit saw, at the visitor allowance

// the summary: counts and rates, never a verdict on a single run
const pct = (a, b) => b ? Math.round((100 * a) / b) + "%" : "n/a";
const groups = {}; for (const r of rows) (groups[r.layer + " · " + r.model.split("/").pop() + " · " + r.case] ||= []).push(r);
const md = ["# AutoFaber stream capture, " + new Date().toISOString(), "", "Reps per case: " + REPS + " · max tokens: " + MAX + " · system prompt (provider layer): a stand-in, not the live one.", ""];
if (skipped.length) md.push("**Did not run:** " + skipped.join("; ") + ".", "");
md.push("| layer · model · case | ran | errors | starts in analysis | assistantfinal | channel tags | looped | separate reasoning | cut (now) | median ms | first reply shown |", "|---|---|---|---|---|---|---|---|---|---|---|");
for (const [k, g] of Object.entries(groups)) {
  const ok = g.filter((r) => !r.error), n = ok.length, ms = ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)];
  const cut = ok.map((r) => r.nowCut || r.cut).filter(Boolean);
  md.push("| " + [k, g.length, g.length - n, pct(ok.filter((r) => r.startsAnalysis).length, n), pct(ok.filter((r) => r.assistantfinal).length, n), pct(ok.filter((r) => r.channelTags).length, n),
    pct(ok.filter((r) => r.loopAtChar).length, n), pct(ok.filter((r) => r.reasoningChars > 0).length, n), cut.length ? cut.join(", ") : "none", n ? ms : "n/a",
    (ok[0] ? (ok[0].nowShown ?? ok[0].shown) : (g[0].error || "")).replace(/\|/g, "\\|").slice(0, 90)].join(" | ") + " |");
}
const keys = new Set(rows.filter((r) => r.eventKeys).flatMap((r) => r.eventKeys)); if (keys.size) md.push("", "Provider event fields seen: `" + [...keys].join("`, `") + "`");
const ch = rows.reduce((n, r) => n + (r.challenged || 0), 0); if (ch) md.push("", "Cloudflare's bot check challenged " + ch + " request(s) to the site and they were retried (not counted as model errors).");
const errs = rows.filter((r) => r.error); if (errs.length) md.push("", "Errors:", ...errs.map((r) => "- " + r.layer + " " + r.model + " " + r.case + " #" + r.rep + ": " + r.error));
writeFileSync(OUT + "/summary.json", JSON.stringify({ when: new Date().toISOString(), reps: REPS, max: MAX, skipped, rows }, null, 2));
writeFileSync(OUT + "/summary.md", md.join("\n") + "\n");
console.log("\n" + md.join("\n") + "\n\nSaved to " + OUT);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n", { flag: "a" });
