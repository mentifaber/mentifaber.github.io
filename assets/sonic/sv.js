/* Sonic Veil · the player. SoundCloud's own player does the streaming (it's the catalogue's home); this page drives it
   through the Widget API and draws the veil, which swells while something is playing. Shuffle and repeat, volume, the
   lock screen's controls (Media Session), keys, sharing a track, and the last track you played are this page's own. With no connection to SoundCloud
   the page still shows the catalogue and links out. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const PICKS = [ // tracks the write-up names, with their own pages
  { n: "Spirits", u: "https://soundcloud.com/sonicveil/spirits", note: "folk · 2023" }, { n: "Echo Park", u: "https://soundcloud.com/sonicveil/echo-park", note: "" },
  { n: "EARTHQUAKE (Instrumental)", u: "https://soundcloud.com/sonicveil/earthquake-instrumental", note: "" }, { n: "Ambiatic", u: "https://soundcloud.com/sonicveil/ambiatic", note: "" }, { n: "Titan Opium", u: "https://soundcloud.com/sonicveil/titan-opium", note: "" },
];
const RECENT = [["2026-05-16", "Stride"], ["2026-04-05", "Love Is (S)pain"], ["2026-03-16", "Deep Learning"], ["2026-03-15", "Reflections"], ["2026-03-14", "Imagined It"], ["2026-02-05", "Mesh"], ["2026-01-27", "Reflection — Instrumental"], ["2026-01-27", "Algorithm"], ["2026-01-26", "Sweetest"], ["2026-01-26", "Fears To Flee"]];
$("recent").innerHTML = RECENT.map(([d, n]) => "<li>" + esc(n) + "<span>" + new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + "</span></li>").join("");

// ── the veil ──
const cv = $("veil"), cx = cv.getContext("2d"); let t = 0, amp = 0, target = 0, playing = false; const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function size() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; }
new ResizeObserver(size).observe(cv); size();
(function draw() {
  t += reduce ? 0 : 0.012; target = playing ? 0.75 + Math.sin(t * 3.1) * 0.15 : target * 0.95; amp += (target - amp) * 0.06;
  const W = cv.width, H = cv.height; cx.clearRect(0, 0, W, H);
  for (let layer = 0; layer < 3; layer++) {
    const g = cx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "rgba(60,85,102,.06)"); g.addColorStop(0.5, layer ? "rgba(60,85,102,.5)" : "#c8a96e"); g.addColorStop(1, "rgba(60,85,102,.06)");
    cx.strokeStyle = g; cx.lineWidth = (layer ? 1.2 : 2.2) * (devicePixelRatio || 1); cx.beginPath();
    for (let x = 0; x <= W; x += 3) { const u = x / W; let y = 0; for (let k = 1; k <= 6; k++) y += Math.pow(k, -1.5 - amp * 0.4) * Math.sin(u * (k * 3.2) * Math.PI * 2 + t * (0.4 + k * 0.05) + layer * 1.7); const env = Math.sin(u * Math.PI) ** 0.5; const py = H * 0.38 + y * env * H * 0.2 * (1 + amp * 0.9) + layer * H * 0.03; x ? cx.lineTo(x, py) : cx.moveTo(x, py); }
    cx.stroke();
  }
  requestAnimationFrame(draw);
})();

// ── the player ──
let W = null, dur = 0, src = "all";
function list(items) { $("list").innerHTML = items.map((x, i) => '<li data-i="' + i + '"><small>' + String(i + 1).padStart(2, "0") + "</small><b>" + esc(x.n) + "</b><small>" + esc(x.note || "") + "</small></li>").join(""); }
function setNow(s) { if (!s) return; $("title").textContent = s.title || "Sonic Veil"; $("sub").textContent = [s.genre, s.created_at ? new Date(s.created_at).getFullYear() : ""].filter(Boolean).join(" · ") || "Sonic Veil"; dur = s.duration || dur; $("t1").textContent = fmt(dur); }
function wire() {
  if (!window.SC || !SC.Widget) { $("npl").textContent = "SoundCloud didn't load · use the link above"; return; }
  W = SC.Widget($("sc")); const E = SC.Widget.Events;
  W.bind(E.READY, () => {
    $("npl").textContent = "ready"; W.setVolume(+$("vol").value);
    W.getSounds((ss) => { P.sounds = ss || []; if (src === "all") list(P.sounds.map((s) => ({ n: s.title || "…", note: s.duration ? fmt(s.duration) : "" })));
      const last = P.resume && P.sounds.find((x) => x.permalink_url === P.resume); if (last) { $("npl").textContent = "pick up where you left off"; setNow(last); } });
    W.getCurrentSound(setNow);
  });
  W.bind(E.PLAY, () => { playing = true; P.resume = null; $("play").textContent = "❚❚"; $("play").setAttribute("aria-label", "Pause"); $("npl").textContent = "now playing"; if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    W.getCurrentSound((s) => { setNow(s); P.cur = s; session(s); if (s && s.permalink_url) { store("last", s.permalink_url); $("open").href = s.permalink_url; } }); W.getCurrentSoundIndex((i) => document.querySelectorAll("#list li").forEach((li) => li.classList.toggle("on", +li.dataset.i === i))); });
  W.bind(E.PAUSE, () => { playing = false; $("play").textContent = "▶"; $("play").setAttribute("aria-label", "Play"); $("npl").textContent = "paused"; if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; });
  // the end of a track: repeat one, shuffle, wrap round on repeat-all; otherwise the player carries on down the list itself
  W.bind(E.FINISH, () => {
    playing = false; $("play").textContent = "▶";
    if (P.repeat === "one") { W.seekTo(0); W.play(); return; }
    if (src !== "all") return;
    idx((i) => { if (P.shuffle) go(1); else if (P.repeat === "all" && i >= P.sounds.length - 1) playAt(0); });
  });
  W.bind(E.PLAY_PROGRESS, (e) => { $("t0").textContent = fmt(e.currentPosition); $("fill").style.width = (e.relativePosition * 100).toFixed(2) + "%";
    if ("mediaSession" in navigator && dur && navigator.mediaSession.setPositionState) try { navigator.mediaSession.setPositionState({ duration: dur / 1000, position: Math.min(dur, e.currentPosition) / 1000, playbackRate: 1 }); } catch (x) {} });
}
// ── shuffle, repeat, volume, the lock screen, keys, sharing and where you left off ──
const P = { sounds: [], shuffle: false, repeat: "off", cur: null, resume: null };
const store = (k, v) => { try { v === undefined ? localStorage.removeItem("sv:" + k) : localStorage.setItem("sv:" + k, JSON.stringify(v)); } catch (e) {} };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem("sv:" + k)); return v == null ? d : v; } catch (e) { return d; } };
P.shuffle = load("shuffle", false); P.repeat = load("repeat", "off"); P.resume = load("last", null);
function toggles() {
  $("shuf").setAttribute("aria-pressed", P.shuffle); $("rep").setAttribute("aria-pressed", P.repeat !== "off"); $("rep").classList.toggle("one", P.repeat === "one");
  $("rep").title = "Repeat: " + P.repeat + " (R)";
}
function playAt(i) { if (!W || i < 0 || i >= P.sounds.length) return; W.skip(i); W.play(); }
function idx(cb) { W.getCurrentSoundIndex((i) => cb(typeof i === "number" ? i : -1)); }
function go(d) {
  if (!W) return;
  if (src !== "all") return d > 0 ? W.next() : W.prev();
  idx((i) => {
    const n = P.sounds.length; if (!n) return d > 0 ? W.next() : W.prev();
    if (P.shuffle && d > 0) { let j = i; while (n > 1 && j === i) j = Math.floor(Math.random() * n); return playAt(j); }
    playAt(((i + d) % n + n) % n);
  });
}
$("play").addEventListener("click", () => {
  if (!W) return;
  if (P.resume && src === "all") { const j = P.sounds.findIndex((x) => x.permalink_url === P.resume); P.resume = null; if (j > 0) return playAt(j); }
  W.toggle();
});
$("next").addEventListener("click", () => go(1));
$("prev").addEventListener("click", () => go(-1));
$("shuf").addEventListener("click", () => { P.shuffle = !P.shuffle; store("shuffle", P.shuffle); toggles(); });
$("rep").addEventListener("click", () => { P.repeat = { off: "all", all: "one", one: "off" }[P.repeat]; store("repeat", P.repeat); toggles(); });
$("vol").value = load("vol", 80);
$("vol").addEventListener("input", (e) => { if (W) W.setVolume(+e.target.value); store("vol", +e.target.value); });
$("share").addEventListener("click", async () => {
  const s = P.cur, url = (s && s.permalink_url) || "https://soundcloud.com/sonicveil", title = s ? s.title + " · Sonic Veil" : "Sonic Veil";
  try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); $("share").textContent = "Link copied"; setTimeout(() => ($("share").textContent = "Share"), 1600); } } catch (e) {}
});
function session(s) {
  if (!("mediaSession" in navigator) || !s) return;
  const art = s.artwork_url ? s.artwork_url.replace("-large", "-t500x500") : location.origin + "/assets/icons/v2/sonicveil-512.png";
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: s.title || "Sonic Veil", artist: "Sonic Veil", album: s.genre || "", artwork: [{ src: art, sizes: "500x500", type: "image/jpeg" }] }); } catch (e) {}
}
if ("mediaSession" in navigator) {
  const on = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} };
  on("play", () => W && W.play()); on("pause", () => W && W.pause()); on("nexttrack", () => go(1)); on("previoustrack", () => go(-1));
  on("seekto", (d) => W && W.seekTo(d.seekTime * 1000));
}
addEventListener("keydown", (e) => {
  if (!W || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== "range") return;
  const k = e.key;
  if (k === " ") { e.preventDefault(); $("play").click(); }
  else if (k === "ArrowRight") go(1); else if (k === "ArrowLeft") go(-1);
  else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); const v = Math.max(0, Math.min(100, +$("vol").value + (k === "ArrowUp" ? 10 : -10))); $("vol").value = v; W.setVolume(v); store("vol", v); }
  else if (k === "s" || k === "S") $("shuf").click(); else if (k === "r" || k === "R") $("rep").click();
});
// a recent release: play it if it's in the catalogue the player has, else find it on SoundCloud
$("recent").addEventListener("click", (e) => {
  const li = e.target.closest("li"); if (!li) return; const name = li.firstChild.textContent.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const j = P.sounds.findIndex((x) => (x.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "").startsWith(name));
  if (j >= 0 && src === "all") return playAt(j);
  open("https://soundcloud.com/search/sounds?q=" + encodeURIComponent("Sonic Veil " + li.firstChild.textContent), "_blank", "noopener");
});
toggles();
$("bar").addEventListener("click", (e) => { if (!W || !dur) return; const r = e.currentTarget.getBoundingClientRect(); W.seekTo(((e.clientX - r.left) / r.width) * dur); });
$("list").addEventListener("click", (e) => { const li = e.target.closest("li"); if (!li || !W) return; const i = +li.dataset.i;
  if (src === "all") { W.skip(i); W.play(); } else W.load(PICKS[i].u, { auto_play: true, show_comments: false, color: "#c8a96e", hide_related: true }); });
document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; src = b.dataset.src; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  if (src === "picks") list(PICKS); else if (W) { W.load("https://soundcloud.com/sonicveil", { show_comments: false, color: "#c8a96e", hide_related: true }); } });
list(PICKS); // until the widget reports the full catalogue
if (document.readyState === "complete") wire(); else addEventListener("load", wire);
})();
