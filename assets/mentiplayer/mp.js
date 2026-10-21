// MentiPlayer: browse and play open media through the gateway at /api/media (src/media.js). Everything a source says is put on the
// page as text, never as markup, and every address is checked to be https before it is used.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const LS = { get(k, d) { try { const v = localStorage.getItem("mp:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("mp:" + k, JSON.stringify(v)); } catch (e) {} } };
const LABEL = { movie: "Film", tv: "TV", music: "Music", radio: "Radio", audiobook: "Audiobook", podcast: "Podcast", video: "Video", live: "Live TV" };
const HUE = { movie: 268, tv: 190, music: 150, radio: 8, audiobook: 38, podcast: 320, video: 215, live: 350 };
const el = (tag, props, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props || {})) { if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ""); else if (v !== false && v != null) e.setAttribute(k, v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
const https = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
const fmt = (s) => { if (!isFinite(s) || s < 0) return "0:00"; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const ph = (type) => { const h = HUE[type] || 40, t = (LABEL[type] || "Media").toUpperCase(); return "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(" + h + " 45% 22%)'/><stop offset='1' stop-color='hsl(" + ((h + 40) % 360) + " 55% 10%)'/></linearGradient></defs><rect width='300' height='300' fill='url(#g)'/><text x='150' y='160' text-anchor='middle' font-family='sans-serif' font-size='34' font-weight='700' letter-spacing='4' fill='hsl(" + h + " 70% 75%)' opacity='.8'>" + t + "</text></svg>"); };
const pic = (src, type, props) => { const i = el("img", { alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", ...(props || {}) }); i.src = https(src) || ph(type); i.addEventListener("error", () => { if (!i.dataset.f) { i.dataset.f = "1"; i.src = ph(type); } }); return i; };
const toast = (t, ms) => { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms || 2600); };
// Safe mode is on unless it has been switched off: the gateway enforces it, this only says which way to ask
const safeQ = (path) => (S.safe ? path : path + (path.includes("?") ? "&" : "?") + "safe=0");
const api = async (path) => { const r = await fetch("/api/media" + safeQ(path), { headers: { accept: "application/json" }, signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined }); const j = await r.json().catch(() => ({ error: "the gateway said " + r.status })); if (!r.ok || j.error) throw new Error(j.error || "the gateway said " + r.status); return j; };
if (matchMedia("(hover: none)").matches) document.body.classList.add("touch");

const S = { safe: LS.get("safe", true) !== false, type: "", q: "", page: 1, src: LS.get("src", null), saved: LS.get("saved", []), recent: LS.get("recent", []), names: {}, tok: 0, tok2: 0, openId: "", q2: [], qi: -1, cur: null, live: false, rate: LS.get("rate", 1) };
// what an earlier version showed in Continue and Saved is looked at again: from user-upload sources, or with suggestive words, it goes while Safe mode is on
const UNSAFE = new Set(["commons", "audius", "mixcloud", "ccmixter", "jamendo", "dailymotion", "peertube"]), RISKY = /\b(sex\w*|porn\w*|xxx+|erotic\w*|nude\w*|nudity|naked|topless|hentai|nsfw|adult\w*|sensual\w*|seduc\w*|bikini|lingerie|boob\w*|breasts?|strip\w*|fetish\w*|kinky|horny|naughty|hardcore|softcore|explicit|uncensored|mature|burlesque|18\+)\b/i;
const okItem = (it) => !S.safe || (!UNSAFE.has(it.source) && !RISKY.test([it.title, it.creator, it.description, it.meta].join(" ")));
if (LS.get("v", 0) < 3) { S.recent = []; LS.set("recent", []); LS.set("v", 3); } // Continue starts clean once, for everyone
const compact = (it) => ({ id: it.id, source: it.source, type: it.type, title: it.title, creator: it.creator, year: it.year, description: it.description, thumb: it.thumb, page: it.page, license: it.license, meta: it.meta, ...(it.rating ? { rating: it.rating } : {}), ...(it.play ? { play: it.play } : {}) });
const isSaved = (it) => S.saved.some((s) => s.id === it.id);
const toggleSave = (it) => { if (isSaved(it)) { S.saved = S.saved.filter((s) => s.id !== it.id); toast("Removed from Saved"); } else { S.saved = [compact(it), ...S.saved].slice(0, 200); toast("Saved ♥"); } LS.set("saved", S.saved); };
const pushRecent = (it) => { S.recent = [compact(it), ...S.recent.filter((r) => r.id !== it.id)].slice(0, 20); LS.set("recent", S.recent); };
// Rotten Tomatoes' score where the site has one (through OMDb), else IMDb's
const scoreOf = (r) => (r ? (r.rt != null ? "🍅 " + r.rt + "%" : r.imdb != null ? "★ " + r.imdb : "") : "");
const metaOf = (it) => [it.type === "tv" || it.type === "radio" ? it.meta || it.creator : it.creator, it.year].filter(Boolean).join(" · ");

// ── cards and shelves ──
function card(it, onOpen) {
  const img = pic(it.thumb, it.type);
  const art = el("div", { class: "art" }, img, el("span", { class: "badge" + (it.type === "radio" || it.type === "live" ? " live" : ""), text: it.type === "radio" ? "Live" : LABEL[it.type] || it.type }), scoreOf(it.rating) ? el("span", { class: "score", title: it.rating.rt != null ? "Rotten Tomatoes" + (it.rating.imdb != null ? " · IMDb " + it.rating.imdb : "") : "IMDb", text: scoreOf(it.rating) }) : null);
  const open = el("button", { class: "open", type: "button", "aria-label": "Open " + it.title }, art, el("h3", { text: it.title }), el("div", { class: "meta", text: metaOf(it) }));
  open.addEventListener("click", () => (onOpen || openItem)(it));
  const heart = el("button", { class: "heart" + (isSaved(it) ? " on" : ""), type: "button", "aria-label": "Save to your list", "aria-pressed": String(isSaved(it)), text: "♥" });
  heart.addEventListener("click", () => { toggleSave(it); heart.classList.toggle("on", isSaved(it)); heart.setAttribute("aria-pressed", String(isSaved(it))); if (S.type === "saved") showSaved(); });
  return el("article", { class: "card t-" + it.type }, open, heart);
}
const shelf = (title, note) => { const rail = el("div", { class: "rail" }, el("div", { class: "skel" })); return { sec: el("section", { class: "shelf" }, el("h2", { text: title }, note ? el("small", { text: note }) : null), rail), rail }; };
const fill = (rail, items) => { rail.replaceChildren(...items.map((i) => card(i))); };
async function loadHome() {
  const home = $("home"), tok = ++S.tok; home.replaceChildren(); $("results").hidden = true; home.hidden = false; $("status").textContent = "";
  const want = S.type;
  if (!want || want === "all") { const rec = S.recent.filter(okItem); if (rec.length) { const s = shelf("Continue"); home.append(s.sec); fill(s.rail, rec); } }
  let rails = []; try { rails = (await api("/featured")).rails; } catch (e) { if (tok === S.tok) $("status").textContent = "The media gateway isn't answering right now. Try again in a moment."; return; }
  if (tok !== S.tok) return; rails = rails.filter((r) => !want || r.type === want);
  const jobs = rails.map((r) => { const s = shelf(r.title); home.append(s.sec); return () => api("/featured?rail=" + encodeURIComponent(r.id)).then((j) => { if (tok !== S.tok) return; if (j.items && j.items.length) fill(s.rail, j.items); else s.sec.replaceChildren(el("h2", { text: r.title }), el("p", { class: "gone", text: "Nothing from this one right now." })); }).catch(() => { if (tok === S.tok) s.sec.replaceChildren(el("h2", { text: r.title }), el("p", { class: "gone", text: "This source didn't answer. It may be resting; it'll be back." })); }); });
  const pool = async () => { while (jobs.length) await jobs.shift()(); }; await Promise.all([pool(), pool(), pool(), pool()]);
}
async function runSearch(more) {
  const tok = ++S.tok; S.page = more ? S.page + 1 : 1; $("home").hidden = true; $("results").hidden = false; const grid = $("grid");
  if (!more) { grid.replaceChildren(); $("more").hidden = true; } $("status").textContent = more ? "Loading more…" : "Searching for “" + S.q + "”…";
  const qs = new URLSearchParams({ q: S.q, type: S.type || "all", page: String(S.page) }); if (S.src) qs.set("src", S.src.join(","));
  try {
    const j = await api("/search?" + qs); if (tok !== S.tok) return;
    grid.append(...j.items.map((i) => card(i))); const down = Object.entries(j.sources || {}).filter(([, v]) => !v.ok).map(([k]) => S.names[k] || k), got = grid.children.length;
    if (!got) grid.append(el("div", { class: "empty", text: "Nothing found for “" + S.q + "”. Try another word, or another tab." }));
    $("status").textContent = got ? got + " result" + (got === 1 ? "" : "s") + (down.length ? " · " + down.join(", ") + " didn't answer" : "") : "";
    $("more").hidden = !j.items.length || S.page >= 10 || (S.type === "" && S.page >= 3);
  } catch (e) { if (tok === S.tok) { $("status").textContent = ""; if (!more) grid.replaceChildren(el("div", { class: "empty", text: "The search didn't go through: " + e.message })); else toast("That didn't load: " + e.message); } }
}
function showSaved() {
  ++S.tok; $("home").hidden = true; $("results").hidden = false; $("more").hidden = true; const grid = $("grid"); const sv = S.saved.filter(okItem); grid.replaceChildren(...sv.map((i) => card(i)));
  if (!sv.length) grid.append(el("div", { class: "empty", text: "Nothing saved yet. Tap the ♥ on anything to keep it here." })); $("status").textContent = sv.length ? sv.length + " saved on this device" + (sv.length < S.saved.length ? " (" + (S.saved.length - sv.length) + " hidden by Safe mode)" : "") : "";
}
function syncUrl(replace) {
  const h = new URLSearchParams(); if (S.q) h.set("q", S.q); if (S.type) h.set("t", S.type); if (S.openId && dlg.open) h.set("i", S.openId);
  try { history[replace ? "replaceState" : "pushState"](null, "", location.pathname + (h.toString() ? "#" + h : "")); } catch (e) {}
}
function go(replace) { syncUrl(replace); if (S.type === "saved") return showSaved(); if (S.q) runSearch(false); else loadHome(); }
$("find").addEventListener("submit", (e) => { e.preventDefault(); S.q = $("q").value.trim(); go(); });
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; [...$("tabs").children].forEach((x) => x.classList.toggle("on", x === b)); S.type = b.dataset.t; go(); });
$("more").addEventListener("click", () => runSearch(true));

// ── the deck: audio keeps playing while you browse ──
$("dkart").addEventListener("error", () => { const t = S.cur ? S.cur.type : "music"; if ($("dkart").dataset.f !== t) { $("dkart").dataset.f = t; $("dkart").src = ph(t); } });
const A = $("audio"), RATES = [1, 1.25, 1.5, 1.75, 2];
const posKey = (u) => "pos:" + u.slice(0, 200);
function deckUi() {
  const t = S.q2[S.qi], m = S.cur; $("deck").hidden = !t; document.body.classList.toggle("deck-on", !!t); if (!t) return;
  $("dktitle").textContent = t.title || (m && m.title) || ""; $("dksub").textContent = S.live ? "Live radio" : (m && m.title && t.title !== m.title ? m.title : (m && m.creator) || "");
  $("dkart").src = https(m && m.thumb) || ph(m ? m.type : "music"); $("deck").classList.toggle("live", S.live); $("dkprev").disabled = S.live || S.qi <= 0; $("dknext").disabled = S.live || S.qi >= S.q2.length - 1; $("dkrate").hidden = S.live; $("dkrate").textContent = S.rate + "×";
  document.querySelectorAll("#dlg .tracks.audio li").forEach((li, i) => li.classList.toggle("on", i === S.qi));
}
function loadTrack(i, resume) {
  const t = S.q2[i]; if (!t || !https(t.url)) return; S.qi = i; A.src = t.url; A.playbackRate = S.rate; const saved = !S.live && LS.get(posKey(t.url), 0);
  if (saved > 5 && resume !== false) A.addEventListener("loadedmetadata", () => { if (A.duration - saved > 10) A.currentTime = saved; }, { once: true });
  A.play().catch(() => toast("Tap ▶ to start")); deckUi(); session();
}
function playTracks(tracks, i, m, live) { stopVideo(); S.q2 = tracks.filter((t) => https(t.url)); S.cur = m; S.live = !!live; pushRecent(m); loadTrack(Math.max(0, Math.min(i, S.q2.length - 1))); }
function stopAudio() { A.pause(); A.removeAttribute("src"); A.load(); S.q2 = []; S.qi = -1; S.cur = null; deckUi(); }
A.addEventListener("play", () => ($("dkplay").textContent = "⏸")); A.addEventListener("pause", () => ($("dkplay").textContent = "▶"));
A.addEventListener("loadedmetadata", () => ($("dkdur").textContent = S.live || !isFinite(A.duration) ? "" : fmt(A.duration)));
let lastSave = 0;
A.addEventListener("timeupdate", () => { $("dkcur").textContent = fmt(A.currentTime); if (isFinite(A.duration) && A.duration > 0) $("dkseek").value = String(Math.round((A.currentTime / A.duration) * 1000)); if (!S.live && S.q2[S.qi] && Date.now() - lastSave > 5000) { lastSave = Date.now(); LS.set(posKey(S.q2[S.qi].url), Math.floor(A.currentTime)); } });
A.addEventListener("ended", () => { if (S.q2[S.qi]) LS.set(posKey(S.q2[S.qi].url), 0); if (S.qi < S.q2.length - 1) loadTrack(S.qi + 1, false); else $("dkplay").textContent = "▶"; });
A.addEventListener("error", () => { if (!A.getAttribute("src")) return; toast(S.live ? "This station isn't answering. Try another." : "That one wouldn't play." + (S.qi < S.q2.length - 1 ? " Skipping ahead." : "")); if (!S.live && S.qi < S.q2.length - 1) loadTrack(S.qi + 1, false); });
$("dkplay").addEventListener("click", () => (A.paused ? A.play().catch(() => {}) : A.pause()));
$("dkprev").addEventListener("click", () => loadTrack(S.qi - 1, false)); $("dknext").addEventListener("click", () => loadTrack(S.qi + 1, false));
$("dkseek").addEventListener("input", () => { if (isFinite(A.duration)) A.currentTime = (A.duration * +$("dkseek").value) / 1000; });
$("dkrate").addEventListener("click", () => { S.rate = RATES[(RATES.indexOf(S.rate) + 1) % RATES.length]; A.playbackRate = S.rate; LS.set("rate", S.rate); $("dkrate").textContent = S.rate + "×"; });
$("dkclose").addEventListener("click", stopAudio);
function session() { if (!("mediaSession" in navigator) || !window.MediaMetadata) return; const t = S.q2[S.qi], m = S.cur || {}; try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title || m.title || "", artist: S.live ? "Live radio" : m.creator || "", album: m.title || "", artwork: https(m.thumb) ? [{ src: m.thumb }] : [] });
  for (const [a, f] of [["play", () => A.play()], ["pause", () => A.pause()], ["previoustrack", () => S.qi > 0 && loadTrack(S.qi - 1, false)], ["nexttrack", () => S.qi < S.q2.length - 1 && loadTrack(S.qi + 1, false)], ["seekbackward", () => (A.currentTime = Math.max(0, A.currentTime - 15))], ["seekforward", () => (A.currentTime += 30)]]) navigator.mediaSession.setActionHandler(a, f); } catch (e) {} }

// ── an item ──
const dlg = $("dlg");
let video = null;
function stopVideo() { if (video) { try { video.pause(); } catch (e) {} video = null; } }
function closeItem() { stopVideo(); if (dlg.open) dlg.close(); }
dlg.addEventListener("close", () => { document.body.append($("deck")); $("deck").classList.remove("in-dlg"); stopVideo(); stopFrames(); $("dbody").replaceChildren(); S.openId = ""; if (/(^#|&)i=/.test(location.hash)) syncUrl(true); });
$("dclose").addEventListener("click", closeItem); dlg.addEventListener("click", (e) => { if (e.target === dlg) closeItem(); });
const RESOLVABLE = /^(archive|tvmaze|nasa|podcasts|loc)\|/;
async function openItem(it, back) {
  const tok = ++S.tok2; S.openId = RESOLVABLE.test(it.id) ? it.id : ""; stopVideo(); $("dtitle").textContent = it.title || "…"; $("dbody").replaceChildren(el("div", { class: "spin", text: "Loading…" })); if (!dlg.open) dlg.showModal(); dlg.append($("deck")); $("deck").classList.add("in-dlg"); // the player rides inside the window, above its backdrop
  if (S.openId) syncUrl(true);
  let d = { item: it, play: it.play || null };
  if (!it.play || it.type === "tv" && it.source === "tvmaze") { try { d = await api("/item?id=" + encodeURIComponent(it.id)); } catch (e) { if (tok !== S.tok2) return; if (!it.play) { $("dbody").replaceChildren(el("div", { class: "note", text: "This one couldn't be opened right now (" + e.message + ")." }), it.page ? el("p", {}, el("a", { href: https(it.page), target: "_blank", rel: "noopener noreferrer", text: "Open it on its own site →" })) : null); return; } } }
  if (tok !== S.tok2) return; renderItem({ ...it, ...(d.item || {}), thumb: (d.item && d.item.thumb) || it.thumb }, d, back);
}
// a show that lives on someone else's player is shown in that player, in a frame that can run it and nothing more
function frame(url, m, height) { return el("iframe", { src: url, title: m.title, ...(height ? { height: String(height) } : {}), allow: "autoplay; fullscreen; picture-in-picture; encrypted-media", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin", sandbox: "allow-scripts allow-same-origin allow-popups allow-presentation" }); }
function stopFrames() { dlg.querySelectorAll("iframe").forEach((f) => f.remove()); }
function renderItem(m, d, back) {
  $("dtitle").textContent = m.title; const body = $("dbody"), p = d.play || { kind: "none" }, parts = [], chips = [LABEL[m.type], scoreOf(m.rating) ? scoreOf(m.rating) + (m.rating.rt != null && m.rating.imdb != null ? " · IMDb " + m.rating.imdb : "") : "", m.creator, m.year, m.meta && m.meta !== m.creator ? m.meta : "", d.status].filter(Boolean);
  const heart = el("button", { class: "btn sm", type: "button", text: isSaved(m) ? "♥ Saved" : "♡ Save" }); heart.addEventListener("click", () => { toggleSave(m); heart.textContent = isSaved(m) ? "♥ Saved" : "♡ Save"; if (S.type === "saved") showSaved(); });
  const acts = el("div", { class: "acts" }); const info = el("div", {}, el("div", { class: "chips" }, chips.map((c) => el("span", { text: c }))), m.description ? el("p", { class: "desc", text: m.description }) : null);
  if (back) parts.push(el("button", { class: "btn sm back", type: "button", text: "← Back to " + back.m.title, onclick: () => { stopVideo(); stopFrames(); renderItem(back.m, back.d); } }));
  if (p.kind === "video" && https(p.url)) {
    const v = el("video", { controls: true, playsinline: true, preload: "metadata", poster: https(m.thumb) || false }); v.src = p.url; for (const s of (p.subtitles || []).filter((s) => https(s.url))) v.append(el("track", { kind: "subtitles", label: s.label || "Subtitles", srclang: "en", src: s.url })); video = v; stopAudio();
    const key = posKey(p.url), saved = LS.get(key, 0); if (saved > 5) v.addEventListener("loadedmetadata", () => { if (v.duration - saved > 10) v.currentTime = saved; }, { once: true });
    let t0 = 0; v.addEventListener("timeupdate", () => { if (Date.now() - t0 > 5000) { t0 = Date.now(); LS.set(key, Math.floor(v.currentTime)); } }); v.addEventListener("play", () => { pushRecent(m); if (!A.paused) A.pause(); });
    const stage = el("div", { class: "stage" }, v); parts.push(stage);
    if (https(p.embed)) { // the host's own player, for when the file won't play here (or when you'd rather)
      const swap = () => { stopVideo(); stage.replaceChildren(frame(p.embed, m, 0)); swap.b.remove(); pushRecent(m); }; swap.b = el("button", { class: "btn sm", type: "button", text: "Use the Archive's own player", onclick: swap }); acts.append(swap.b); v.addEventListener("error", (e) => { if (e.target === v && stage.contains(v)) { toast("That file wouldn't play here. Trying the Archive's own player."); swap(); } }, true);
    }
    if (p.tracks && p.tracks.length > 1) parts.push(el("ul", { class: "tracks" }, p.tracks.map((t) => el("li", { onclick: () => { v.src = t.url; v.play().catch(() => {}); } }, el("b", { text: t.title }), el("small", { text: t.duration ? fmt(t.duration) : "" })))));
  } else if (p.kind === "embed" && https(p.url)) {
    stopAudio(); parts.push(el("div", { class: "stage" + (p.height ? " widget" : "") }, frame(p.url, m, p.height))); pushRecent(m);
    const host = S.names[m.source] || m.source;
    parts.push(el("p", { class: "lic", text: m.source === "peertube" ? "Played from an open PeerTube server, which isn't curated by MentiPlayer. Its own page has the details." : "Shown through " + host + ", in its own player, the way its owner allows. Nothing is copied: it stays with its owner." }));
  } else if (p.kind === "audio" || p.kind === "live") {
    const tracks = p.tracks && p.tracks.length ? p.tracks : [{ title: m.title, url: p.url, duration: undefined }], live = p.kind === "live";
    const play = el("button", { class: "btn pri", type: "button", text: live ? "▶ Listen live" : tracks.length > 1 ? "▶ Play from the start" : "▶ Play" }); play.addEventListener("click", () => playTracks(tracks, 0, m, live)); acts.append(play);
    parts.push(el("div", { class: "cover" }, pic(m.thumb, m.type), info)); info.append(acts);
    if (tracks.length > 1) { const ul = el("ul", { class: "tracks audio", role: "list" }, tracks.map((t, i) => el("li", { onclick: () => playTracks(tracks, i, m, false) }, el("span", { text: String(i + 1).padStart(2, "0") }), el("b", { text: t.title }), el("small", { text: t.duration ? fmt(t.duration) : "" })))); parts.push(ul); if (S.cur && S.cur.id === m.id) deckUi(); }
    if (S.cur && S.cur.id === m.id) { /* already playing: the deck shows it */ } else if (!d.noauto && !(m.type === "podcast" || m.type === "audiobook") && tracks.length === 1) playTracks(tracks, 0, m, live);
  } else {
    parts.push(el("div", { class: "note", text: p.note || "There's nothing to play here." }));
  }
  if (p.kind !== "audio" && p.kind !== "live") { parts.push(info); }
  acts.append(heart); if (m.page) acts.append(el("a", { class: "btn sm", href: https(m.page), target: "_blank", rel: "noopener noreferrer", text: "Open on its site ↗" }));
  const share = el("button", { class: "btn sm", type: "button", text: "Share" }); share.addEventListener("click", async () => { const u = RESOLVABLE.test(m.id) ? location.origin + location.pathname + "#i=" + encodeURIComponent(m.id) : https(m.page) || location.href; try { if (navigator.share) await navigator.share({ title: m.title, url: u }); else { await navigator.clipboard.writeText(u); toast("Link copied"); } } catch (e) {} }); acts.append(share);
  if (p.kind !== "audio" && p.kind !== "live") info.append(acts);
  if (d.watch && d.watch.length) parts.push(el("h3", { text: "Watch free" }), el("div", { class: "watch" }, d.watch.map((w) => card(w, (x) => openItem(x, { m, d })))));
  if (d.episodes && d.episodes.length) parts.push(el("h3", { text: "Latest episodes" }), el("ul", { class: "eps" }, d.episodes.map((e) => el("li", {}, el("b", { text: (e.season ? "S" + e.season + "E" + e.number + " · " : "") + e.title }), " ", el("small", { text: e.date || "" })))));
  if (d.cast && d.cast.length) parts.push(el("h3", { text: "Cast" }), el("div", { class: "cast" }, d.cast.map((c) => el("figure", {}, pic(c.photo, "tv"), el("b", { text: c.name }), c.as ? "as " + c.as : ""))));
  if (d.links && d.links.length) parts.push(el("p", { class: "links" }, d.links.filter((l) => https(l.url)).map((l) => el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label + " ↗" }))));
  parts.push(el("p", { class: "lic", text: [m.license, "Source: " + (S.names[m.source] || m.source)].filter(Boolean).join(" · ") }));
  body.replaceChildren(...parts); if (p.kind === "audio" || p.kind === "live") deckUi();
}

// ── sources ──
const srcdlg = $("srcdlg"); let srcs = [];
async function openSources() {
  srcdlg.showModal(); const ul = $("srclist"); ul.replaceChildren(el("li", { text: "Loading…" }));
  try { srcs = (await api("/sources")).sources; } catch (e) { ul.replaceChildren(el("li", { text: "Couldn't load the list: " + e.message })); return; }
  const on = S.src || srcs.filter((s) => s.on && s.ready !== false).map((s) => s.id), locked = (s) => s.ready === false || (S.safe && !s.safe);
  ul.replaceChildren(...srcs.map((s) => { const cb = el("input", { type: "checkbox", id: "src-" + s.id, "data-id": s.id, disabled: locked(s) }); cb.checked = !locked(s) && on.includes(s.id); const l = s.last; return el("li", {}, cb, el("label", { for: "src-" + s.id }, s.name, el("span", { class: "dot " + (l ? (l.ok ? "ok" : "bad") : ""), title: l ? (l.ok ? "answered " + (l.n != null ? l.n + " items" : "fine") : "last try failed: " + (l.error || "")) : "not tried yet" })), el("small", { text: s.note + (s.ready === false ? " (Not set up on this site yet.)" : S.safe && !s.safe ? " (Off while Safe mode is on: anyone can upload here.)" : "") })); }));
}
function safeUi() { const b = $("safebtn"); b.textContent = S.safe ? "Safe mode: on" : "Safe mode: off"; b.setAttribute("aria-pressed", String(S.safe)); b.classList.toggle("on", S.safe); document.body.classList.toggle("unsafe", !S.safe); }
$("safebtn").addEventListener("click", () => { if (S.safe && !confirm("Turn Safe mode off?\n\nResults may then include things you would not want others to see over your shoulder.")) return; S.safe = !S.safe; LS.set("safe", S.safe); safeUi(); if (dlg.open) closeItem(); toast(S.safe ? "Safe mode is on" : "Safe mode is off"); go(true); });
safeUi();
$("srcbtn").addEventListener("click", openSources); $("srcclose").addEventListener("click", () => srcdlg.close());
$("srcall").addEventListener("click", () => { srcdlg.querySelectorAll("input[data-id]:not(:disabled)").forEach((c) => (c.checked = true)); toast("Everything that is set up is on: press Done"); });
$("srcreset").addEventListener("click", () => { S.src = null; LS.set("src", null); srcdlg.close(); toast("Back to the defaults"); go(true); });
$("srcsave").addEventListener("click", () => { const ids = [...srcdlg.querySelectorAll("input[data-id]")].filter((c) => c.checked).map((c) => c.dataset.id), def = srcs.filter((s) => s.on && s.ready !== false && (!S.safe || s.safe)).map((s) => s.id);
  if (!ids.length) return toast("Keep at least one source on"); S.src = ids.slice().sort().join() === def.slice().sort().join() ? null : ids; LS.set("src", S.src); srcdlg.close(); go(true); });

// ── start-up, shortcuts, links ──
document.addEventListener("keydown", (e) => { const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"); if (e.key === "/" && !typing) { e.preventDefault(); $("q").focus(); } else if (e.key === " " && !typing && t.tagName !== "BUTTON" && t.tagName !== "VIDEO" && S.q2.length) { e.preventDefault(); A.paused ? A.play().catch(() => {}) : A.pause(); } });
async function fromHash() {
  const h = new URLSearchParams(location.hash.slice(1)); S.q = h.get("q") || ""; S.type = ["movie", "tv", "music", "radio", "audiobook", "podcast", "video", "live", "saved"].includes(h.get("t")) ? h.get("t") : ""; $("q").value = S.q;
  [...$("tabs").children].forEach((x) => x.classList.toggle("on", x.dataset.t === S.type)); const id = h.get("i");
  if (id && RESOLVABLE.test(id)) { const [source, type] = id.split("|"); openItem({ id, source, type, title: "…" }); }
  go(true);
}
api("/sources").then((j) => { for (const s of j.sources) S.names[s.id] = s.name; }).catch(() => {});
addEventListener("popstate", () => { if (!/(^#|&)i=/.test(location.hash) && dlg.open) { dlg.close(); return; } fromHash(); }); // the browser's back button
fromHash();
})();
