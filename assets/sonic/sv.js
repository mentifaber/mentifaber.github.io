/* Sonic Veil · the player. SoundCloud's own player does the streaming (it's the catalogue's home); this page drives it
   through the Widget API and draws the veil, which swells while something is playing. With no connection to SoundCloud
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
  W.bind(E.READY, () => { $("npl").textContent = "ready"; W.getSounds((ss) => { if (src === "all") list(ss.map((s) => ({ n: s.title || "…", note: s.duration ? fmt(s.duration) : "" }))); }); W.getCurrentSound(setNow); });
  W.bind(E.PLAY, () => { playing = true; $("play").textContent = "❚❚"; $("npl").textContent = "now playing"; W.getCurrentSound(setNow); W.getCurrentSoundIndex((i) => document.querySelectorAll("#list li").forEach((li) => li.classList.toggle("on", +li.dataset.i === i))); });
  W.bind(E.PAUSE, () => { playing = false; $("play").textContent = "▶"; $("npl").textContent = "paused"; });
  W.bind(E.FINISH, () => { playing = false; $("play").textContent = "▶"; });
  W.bind(E.PLAY_PROGRESS, (e) => { $("t0").textContent = fmt(e.currentPosition); $("fill").style.width = (e.relativePosition * 100).toFixed(2) + "%"; });
}
$("play").addEventListener("click", () => W && W.toggle());
$("next").addEventListener("click", () => W && W.next());
$("prev").addEventListener("click", () => W && W.prev());
$("bar").addEventListener("click", (e) => { if (!W || !dur) return; const r = e.currentTarget.getBoundingClientRect(); W.seekTo(((e.clientX - r.left) / r.width) * dur); });
$("list").addEventListener("click", (e) => { const li = e.target.closest("li"); if (!li || !W) return; const i = +li.dataset.i;
  if (src === "all") { W.skip(i); W.play(); } else W.load(PICKS[i].u, { auto_play: true, show_comments: false, color: "#c8a96e", hide_related: true }); });
document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; src = b.dataset.src; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  if (src === "picks") list(PICKS); else if (W) { W.load("https://soundcloud.com/sonicveil", { show_comments: false, color: "#c8a96e", hide_related: true }); } });
list(PICKS); // until the widget reports the full catalogue
if (document.readyState === "complete") wire(); else addEventListener("load", wire);
})();
