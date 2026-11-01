// Fact check: any answer, checked on request. A model picks out the claims in it that can be checked (facts, numbers,
// dates, names; not opinions or advice) and writes a search for each; the searches run side by side (the web, Wikipedia);
// then a model that didn't write the answer reads each claim beside what was found and says: supported, contradicted, or
// unclear, citing the source it relied on. The reader sees which parts of an answer stand up, and where to look.
import { complete } from "./hive-kit.js";
import { wiki } from "./hive-know.js";

const PICK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast", JUDGES = ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);
const json = (out) => { const m = /\{[\s\S]*\}/.exec(String(out || "")); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } };

export function parseClaims(out) {
  const j = json(out), list = j && Array.isArray(j.claims) ? j.claims : [];
  return list.map((c) => ({ claim: clip(c && c.claim, 240), q: clip(c && (c.search || c.q), 120) })).filter((c) => c.claim.length >= 12 && c.q.length >= 3).slice(0, 6);
}
const VERDICTS = { S: "supported", C: "contradicted", U: "unclear" };

// { claims: [{ claim, verdict, source: { title, url } | null, note }], by, ms } or { error }
export async function factCheck(h, { text, question, writer, owner, step = () => {} }) {
  const t0 = Date.now(), answer = clip(text, 6000);
  if (answer.length < 40) return { error: "there's nothing in that answer to check" };
  step("picking out the claims to check");
  const pickSys = "You pick out the claims in an answer that can be checked against sources: facts, figures, dates, names, events, quotes. Not opinions, advice, instructions, or code. " +
    "Choose the up to 6 that matter most to the answer. For each, write a search engine query that would find a source for it. Reply with ONLY JSON: {\"claims\": [{\"claim\": \"...\", \"search\": \"...\"}]}. If nothing can be checked, reply {\"claims\": []}.";
  const claims = parseClaims(await timed(complete(h.env, null, null, PICK, pickSys, [{ role: "user", text: (question ? "QUESTION: " + clip(question, 600) + "\n\n" : "") + "ANSWER: " + answer }], 700), 15000).catch(() => ""));
  if (!claims.length) return { claims: [], ms: Date.now() - t0, note: "no checkable claims (opinion, advice or code), or they couldn't be picked out" };
  step("searching for " + claims.length + " claim" + (claims.length === 1 ? "" : "s"));
  const found = await Promise.all(claims.map((c) => Promise.all([timed(h.web(c.q, owner), 12000).catch(() => []), timed(wiki(c.q, 1), 9000).catch(() => [])])
    .then(([w, k]) => [...w.slice(0, 3).map((x) => ({ title: clip(x.title, 160), url: x.url, text: clip(x.text, 700) })), ...k.map((x) => ({ title: x.title + " · Wikipedia", url: x.url, text: clip(x.text, 900) }))])));
  step("weighing each claim against what was found");
  const judge = JUDGES.find((m) => !String(writer || "").endsWith(m)) || JUDGES[1];
  const user = claims.map((c, i) => "CLAIM " + (i + 1) + ": " + c.claim + "\n" + (found[i].length ? found[i].map((s, k) => "  SOURCE " + (i + 1) + "." + (k + 1) + " (" + s.title + "): " + s.text).join("\n") : "  (no sources found)")).join("\n\n");
  const judgeSys = "You check claims against the sources found for them. Use only those sources, not what you know. For each claim, in order: S if a source states it, C if a source states something that contradicts it, U if the sources don't settle it (or there are none). " +
    "Name the source you relied on as \"1.2\" (claim 1, source 2), or null. Add a short note (under 20 words) saying what the source says. Reply with ONLY JSON: {\"v\": [{\"verdict\": \"S\", \"source\": \"1.2\", \"note\": \"...\"}]}.";
  const out = json(await timed(complete(h.env, null, null, judge, judgeSys, [{ role: "user", text: user }], 900), 30000).catch(() => ""));
  const v = out && Array.isArray(out.v) ? out.v : null;
  if (!v || v.length < claims.length) return { error: "the checker didn't give a verdict for every claim; try again", ms: Date.now() - t0 };
  return {
    by: judge.split("/").pop(), ms: Date.now() - t0,
    claims: claims.map((c, i) => { const r = v[i] || {}, k = String(r.verdict || "U").trim().toUpperCase()[0], m = /^(\d+)\.(\d+)$/.exec(String(r.source || "")), src = m && +m[1] === i + 1 ? found[i][+m[2] - 1] : null;
      return { claim: c.claim, verdict: VERDICTS[k] || "unclear", source: src && k !== "U" ? { title: src.title, url: src.url } : null, note: clip(r.note, 160) }; }),
  };
}
