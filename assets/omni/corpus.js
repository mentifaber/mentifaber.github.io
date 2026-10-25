/* Omnilogos · the corpus, live. Every chapter of the Bible in public-domain and openly licensed translations, fetched on
   demand from the thiagobodruk/bible dataset (MIT; one JSON per version, the same book codes in every language, so verses
   line up) and kept on this device with the Cache API, so a text downloads once. A chapter is assembled into the shape the
   lattice reads (window.OMNI: tr, refs, v) and handed to it; the 24-verse sample in data.js shows until the first chapter
   is ready, and stays if the network never answers.
   The Septuagint, the Vulgate, the Douay-Rheims and the Synodal number the Psalms the Greek way (our 23 is their 22): those
   are mapped back by chapter. */
(() => {
"use strict";
const SRC = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// every text on offer: only public domain or open licences. line: which family of translations it belongs to (agreement
// inside one family counts for less); t: Old (o), New (n) or whole Bible (b); s: short label in the agreement grid
const TEXTS = [
  { id: "WLC", f: "he_wlc", n: "Westminster Leningrad Codex", y: "c. 1008", lang: "Hebrew", code: "he", dir: "rtl", line: "orig", t: "o", s: "WLC" },
  { id: "LXX", f: "grc_grcbrent", n: "Septuagint", y: "3rd–2nd c. BC", lang: "Greek", code: "grc", line: "orig", t: "o", s: "LXX" },
  { id: "TR", f: "grc_grctr", n: "Textus Receptus", y: "1550/1894", lang: "Greek", code: "grc", line: "orig", t: "n", s: "TR" },
  { id: "Vulg", f: "la_vulg", n: "Latin Vulgate", y: "405", lang: "Latin", code: "la", line: "orig", t: "b", s: "Vul", lxx: true },
  { id: "Geneva", f: "en_gnv", n: "Geneva Bible", y: "1599", lang: "English", line: "T", t: "b", s: "Gen" },
  { id: "KJV", f: "en_kjv", n: "King James Version", y: "1769", lang: "English", line: "T", t: "b", s: "KJV" },
  { id: "CPB", f: "en_kjvcpb", n: "Cambridge Paragraph Bible", y: "1873", lang: "English", line: "T", t: "b", s: "CPB" },
  { id: "RV", f: "en_engrv", n: "Revised Version", y: "1885", lang: "English", line: "T", t: "b", s: "RV" },
  { id: "ASV", f: "en_asv", n: "American Standard Version", y: "1901", lang: "English", line: "T", t: "b", s: "ASV" },
  { id: "WEB", f: "en_web", n: "World English Bible", y: "2000", lang: "English", line: "T", t: "b", s: "WEB" },
  { id: "DRA", f: "en_dra", n: "Douay-Rheims", y: "1899", lang: "English", line: "V", t: "b", s: "DRA", lxx: true },
  { id: "YLT", f: "en_ylt98", n: "Young's Literal", y: "1898", lang: "English", line: "F", t: "b", s: "YLT" },
  { id: "Darby", f: "en_darby", n: "Darby Bible", y: "1890", lang: "English", line: "F", t: "b", s: "Dby" },
  { id: "BSB", f: "en_bsb", n: "Berean Standard Bible", y: "2022", lang: "English", line: "F", t: "b", s: "BSB" },
  { id: "LSV", f: "en_lsv", n: "Literal Standard Version", y: "2020", lang: "English", line: "F", t: "b", s: "LSV" },
  { id: "FBV", f: "en_fbv", n: "Free Bible Version", y: "2018", lang: "English", line: "F", t: "b", s: "FBV" },
  { id: "BBE", f: "en_bbe", n: "Bible in Basic English", y: "1965", lang: "English", line: "B", t: "b", s: "BBE" },
  { id: "Synodal", f: "ru_synod", n: "Synodal", y: "1876", lang: "Russian", code: "ru", line: "orig", t: "b", s: "Syn", lxx: true },
  { id: "Kralicka", f: "cs_bkr", n: "Bible kralická", y: "1613", lang: "Czech", code: "cs", line: "orig", t: "b", s: "BKR" },
  { id: "Karoli", f: "hu_hunk", n: "Károli", y: "1908", lang: "Hungarian", code: "hu", line: "orig", t: "b", s: "Kár" },
  { id: "CUV", f: "zh_cunpss-shen", n: "Chinese Union Version", y: "1919", lang: "Chinese", code: "zh", line: "orig", t: "b", s: "CUV" },
  { id: "Cadman", f: "vi_vie", n: "Cadman Bible", y: "1925", lang: "Vietnamese", code: "vi", line: "orig", t: "b", s: "Cad" },
];
const CODES = "gn ex lv nm dt js jz rt 1sm 2sm 1rs 2rs 1cr 2cr ed ne et jó sl pv ec ct is jr lm ez dn os jl am ob jn mq na hc sf ag zc ml mt mc lc jo atos rm 1co 2co gl ef fp cl 1ts 2ts 1tm 2tm tt fm hb tg 1pe 2pe 1jo 2jo 3jo jd ap".split(" ");
const DEFAULT = ["WLC", "TR", "Vulg", "KJV", "DRA", "YLT", "BBE"];
const BYID = Object.fromEntries(TEXTS.map((t) => [t.id, t]));
const KEY = "omnilogos:texts", BOOKS = [];   // [{ code, name, chapters, t }] in canonical order, from the first English text loaded
const C = { texts: (() => { try { const x = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(x) && x.length) return x.filter((id) => BYID[id]); } catch (e) {} return DEFAULT.slice(); })(),
  data: {}, loading: {}, book: null, ch: 1 };

// ── fetching: once over the network, then from this device ──
async function getText(id) {
  if (C.data[id]) return C.data[id];
  if (C.loading[id]) return C.loading[id];
  const url = SRC + BYID[id].f + ".json";
  return (C.loading[id] = (async () => {
    let res = null, cache = null;
    try { cache = await caches.open("omnilogos-v1"); res = await cache.match(url); } catch (e) {}
    if (!res) { res = await fetch(url); if (!res.ok) throw new Error(BYID[id].n + ": " + res.status); if (cache) try { await cache.put(url, res.clone()); } catch (e) {} }
    const raw = (await res.text()).replace(/^﻿/, "");
    // a whole Bible lists its 66 books in canonical order, whatever codes it uses (Basic English says "ps" for "sl"); a
    // partial one (the Hebrew, the Greek NT, the Septuagint) uses the shared codes
    const list = JSON.parse(raw), books = {};
    list.forEach((b, i) => { books[list.length === 66 ? CODES[i] : b.abbrev] = b; });
    C.data[id] = books; delete C.loading[id]; return books;
  })().catch((e) => { delete C.loading[id]; throw e; }));
}

// the Greek numbering of the Psalms (Septuagint, Vulgate, Douay), from the Hebrew chapter and verse
function lxxPsalm(ch, v) {
  if (ch <= 8 || ch >= 148) return [ch, v];
  if (ch === 9) return [9, v]; if (ch === 10) return [9, v + 21];
  if (ch <= 113) return [ch - 1, v];
  if (ch === 114) return [113, v]; if (ch === 115) return [113, v + 8];
  if (ch === 116) return v <= 9 ? [114, v] : [115, v - 9];
  if (ch <= 146) return [ch - 1, v];
  return v <= 11 ? [146, v] : [147, v - 11];   // 147
}
function verseOf(id, book, ch, v) {
  const b = C.data[id] && C.data[id][book]; if (!b) return null;
  let c = ch, n = v; if (book === "sl" && (BYID[id].lxx || id === "LXX")) [c, n] = lxxPsalm(ch, v);
  const s = b.chapters[c - 1] && b.chapters[c - 1][n - 1];
  return s ? s.replace(/\s+/g, " ").trim() : null;
}

// one chapter, in the lattice's shape
function chapter(book, ch) {
  const bk = BOOKS.find((b) => b.code === book), name = bk ? bk.name : book;
  const ids = C.texts.filter((id) => C.data[id] && C.data[id][book]);
  const eng = ids.find((id) => BYID[id].lang === "English") || ids[0];
  const nv = Math.max(...ids.map((id) => { const b = C.data[id][book]; let c = ch; if (book === "sl" && (BYID[id].lxx || id === "LXX")) return 0; return (b.chapters[c - 1] || []).length; }), 0);
  const refs = [], v = {};
  for (let n = 1; n <= nv; n++) {
    const r = name + " " + ch + ":" + n, row = {};
    ids.forEach((id) => { const s = verseOf(id, book, ch, n); if (s) row[id] = s; });
    if (Object.keys(row).length) { refs.push(r); v[r] = row; }
  }
  const tr = ids.map((id) => { const t = BYID[id]; return { id, n: t.n, y: t.y, lang: t.lang, line: t.line, dir: t.dir || "", s: t.s, code: t.code || "en" }; });
  return { tr, refs, v, live: { book, name, ch, eng } };
}

// ── the picker in the header: book, chapter, texts ──
function bar() {
  const top = document.querySelector("header.top"), pill = top.querySelector(".pill");
  const nav = document.createElement("div"); nav.className = "cnav";
  nav.innerHTML = '<select id="cbook" aria-label="Book"></select><button id="cprev" aria-label="Previous chapter">‹</button><select id="cch" aria-label="Chapter"></select><button id="cnext" aria-label="Next chapter">›</button>'
    + '<button id="ctexts" class="ctexts" aria-haspopup="dialog">Texts <b id="cn"></b></button><span id="cstat" class="cstat" role="status"></span>';
  pill.replaceWith(nav);
  const dlg = document.createElement("dialog"); dlg.id = "cdlg"; dlg.className = "cdlg"; document.body.append(dlg);
  $("cbook").onchange = (e) => go(e.target.value, 1);
  $("cch").onchange = (e) => go(C.book, +e.target.value);
  $("cprev").onclick = () => step(-1); $("cnext").onclick = () => step(1);
  $("ctexts").onclick = texts;
  addEventListener("keydown", (e) => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || dlg.open) return; if (e.key === "[") step(-1); if (e.key === "]") step(1); });
}
function step(d) {
  const i = BOOKS.findIndex((b) => b.code === C.book), b = BOOKS[i]; if (!b) return;
  if (C.ch + d >= 1 && C.ch + d <= b.chapters) return go(C.book, C.ch + d);
  const nb = BOOKS[i + d]; if (nb) go(nb.code, d > 0 ? 1 : nb.chapters);
}
function fillBooks() {
  $("cbook").innerHTML = BOOKS.map((b, i) => (i === 0 ? '<optgroup label="Old Testament">' : i === 39 ? '</optgroup><optgroup label="New Testament">' : "") + '<option value="' + esc(b.code) + '">' + esc(b.name) + "</option>").join("") + "</optgroup>";
}
function texts() {
  const d = $("cdlg"), sel = new Set(C.texts);
  const row = (t) => '<label class="ct"><input type="checkbox" value="' + t.id + '"' + (sel.has(t.id) ? " checked" : "") + '><span><b>' + esc(t.n) + "</b><small>" + esc(t.lang + " · " + t.y + (t.t === "o" ? " · Old Testament" : t.t === "n" ? " · New Testament" : "")) + (C.data[t.id] ? " · on this device" : "") + "</small></span></label>";
  const grp = (h, f) => "<h4>" + h + "</h4>" + TEXTS.filter(f).map(row).join("");
  d.innerHTML = '<form method="dialog"><h3>Texts to compare</h3><p class="mute">Each text downloads once (about 1.2 MB) and stays on this device. Agreement is measured across the English ones; the rest stand beside them.</p>'
    + grp("The originals", (t) => t.line === "orig" && ["Hebrew", "Greek", "Latin"].includes(t.lang)) + grp("English", (t) => t.lang === "English") + grp("Other languages", (t) => t.line === "orig" && !["Hebrew", "Greek", "Latin"].includes(t.lang))
    + '<p class="mute">Texts: <a href="https://github.com/thiagobodruk/bible" target="_blank" rel="noopener">thiagobodruk/bible</a> (MIT). Every one here is in the public domain or under an open licence (LSV and FBV: CC BY-SA 4.0).</p><div class="row"><button value="cancel" class="sec">Cancel</button><button value="ok" class="pri">Compare these</button></div></form>';
  d.onclose = () => {
    if (d.returnValue !== "ok") return;
    const pick = [...d.querySelectorAll("input:checked")].map((i) => i.value);
    if (!pick.some((id) => BYID[id].lang === "English")) pick.push("KJV");
    C.texts = TEXTS.map((t) => t.id).filter((id) => pick.includes(id));
    try { localStorage.setItem(KEY, JSON.stringify(C.texts)); } catch (e) {}
    go(C.book, C.ch);
  };
  d.showModal();
}
function stat(t, bad) { const s = $("cstat"); if (s) { s.textContent = t; s.classList.toggle("bad", !!bad); } }

let seq = 0;
async function go(book, ch, ref) {
  const my = ++seq; C.book = book; C.ch = ch;
  const b = BOOKS.find((x) => x.code === book);
  if (b) { $("cbook").value = book; $("cch").innerHTML = Array.from({ length: b.chapters }, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + "</option>").join(""); $("cch").value = ch; }
  const want = C.texts.filter((id) => BYID[id].t === "b" || (b && BYID[id].t === b.t));
  $("cn").textContent = want.length;
  const missing = want.filter((id) => !C.data[id]);
  if (missing.length) stat("Loading " + missing.map((id) => BYID[id].s).join(", ") + "…");
  let failed = [];
  await Promise.all(missing.map((id) => getText(id).then(() => { if (my === seq) stat("Loading… " + want.filter((x) => C.data[x]).length + " of " + want.length + " texts"); }).catch(() => failed.push(BYID[id].n))));
  if (my !== seq) return;
  if (!BOOKS.length) return stat("Couldn't reach the texts. Showing the sample.", true);
  const O = chapter(book, ch);
  if (!O.refs.length) return stat("Nothing in this chapter from the chosen texts.", true);
  window.Omnilogos.use(O, ref);
  stat(failed.length ? "Couldn't load: " + failed.join(", ") : O.tr.length + " texts · " + O.refs.length + " verses", !!failed.length);
  try { history.replaceState(null, "", "#c=" + book + "." + ch + (ref ? "&v=" + encodeURIComponent(ref) : "")); } catch (e) {}
}

async function start() {
  bar();
  const m = /[#&]c=([^.&]+)\.(\d+)/.exec(location.hash), mv = /[#&]v=([^&]+)/.exec(location.hash);
  try { await getText("KJV"); } catch (e) { stat("Offline: showing the sample. The full texts load when you're connected.", true); return; }
  for (const b of Object.values(C.data.KJV)) BOOKS.push({ code: b.abbrev, name: b.name, chapters: b.chapters.length, t: BOOKS.length < 39 ? "o" : "n" });
  fillBooks();
  const book = m && BOOKS.some((b) => b.code === m[1]) ? m[1] : "jo", ch = m ? +m[2] : 1;
  go(book, ch, mv ? decodeURIComponent(mv[1]) : null);
}
window.OmniCorpus = { TEXTS, C, go, chapter, lxxPsalm, getText, BOOKS };
if (window.Omnilogos) start(); else addEventListener("load", start);
})();
