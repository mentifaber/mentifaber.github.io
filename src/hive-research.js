// AutoFaber Deep Research. A question becomes a short plan of searches, run side by side (the web, Wikipedia, and papers
// when it's a research topic); the best pages are read in full; the chosen model writes a cited report from all of it. Then
// the evidence check: a second model, never the one that wrote the report, reads each cited claim beside the source it
// cites and says whether that source supports it. Citations to sources that don't exist are caught without any model. The
// reader sees which claims stand on their sources, which only partly do, and which don't, instead of trusting the report.
import { complete, readPage } from "./hive-kit.js";
import { wiki, papers, paperLine } from "./hive-know.js";

const PLAN = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CHECKERS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/openai/gpt-oss-120b"]; // the first that isn't the writer
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const timed = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(what + " took too long")), ms))]);
const ACADEMIC = /\b(stud(y|ies)|research|paper|evidence|trial|clinical|meta-?analysis|peer[- ]reviewed|scientific|effect of|efficacy|mechanism|algorithm|model(s|ling)?|theorem|dataset|benchmark)\b/i;

export const RESEARCH_RULE = "\n\nRESEARCH MODE: the user asked for a researched report, and the MATERIAL above was gathered for it just now. " +
  "Open with the answer in two or three sentences. Then a few short sections with headings, and a closing line on what remains uncertain. " +
  "Back every factual claim with the [n] of the MATERIAL item that states it, right after the claim; never cite a number that isn't in the MATERIAL, and never cite an item for something it doesn't say. " +
  "Where sources disagree, say so and cite both. Where the MATERIAL doesn't cover part of the question, say that plainly instead of filling the gap from memory. " +
  "A second model will check each cited claim against its source, and the reader will see the result.";

export function planPrompt(now) {
  return "You plan web research for a question. Write 3 to 5 search queries that together cover it: the core fact, recent developments, numbers or data, and other viewpoints where they matter. " +
    "Each query reads like a good search-engine query, not a sentence. Reply with ONLY JSON: {\"queries\": [\"...\"]}. Now: " + now + ".";
}
export function parsePlan(out) {
  const m = /\{[\s\S]*\}/.exec(String(out || "")); if (!m) return [];
  try { const j = JSON.parse(m[0]); return [...new Set((Array.isArray(j.queries) ? j.queries : []).map((q) => clip(q, 160)).filter((q) => q.length > 2))].slice(0, 5); } catch (e) { return []; }
}

// The research itself: { queries, items: [{ title, url, text, read }] }, at most 14 items, within about budget ms.
// step(text) reports what it's doing as it goes; h is the Hive (its web() search and env.AI).
export async function research(h, { question, owner, step = () => {}, budget = 40000, now }) {
  const t0 = Date.now(), left = () => budget - (Date.now() - t0), items = [], seen = new Set();
  const add = (x) => { const k = String(x.url || x.title).toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, ""); if (!x.text || seen.has(k)) return; seen.add(k); items.push(x); };
  step("planning the research");
  let queries = [];
  if (h.env.AI) queries = parsePlan(await timed(complete(h.env, null, null, PLAN, planPrompt(now || new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"), [{ role: "user", text: clip(question, 2000) }], 400), 9000, "planning").catch(() => ""));
  if (!queries.length) queries = [clip(question, 160)];
  step("searching " + queries.length + " ways: " + queries.join(" · "));
  const academic = ACADEMIC.test(question);
  const got = await Promise.all(queries.map((q) => Promise.all([
    timed(h.web(q, owner), Math.max(4000, left()), "search").catch(() => []),
    timed(wiki(q, 1), 8000, "wikipedia").catch(() => []),
    academic ? timed(papers(q, 2), 10000, "papers").catch(() => []) : Promise.resolve([]),
  ])));
  const web = [];
  got.forEach(([w, wk, ps]) => {
    w.slice(0, 4).forEach((x, i) => { const it = { title: clip(x.title, 200), url: x.url, text: clip(x.text, 1200), rank: i }; web.push(it); add(it); });
    wk.forEach((x) => add({ title: x.title + " · Wikipedia", url: x.url, text: "WIKIPEDIA: " + clip(x.text, 1500) }));
    ps.forEach((p) => add({ title: p.title, url: p.url, text: "PAPER: " + paperLine(p) }));
  });
  // the best pages, read in full: each query's top result first, then its second, up to five
  const toRead = [...web.filter((x) => x.rank === 0), ...web.filter((x) => x.rank === 1)].filter((x, i, a) => x.url && /^https?:/.test(x.url) && a.findIndex((y) => y.url === x.url) === i).slice(0, 5);
  if (toRead.length && left() > 4000) {
    step("reading " + toRead.length + " page" + (toRead.length === 1 ? "" : "s") + " in full");
    const pages = await Promise.all(toRead.map((x) => timed(readPage(x.url, 3500), Math.min(15000, left()), "reading").catch(() => null)));
    pages.forEach((pg, i) => { if (pg && pg.text && pg.text.length > 400) { toRead[i].text = "PAGE " + clip(pg.title, 160) + " (read in full):\n" + pg.text; toRead[i].read = true; } });
  }
  return { queries, items: items.slice(0, 14).map(({ rank, ...x }) => x), ms: Date.now() - t0 };
}

// Every sentence that cites [n], with the numbers it cites; and citations to sources that don't exist.
export function citedClaims(text, n) {
  const body = String(text || "").replace(/```[\s\S]*?```/g, " ");
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z*_"“(\[]|\d)|\n+/).map((s) => s.trim()).filter(Boolean);
  const claims = [], bad = new Set();
  for (const s of sentences) {
    const cites = [...new Set([...s.matchAll(/\[(\d{1,3})(?:\s*[,–-]\s*(\d{1,3}))*\]/g)].flatMap((m) => m[0].slice(1, -1).split(/\s*,\s*/).flatMap((x) => { const [a, b] = x.split(/\s*[–-]\s*/).map(Number); return b && b > a && b - a < 10 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; })))];
    if (!cites.length) continue;
    for (const k of cites) if (k < 1 || k > n) bad.add(k);
    const claim = s.replace(/\s*\[\d[\d,\s–-]*\]/g, "").replace(/[*_#>]+/g, "").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
    const ok = cites.filter((k) => k >= 1 && k <= n);
    if (claim.length >= 12 && ok.length) claims.push({ claim: clip(claim, 300), cites: ok });
  }
  return { claims, bad: [...bad].sort((a, b) => a - b) };
}

// The evidence check: { checked, supported, partial, missing: [{claim, cites}], bad, more, by } or { error }.
// sources: [{ title, text }] in citation order; writer: the model that wrote the report (it never checks itself).
export async function evidenceCheck(h, text, sources, writer, max = 12) {
  const { claims, bad } = citedClaims(text, sources.length), pick = claims.slice(0, max);
  const by = CHECKERS.find((m) => !String(writer || "").endsWith(m)) || CHECKERS[0];
  const base = { bad, more: Math.max(0, claims.length - pick.length), total: claims.length, by: by.split("/").pop() };
  if (!pick.length) return { ...base, checked: 0, supported: 0, partial: 0, missing: [] };
  const user = pick.map((c, i) => "CLAIM " + (i + 1) + ": " + c.claim + "\nSOURCE TEXT (" + c.cites.map((k) => "[" + k + "]").join(" ") + "): " + c.cites.map((k) => clip(sources[k - 1].text, 1800)).join(" … ")).join("\n\n");
  const sys = "You check claims against source text. For each claim, read only the source text given with it, not what you know, and judge whether that text states the claim. " +
    "Reply with ONLY JSON: {\"v\": [\"S\", \"P\", \"N\", ...]}, one letter per claim, in order. S: the source text states it. P: the source text supports part of it, or something close but not the same. N: the source text doesn't say it.";
  try {
    const out = await timed(complete(h.env, null, null, by, sys, [{ role: "user", text: user }], 500), 25000, "the evidence check");
    const m = /\{[\s\S]*\}/.exec(String(out || "")), v = m ? JSON.parse(m[0]).v : null;
    if (!Array.isArray(v) || v.length < pick.length) throw new Error("the checker didn't give a verdict for every claim");
    const at = (i) => String(v[i] || "").trim().toUpperCase()[0];
    return { ...base, checked: pick.length, supported: pick.filter((_, i) => at(i) === "S").length, partial: pick.filter((_, i) => at(i) === "P").length, missing: pick.filter((_, i) => at(i) !== "S" && at(i) !== "P") };
  } catch (e) { return { ...base, checked: 0, error: String(e.message || e).slice(0, 120) }; }
}

// what the reader sees at the end of the report
export function ledgerText(r, nSources) {
  const head = "\n\n---\n**Evidence check** ";
  // named in words: the app turns [n] into a link, and drops one that points at no source
  const badLine = r.bad && r.bad.length ? "\n- " + (r.bad.length === 1 ? "Cites source " + r.bad[0] + ", which isn't" : "Cites sources " + r.bad.join(", ") + ", which aren't") + " among the " + nSources + " gathered: treat what it supports as unsourced." : "";
  if (r.error) return head + "_(couldn't run this time: " + r.error + ". The citations above are unchecked.)_" + badLine;
  if (!r.total) return head + "_(the report has no cited claims to check: its statements carry no [n] from the sources)_" + badLine;
  const pct = Math.round((r.supported / r.checked) * 100);
  return head + "(" + r.by + " read each cited source; it checks support, not truth): **" + r.supported + " of " + r.checked + "** cited claims are stated by their source (" + pct + "%)" +
    (r.partial ? ", " + r.partial + " partly" : "") + (r.missing.length ? ", " + r.missing.length + " not found in the source cited" : "") + "." + (r.more ? " " + r.more + " more cited claim" + (r.more === 1 ? " wasn't" : "s weren't") + " checked." : "") +
    r.missing.slice(0, 5).map((c) => "\n- Not found in " + c.cites.map((k) => "[" + k + "]").join(" ") + ": “" + clip(c.claim, 160) + "”").join("") + badLine;
}
