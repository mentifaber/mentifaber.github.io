/* DocCrawler · in the browser. Files are read here (text directly, PDFs with pdf.js, Word with mammoth, images with
   Tesseract OCR, each loaded only when needed), hashed with SHA-256 so duplicates are skipped, stored in IndexedDB, and
   indexed for ranked search that treats a question as any of its words, not all of them. Tags are the top keywords;
   edit them freely. The Librarian answers from ranked excerpts with citations, through a model if you allow it, or as
   plain retrieval where nothing leaves the device. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LIBS = { pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", pdfw: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", docx: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", ocr: "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js" };
const STOP = new Set("a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our she so that the their them then there these they this to was we were what when where which who why will with you your do does did can could should would about after all also any been before being both each few how just more most other over same some such than too very off out up down only own s t don now get got let may might must shall".split(" "));
const toks = (t) => (String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9][a-z0-9'-]{1,}/g) || []).map((w) => w.replace(/'s$/, "")).filter((w) => !STOP.has(w));
const toast = (t) => { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); };
const load = (src) => new Promise((ok, no) => { if (document.querySelector('script[src="' + src + '"]')) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("couldn't load " + src.split("/").pop())); document.head.appendChild(s); });

// ── storage (IndexedDB, one store of documents) ──
const DB = { db: null,
  open() { return new Promise((ok, no) => { const r = indexedDB.open("doccrawler", 1); r.onupgradeneeded = () => r.result.createObjectStore("docs", { keyPath: "id" }); r.onsuccess = () => ok((DB.db = r.result)); r.onerror = () => no(r.error); }); },
  tx(mode) { return DB.db.transaction("docs", mode).objectStore("docs"); },
  all() { return new Promise((ok) => { const r = DB.tx("readonly").getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); }); },
  put(d) { return new Promise((ok) => { const r = DB.tx("readwrite").put(d); r.onsuccess = ok; r.onerror = ok; }); },
  del(id) { return new Promise((ok) => { const r = DB.tx("readwrite").delete(id); r.onsuccess = ok; r.onerror = ok; }); },
  clear() { return new Promise((ok) => { const r = DB.tx("readwrite").clear(); r.onsuccess = ok; r.onerror = ok; }); },
};

// ── the index: passages of ~700 characters, BM25 over them ──
const S = { docs: [], passages: [], df: new Map(), avg: 1, tag: null, chat: [] };
function rebuild() {
  S.passages = []; S.df = new Map(); let total = 0;
  for (const d of S.docs) {
    const text = d.text || "", step = 600;
    for (let i = 0; i < Math.max(1, text.length); i += step) {
      const body = text.slice(Math.max(0, i - 100), i + step), ts = toks(body); if (!ts.length && text.length) continue;
      const tf = new Map(); ts.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      S.passages.push({ doc: d, body, tf, len: ts.length }); total += ts.length; tf.forEach((_, w) => S.df.set(w, (S.df.get(w) || 0) + 1));
    }
  }
  S.avg = total / Math.max(1, S.passages.length);
}
function search(q, n = 8) {
  const qs = [...new Set(toks(q))]; if (!qs.length) return [];
  const N = S.passages.length, k1 = 1.4, b = 0.75, scored = [];
  for (const p of S.passages) {
    if (S.tag && !p.doc.tags.includes(S.tag)) continue;
    let s = 0, hit = 0; for (const w of qs) { const f = p.tf.get(w) || 0; if (!f) continue; hit++; const idf = Math.log(1 + (N - S.df.get(w) + 0.5) / (S.df.get(w) + 0.5)); s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * p.len / S.avg)); }
    if (hit) scored.push({ p, s: s * (1 + 0.15 * (hit - 1)) }); // any of the words; more of them ranks higher
  }
  scored.sort((x, y) => y.s - x.s);
  const seen = new Map(); return scored.filter((x) => { const k = (seen.get(x.p.doc.id) || 0) + 1; seen.set(x.p.doc.id, k); return k <= 2; }).slice(0, n).map((x) => ({ ...x, qs }));
}
function snippet(body, qs) {
  const lo = body.toLowerCase(); let at = 0; for (const w of qs) { const i = lo.indexOf(w); if (i >= 0) { at = i; break; } }
  const s = Math.max(0, at - 90), cut = body.slice(s, s + 280).replace(/\s+/g, " ");
  return (s ? "…" : "") + esc(cut).replace(new RegExp("\\b(" + qs.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi"), "<mark>$1</mark>") + "…";
}
function autoTags(text) { // top keywords that are frequent here and not everywhere
  const tf = new Map(); toks(text).filter((w) => w.length > 3 && !/^\d+$/.test(w)).forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
  return [...tf].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
}

// ── reading files ──
async function readFile(f) {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") { await load(LIBS.pdf); pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfw; const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; let out = ""; for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); out += c.items.map((x) => x.str).join(" ") + "\n\n"; } return { text: out, kind: "pdf" }; }
  if (ext === "docx") { await load(LIBS.docx); const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); return { text: r.value, kind: "docx" }; }
  if (/^image\//.test(f.type)) { toast("Reading " + f.name + " with OCR (first time downloads the engine)…"); await load(LIBS.ocr); const r = await Tesseract.recognize(f, "eng"); return { text: r.data.text, kind: "image" }; }
  return { text: await f.text(), kind: ext === "md" || ext === "markdown" ? "md" : "text" };
}
const ICON = { pdf: "📕", docx: "📘", image: "🖼", md: "📝", text: "📄" };
async function sha(buf) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function add(files) {
  let added = 0, dup = 0, failed = 0;
  for (const f of files) {
    try {
      const id = await sha(await f.arrayBuffer()); if (S.docs.some((d) => d.id === id)) { dup++; continue; }
      const { text, kind } = await readFile(f);
      const d = { id, name: f.name, kind, size: f.size, at: Date.now(), text: text.slice(0, 2e6), tags: autoTags(text), ocr: kind === "image" };
      await DB.put(d); S.docs.push(d); added++;
    } catch (e) { failed++; toast("Couldn't read " + f.name + ": " + (e.message || e)); }
  }
  rebuild(); draw(); if (added || dup) toast(added + " added" + (dup ? " · " + dup + " duplicate" + (dup > 1 ? "s" : "") + " skipped" : "") + (failed ? " · " + failed + " failed" : ""));
}

// ── screens ──
function draw() {
  $("count").textContent = S.docs.length + " document" + (S.docs.length === 1 ? "" : "s");
  const tagc = new Map(); S.docs.forEach((d) => d.tags.forEach((t) => tagc.set(t, (tagc.get(t) || 0) + 1)));
  $("tags").innerHTML = [...tagc].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t, n]) => '<button data-tag="' + esc(t) + '" class="' + (S.tag === t ? "on" : "") + '">' + esc(t) + " " + n + "</button>").join("");
  $("docs").innerHTML = S.docs.filter((d) => !S.tag || d.tags.includes(S.tag)).sort((a, b) => b.at - a.at).map((d) => '<li data-id="' + d.id + '"><i>' + (ICON[d.kind] || "📄") + "</i><b>" + esc(d.name) + "</b><small>" + Math.max(1, Math.round(d.size / 1024)) + " KB · " + esc(d.tags.slice(0, 3).join(", ")) + "</small></li>").join("");
  results();
}
function results() {
  const q = $("q").value.trim();
  if (!S.docs.length) { $("results").innerHTML = '<p class="empty"><b>An empty library.</b> Add files (or drop them anywhere), or load the sample library to try it. Everything stays in this browser.</p>'; return; }
  if (!q) { $("results").innerHTML = '<p class="empty">Search above, or ask the Librarian a question. ' + S.passages.length + " passages indexed" + (S.tag ? ", filtered to <b>" + esc(S.tag) + "</b>" : "") + ".</p>"; return; }
  const hits = search(q, 12);
  $("results").innerHTML = hits.length ? hits.map((h) => '<div class="hit" data-id="' + h.p.doc.id + '"><b>' + (ICON[h.p.doc.kind] || "📄") + " " + esc(h.p.doc.name) + "</b><small>score " + h.s.toFixed(2) + "</small><p>" + snippet(h.p.body, h.qs) + "</p></div>").join("") : '<p class="empty">Nothing matches any of those words.</p>';
}
function view(id) {
  const d = S.docs.find((x) => x.id === id); if (!d) return; $("view").hidden = false; $("vt").textContent = d.name;
  const drawTags = () => { $("vtags").innerHTML = d.tags.map((t) => "<span>" + esc(t) + ' <button data-rm="' + esc(t) + '" aria-label="Remove tag">✕</button></span>').join("") + '<input id="newtag" placeholder="add a tag">' + ' <button class="link danger" id="deldoc">Delete document</button>'; };
  drawTags(); $("vb").textContent = (d.ocr ? "[text read by OCR; check it against the original]\n\n" : "") + (d.text || "(no text found)");
  $("vtags").onclick = async (e) => { const rm = e.target.closest("[data-rm]"); if (rm) { d.tags = d.tags.filter((t) => t !== rm.dataset.rm); await DB.put(d); drawTags(); draw(); } if (e.target.id === "deldoc") { await DB.del(d.id); S.docs = S.docs.filter((x) => x !== d); rebuild(); draw(); $("view").hidden = true; toast("Deleted"); } };
  $("vtags").onkeydown = async (e) => { if (e.target.id === "newtag" && e.key === "Enter") { const t = e.target.value.trim().toLowerCase(); if (t && !d.tags.includes(t)) { d.tags.push(t); await DB.put(d); drawTags(); draw(); } } };
}

// ── the Librarian ──
function bubble(cls, html) { const el = document.createElement("div"); el.className = "msg " + cls; el.innerHTML = html; $("chat").appendChild(el); $("chat").scrollTop = $("chat").scrollHeight; return el; }
async function ask(q) {
  if (!q) return; bubble("me", esc(q));
  const hits = search(q + " " + S.chat.slice(-2).map((m) => m.q).join(" "), 6);
  if (!hits.length) { bubble("lib", "Nothing in the library mentions that. Add the document that would, and ask again."); return; }
  const cites = '<div class="cites">' + hits.map((h, i) => '<button data-id="' + h.p.doc.id + '">[' + (i + 1) + "] " + esc(h.p.doc.name) + "</button>").join("") + "</div>";
  if (!$("useModel").checked) { bubble("lib", "<b>Retrieval only.</b> The passages that best match:<br>" + hits.slice(0, 3).map((h, i) => "<p>[" + (i + 1) + "] " + snippet(h.p.body, h.qs) + "</p>").join("") + cites); return; }
  const pend = bubble("lib", "Reading the excerpts…");
  try {
    const ms = await fetch("/api/hive/models").then((r) => r.json()), m = (ms.models || []).find((x) => /gpt-oss-120b|llama-3\.3-70b/.test(x.id) && /^workers-ai/.test(x.id)) || (ms.models || []).find((x) => /^workers-ai/.test(x.id));
    if (!m) throw new Error("no model available");
    const material = hits.map((h, i) => "[" + (i + 1) + "] " + h.p.doc.name + "\n" + h.p.body.replace(/\s+/g, " ").slice(0, 900)).join("\n\n");
    const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: m.id, system: "You are the Librarian of DocCrawler. Answer ONLY from the numbered excerpts of the user's own documents below, citing them like [1]. If they don't contain the answer, say so plainly. Be concise.", messages: [...S.chat.slice(-3).flatMap((c) => [{ role: "user", text: c.q }, { role: "assistant", text: c.a }]), { role: "user", text: "EXCERPTS FROM MY DOCUMENTS:\n" + material + "\n\nQUESTION: " + q }] }) }).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    const a = String(r.text || "").trim(); S.chat.push({ q, a });
    pend.innerHTML = esc(a).replace(/\[(\d)\]/g, "<b>[$1]</b>").replace(/\n/g, "<br>") + cites + '<div class="src">' + esc(m.name) + " · from your excerpts</div>";
  } catch (e) { pend.innerHTML = "The model didn't answer (" + esc(String(e.message || e).slice(0, 90)) + "), so here's plain retrieval:<br>" + hits.slice(0, 3).map((h, i) => "<p>[" + (i + 1) + "] " + snippet(h.p.body, h.qs) + "</p>").join("") + cites; }
}

// ── a sample library, so there's something to try ──
const SAMPLE = [
  ["Dishwasher manual — error codes.md", "md", "# Dishwasher error codes\n\nE1 — Water inlet fault. The machine could not fill in the expected time. Check that the tap is fully open, that the inlet hose is not kinked, and clean the inlet filter screen behind the hose connection.\n\nE2 — Drain fault. Water remains after the drain cycle. Remove and rinse the filter assembly at the bottom of the tub, check the drain hose for kinks, and make sure the sink trap is clear.\n\nE4 — Overflow protection. Water detected in the base tray. Turn off the water supply, tilt the machine 45 degrees backwards to empty the tray, and check for leaks at the door seal.\n\nE9 — Touch panel fault. A button is stuck or the panel is wet. Dry the panel and restart. If it persists, call service.\n\nService interval: clean the filter monthly and run an empty hot cycle with descaler every three months."],
  ["Receipt — tire rotation Oct 2026.txt", "text", "MAIN STREET AUTO\n10/04/2026  Work order 44817\nVehicle: 2008 Volvo XC70, 162,410 miles\n\nTire rotation and balance ......... $59.95\nBrake inspection (front pads 4mm, rear 6mm) ... no charge\nCabin air filter .................... $34.50\nShop supplies ....................... $6.20\nTax ................................. $7.66\nTOTAL ............................... $108.31\n\nNext service due at 167,000 miles or April 2027. Front pads will need replacing within ~5,000 miles."],
  ["Notes — router and network.md", "md", "# Home network notes\n\nRouter admin is at 192.168.1.1. Guest network is separate and isolated from the NAS.\n\nThe NAS gets a DHCP reservation at 192.168.1.20. Backups run nightly at 2:00 and keep 30 days.\n\nIf the mesh node in the garage drops, power-cycle it first; it takes about four minutes to rejoin.\n\nThe Roku is at 192.168.1.42 (reserved) so the web remote can find it.\n\nISP outage line is on the bill; average outage last year was 40 minutes."],
];
async function sample() { const enc = new TextEncoder(); await add(SAMPLE.map(([n, k, t]) => new File([enc.encode(t)], n, { type: "text/plain" }))); }

// ── wiring ──
$("files").addEventListener("change", (e) => { add([...e.target.files]); e.target.value = ""; });
$("sample").addEventListener("click", sample);
$("q").addEventListener("input", () => { show("lib"); results(); });
$("find").addEventListener("submit", (e) => e.preventDefault());
$("tags").addEventListener("click", (e) => { const b = e.target.closest("[data-tag]"); if (!b) return; S.tag = S.tag === b.dataset.tag ? null : b.dataset.tag; draw(); });
document.addEventListener("click", (e) => { const el = e.target.closest("[data-id]"); if (el && !e.target.closest("#vtags")) view(el.dataset.id); });
$("vx").addEventListener("click", () => ($("view").hidden = true)); $("view").addEventListener("click", (e) => { if (e.target === $("view")) $("view").hidden = true; });
function show(t) { document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); $("p-lib").hidden = t !== "lib"; $("p-ask").hidden = t !== "ask"; }
document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(b.dataset.t); });
$("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("aq").value.trim(); $("aq").value = ""; ask(q); });
addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dragging"); });
addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("dragging"); if (e.dataTransfer.files.length) add([...e.dataTransfer.files]); });
$("export").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ doccrawler: 1, docs: S.docs })], { type: "application/json" })); a.download = "doccrawler-library.json"; a.click(); });
$("import").addEventListener("change", async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); let n = 0; for (const d of j.docs || []) if (d.id && !S.docs.some((x) => x.id === d.id)) { await DB.put(d); S.docs.push(d); n++; } rebuild(); draw(); toast(n + " imported"); } catch (err) { toast("That isn't a DocCrawler export"); } e.target.value = ""; });
$("wipe").addEventListener("click", async () => { if (!confirm("Remove every document from this browser's library?")) return; await DB.clear(); S.docs = []; rebuild(); draw(); });
(async () => { try { await DB.open(); S.docs = await DB.all(); } catch (e) { toast("This browser won't keep a library (private mode?); it works until you close the tab."); } rebuild(); draw(); })();
window.DocCrawler = { S, search, add, sample, ask };
})();
