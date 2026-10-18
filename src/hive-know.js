// Genesis · knowledge: open sources that need no key. Hugging Face (datasets, their rows, models), Wikipedia, arXiv and
// OpenAlex. Chat reaches for them when a message is about research, papers, datasets or models; the Swarm's researchers
// get them as material; and Genesis reads what's new in AI when it decides what to build next.
const T = (ms) => AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
const UA = { "user-agent": "MentifaberGenesis/1.0 (+https://mentifaber.org/hive)", accept: "application/json" };
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const k = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0);
async function get(url, ms, text) { const r = await fetch(url, { headers: UA, signal: T(ms || 9000) }); if (!r.ok) throw new Error(new URL(url).hostname + " said " + r.status); return text ? r.text() : r.json(); }

// what a message wants looked up (a message can want several)
const HF_Q = /\b(hugging ?face|hf hub|datasets?|training (set|data)|corpus|corpora|benchmarks?|model cards?|fine-?tun\w*|open[- ]weights?|checkpoints?|gguf|lora)\b/i;
const PAPER_Q = /\b(papers?|arxiv|preprints?|research(ers)?|studies|study (on|of|about)|literature|citations?|peer[- ]reviewed|state[- ]of[- ]the[- ]art|sota|journal articles?)\b/i;
const WIKI_Q = /^\s*(what|who|when|where) (is|was|are|were)\b|\b(history of|explain|definition of|define|tell me about|background on)\b/i;
export const DATASET_ID = /(?:huggingface\.co\/datasets\/|\bdataset\s+)([\w.-]+\/[\w.-]+)/i;
export function wants(text, web) {
  const t = String(text || ""), w = [];
  if (DATASET_ID.test(t)) w.push("rows");
  else if (HF_Q.test(t)) w.push("hf"); // a named dataset is the subject: no need to search the Hub as well
  if (PAPER_Q.test(t)) w.push("papers");
  if (web || WIKI_Q.test(t)) w.push("wiki");
  return w;
}
// the words worth searching for: the message minus the asking
export function topic(text) {
  return clip(String(text || "").replace(/https?:\/\/\S+/g, " ").replace(/\b(please|can you|could you|would you|find|search|look ?up|show me|give me|get me|tell me about|what('s| is| are)|who('s| is)|are there|is there|any|some|the best|good|top|latest|recent|new|papers?|research|studies|on|about|for|of|datasets?|models?|hugging ?face|arxiv|me|i|want|need|to|a|an|the|from|with|that|which|in|show|rows?|examples?|sample|some)\b/gi, " ").replace(/[?!.,;:"]+/g, " "), 120) || clip(text, 120);
}

// ── Hugging Face ──
export async function hfSearch(q, n = 5) {
  const enc = encodeURIComponent(q), [ds, ms] = await Promise.all([
    get("https://huggingface.co/api/datasets?search=" + enc + "&sort=downloads&direction=-1&limit=" + n).catch(() => []),
    get("https://huggingface.co/api/models?search=" + enc + "&sort=downloads&direction=-1&limit=" + n).catch(() => [])]);
  const d = (Array.isArray(ds) ? ds : []).map((x) => ({ id: x.id, downloads: x.downloads || 0, likes: x.likes || 0, about: clip(x.description || (x.cardData && x.cardData.pretty_name) || "", 200), tags: (x.tags || []).filter((t) => /^(task_categories|language|size_categories|license):/.test(t)).map((t) => t.split(":")[1]).slice(0, 6) }));
  const m = (Array.isArray(ms) ? ms : []).map((x) => ({ id: x.id, downloads: x.downloads || 0, likes: x.likes || 0, task: x.pipeline_tag || "", lib: x.library_name || "" }));
  if (!d.length && !m.length) throw new Error("nothing on Hugging Face for “" + q + "”");
  return { datasets: d, models: m };
}
export function hfText(r, q) {
  return "HUGGING FACE HUB, searched just now for “" + q + "” (sorted by downloads):\n" +
    (r.datasets.length ? "Datasets:\n" + r.datasets.map((x) => "- " + x.id + " (https://huggingface.co/datasets/" + x.id + "): " + k(x.downloads) + " downloads, " + x.likes + " likes" + (x.tags.length ? "; " + x.tags.join(", ") : "") + (x.about ? ". " + x.about : "")).join("\n") + "\n" : "") +
    (r.models.length ? "Models:\n" + r.models.map((x) => "- " + x.id + " (https://huggingface.co/" + x.id + "): " + k(x.downloads) + " downloads, " + x.likes + " likes" + (x.task ? "; " + x.task : "") + (x.lib ? " (" + x.lib + ")" : "")).join("\n") : "");
}
// a dataset's actual rows: a full-text search inside it when there's something to look for, else its first rows
export async function hfRows(id, q, n = 8) {
  const base = "https://datasets-server.huggingface.co", enc = encodeURIComponent(id);
  const sp = await get(base + "/splits?dataset=" + enc), s = ((sp && sp.splits) || []).find((x) => x.split === "train") || ((sp && sp.splits) || [])[0];
  if (!s) throw new Error(id + " has no readable splits (it may be gated or private)");
  const at = "dataset=" + enc + "&config=" + encodeURIComponent(s.config) + "&split=" + encodeURIComponent(s.split);
  let j = null, how = "first rows";
  if (q) try { j = await get(base + "/search?" + at + "&query=" + encodeURIComponent(q) + "&offset=0&length=" + n); how = "rows matching “" + q + "”"; if (!(j.rows || []).length) j = null; } catch (e) {}
  if (!j) { j = await get(base + "/first-rows?" + at); how = "first rows"; }
  const rows = (j.rows || []).slice(0, n).map((r) => r.row || r), cols = (j.features || []).map((f) => f.name);
  return { id, config: s.config, split: s.split, how, cols, rows, total: j.num_rows_total || null };
}
export function rowsText(r) {
  const cell = (v) => clip(typeof v === "object" ? JSON.stringify(v) : v, 300);
  return "DATASET " + r.id + " (https://huggingface.co/datasets/" + r.id + "), config " + r.config + ", split " + r.split + (r.total ? ", " + r.total.toLocaleString("en-US") + " rows" : "") + "; " + r.how + ", read just now:\n" +
    (r.cols.length ? "Columns: " + r.cols.join(", ") + "\n" : "") + r.rows.map((row, i) => (i + 1) + ". " + Object.entries(row).map(([c, v]) => c + ": " + cell(v)).join(" | ")).join("\n");
}

// ── Wikipedia ──
export async function wiki(q, n = 2) {
  const s = await get("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=" + n + "&srsearch=" + encodeURIComponent(q));
  const hits = ((s.query && s.query.search) || []).slice(0, n); if (!hits.length) throw new Error("no Wikipedia article for “" + q + "”");
  const out = [];
  for (const h of hits) try { const p = await get("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(h.title.replace(/ /g, "_"))); out.push({ title: p.title || h.title, url: (p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page) || "https://en.wikipedia.org/wiki/" + encodeURIComponent(h.title.replace(/ /g, "_")), text: clip(p.extract || strip(h.snippet), 1400) }); }
    catch (e) { out.push({ title: h.title, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(h.title.replace(/ /g, "_")), text: clip(strip(h.snippet), 400) }); }
  return out;
}

// ── papers: arXiv (newest work) and OpenAlex (everything, with citation counts) ──
export async function arxiv(q, n = 5, newest) {
  const x = await get("https://export.arxiv.org/api/query?search_query=" + encodeURIComponent(q.includes(":") ? q : "all:" + q.split(/\s+/).filter(Boolean).join(" AND all:")) + "&max_results=" + n + (newest ? "&sortBy=submittedDate&sortOrder=descending" : ""), 12000, true);
  const tag = (e, t) => (new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">").exec(e) || [])[1] || "";
  return (x.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({ title: clip(strip(tag(e, "title")), 240), url: clip(tag(e, "id"), 200), date: tag(e, "published").slice(0, 10), authors: (e.match(/<name>([^<]+)<\/name>/g) || []).slice(0, 4).map((a) => a.replace(/<\/?name>/g, "")), text: clip(strip(tag(e, "summary")), 700) }));
}
const unInvert = (ix) => { if (!ix) return ""; const w = []; for (const [word, at] of Object.entries(ix)) for (const i of at) w[i] = word; return w.filter(Boolean).join(" "); };
export async function openalex(q, n = 5) {
  const j = await get("https://api.openalex.org/works?per-page=" + n + "&search=" + encodeURIComponent(q) + "&mailto=hello@mentifaber.org");
  return (j.results || []).map((w) => ({ title: clip(w.display_name || w.title, 240), url: w.doi || w.id, date: String(w.publication_year || ""), cites: w.cited_by_count || 0, venue: clip(w.primary_location && w.primary_location.source && w.primary_location.source.display_name, 80), authors: (w.authorships || []).slice(0, 4).map((a) => a.author && a.author.display_name).filter(Boolean), text: clip(unInvert(w.abstract_inverted_index), 700) }));
}
export async function papers(q, n = 4) {
  const [a, o] = await Promise.all([arxiv(q, n).catch(() => []), openalex(q, n).catch(() => [])]);
  const seen = new Set(), all = [...o, ...a].filter((p) => { const t = p.title.toLowerCase().replace(/\W+/g, ""); if (!t || seen.has(t)) return false; seen.add(t); return true; });
  if (!all.length) throw new Error("no papers found for “" + q + "”");
  return all.slice(0, n * 2);
}
export const paperLine = (p) => p.title + " (" + [p.authors.join(", ") + (p.authors.length >= 4 ? " et al." : ""), p.date, p.venue, p.cites != null ? p.cites + " citations" : ""].filter(Boolean).join("; ") + ")" + (p.text ? ": " + p.text : "");

// Everything a message asked about, as numbered material: [{title, url, text}] plus what was used.
export async function gather(text, web) {
  const w = wants(text, web), q = topic(text), out = [], used = [];
  if (!w.length) return { out, used };
  const jobs = [];
  if (w.includes("rows")) { const id = DATASET_ID.exec(text)[1], ask = clip(String(text).replace(DATASET_ID, " ").replace(/\b(show|look at|sample|rows?|examples?|from|in|inside|search|the|dataset|me|about|with|for|of|on|any|some|please|give|find|get|can you|could you|that|are|is|where|which|mention|mentions|containing|contain)\b/gi, " ").replace(/[?!.,;:"]+/g, " "), 80);
    jobs.push(hfRows(id, ask.length > 2 ? ask : "").then((r) => { out.push({ title: "Hugging Face dataset " + id, url: "https://huggingface.co/datasets/" + id, text: rowsText(r) }); used.push("read rows of " + id); }).catch((e) => out.push({ note: "(couldn't read the dataset " + id + ": " + e.message + ")" }))); }
  if (w.includes("hf")) jobs.push(hfSearch(q).then((r) => { out.push({ title: "Hugging Face Hub · " + q, url: "https://huggingface.co/datasets?search=" + encodeURIComponent(q), text: hfText(r, q) }); used.push("searched Hugging Face"); }).catch(() => {}));
  if (w.includes("papers")) jobs.push(papers(q).then((ps) => { for (const p of ps) out.push({ title: p.title, url: p.url, text: "PAPER: " + paperLine(p) }); used.push("searched papers (arXiv, OpenAlex)"); }).catch(() => {}));
  if (w.includes("wiki")) jobs.push(wiki(q).then((ws) => { for (const x of ws) out.push({ title: x.title + " · Wikipedia", url: x.url, text: "WIKIPEDIA: " + x.text }); used.push("read Wikipedia"); }).catch(() => {}));
  await Promise.all(jobs);
  return { out, used };
}

// What's new in AI right now, for Genesis's free time: trending on Hugging Face and the latest arXiv papers.
export async function pulse() {
  const [tr, ax] = await Promise.all([
    get("https://huggingface.co/api/trending?limit=12").then((j) => (j.recentlyTrending || []).map((x) => (x.repoData && x.repoData.id ? x.repoType + " " + x.repoData.id : null)).filter(Boolean)).catch(() => []),
    arxiv("cat:cs.AI OR cat:cs.LG OR cat:cs.HC", 8, true).catch(() => [])]);
  if (!tr.length && !ax.length) return "";
  return (tr.length ? "TRENDING ON HUGGING FACE: " + tr.slice(0, 12).join("; ") + "\n" : "") + (ax.length ? "NEWEST AI PAPERS ON ARXIV:\n" + ax.map((p) => "- " + p.title + ": " + clip(p.text, 220)).join("\n") : "");
}
