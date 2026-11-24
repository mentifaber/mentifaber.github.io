/* Unlit · the map. Twenty-eight entries, tiered by cost rather than coverage; filter by tier, region or whether a
   ceasefire exists on paper (the badges say which: the agreement and the ground are different objects). */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const D = window.CA_DATA.map((x, i) => ({ ...x, i }));
const TIER = { "major war": ["Major war", "var(--major)", "#d9543f", 11], significant: ["Significant", "var(--sig)", "#e0883c", 8], active: ["Active", "var(--act)", "#cbb04a", 6] };
const S = { tiers: new Set(Object.keys(TIER)), region: null, q: "", cf: false, sel: null };
$("counts").innerHTML = Object.entries(TIER).map(([k, v]) => '<span><b style="color:' + v[1] + '">' + D.filter((x) => x.tier === k).length + "</b> " + v[0].toLowerCase() + "</span>").join("") + "<span><b>" + D.length + "</b> tracked</span>";
$("tiers").innerHTML = Object.entries(TIER).map(([k, v]) => '<button class="on" data-tier="' + k + '" style="color:' + v[1] + '">' + v[0] + "</button>").join("");
const regions = [...new Set(D.map((x) => x.region))].sort();
$("regions").innerHTML = '<button class="on" data-region="">All regions</button>' + regions.map((r) => '<button data-region="' + esc(r) + '">' + esc(r) + "</button>").join("");

// ── the map: drawn from the site's own world data (assets/maps), so it needs no tile service or key ──
let map = null; const marks = [];
try {
  map = L.map("map", { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 30], 2);
  map.setMaxZoom(10); FaberMap.base(map, { labels: true }).catch(() => { $("nomap").hidden = false; });
  D.forEach((x) => { const t = TIER[x.tier]; const m = L.circleMarker([x.lat, x.lon], { radius: t[3], color: t[2], weight: 2, fillColor: t[2], fillOpacity: /ceasefire/.test(x.status) ? 0.18 : 0.55, dashArray: /ceasefire/.test(x.status) ? "3 4" : null }).addTo(map); m.bindTooltip(x.t, { direction: "top" }); m.on("click", () => pick(x.i)); marks[x.i] = m; });
} catch (e) { $("nomap").hidden = false; }

const shown = () => D.filter((x) => S.tiers.has(x.tier) && (!S.region || x.region === S.region) && (!S.cf || /ceasefire/.test(x.status)) && (!S.q || (x.t + " " + x.region + " " + x.p + " " + x.status).toLowerCase().includes(S.q)));
function draw() {
  const xs = shown(), ids = new Set(xs.map((x) => x.i));
  $("list").innerHTML = xs.map((x) => '<li data-i="' + x.i + '" class="' + (S.sel === x.i ? "on" : "") + '"><i style="background:' + TIER[x.tier][1] + '"></i><b>' + esc(x.t) + "</b><small>" + esc(x.region + " · " + x.status) + "</small></li>").join("") || '<li style="cursor:default;color:var(--mute)">Nothing matches.</li>';
  marks.forEach((m, i) => { if (!m) return; if (ids.has(i)) m.addTo(map); else m.remove(); });
}
function pick(i) {
  const x = D[i]; S.sel = i; const t = TIER[x.tier];
  $("detail").hidden = false; $("detail").innerHTML = '<button aria-label="Close" id="dx">✕</button><div class="meta" style="color:' + t[1] + '">' + esc(t[0] + " · " + x.region + " · " + x.status) + "</div><h2>" + esc(x.t) + "</h2><p>" + esc(x.p) + "</p>" + // where each summary comes from: the reader can check it
    (x.src && x.src.length ? '<div class="src">Sources: ' + x.src.map((s) => /^https:\/\//.test(s.u) ? '<a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.n) + "</a>" : esc(s.n)).join(" · ") + "</div>" : "");
  $("dx").onclick = () => { $("detail").hidden = true; S.sel = null; draw(); };
  if (map) map.flyTo([x.lat, x.lon], Math.max(map.getZoom(), 4), { duration: 0.8 });
  draw(); const li = document.querySelector('#list li[data-i="' + i + '"]'); if (li) li.scrollIntoView({ block: "nearest" });
}
$("tiers").addEventListener("click", (e) => { const b = e.target.closest("[data-tier]"); if (!b) return; const k = b.dataset.tier; if (S.tiers.has(k) && S.tiers.size > 1) S.tiers.delete(k); else S.tiers.add(k); b.classList.toggle("on", S.tiers.has(k)); draw(); });
$("regions").addEventListener("click", (e) => { const b = e.target.closest("[data-region]"); if (!b) return; S.region = b.dataset.region || null; document.querySelectorAll("#regions button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
$("ceasefire").addEventListener("change", (e) => { S.cf = e.target.checked; draw(); });
$("q").addEventListener("input", (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); });

// ── Coverage gap: how much of the world's news about violence each conflict gets, against how costly it is. The news
//    side is AutoFaber's GDELT record (mentions of violent events located in each country, per day, over the last week,
//    /api/hive/world/coverage); the cost side is Unlit's own tiers. A conflict with a far smaller share of the coverage
//    than of the cost is under-covered. Countries a conflict is counted by are shown on each row ──
const GDELT = { // title start → the GDELT country names it's counted by (case-insensitive patterns)
  "U.S. / Israel – Iran": [/^iran$/], "Russia – Ukraine": [/^ukraine$/], "Sudan Civil": [/^sudan$/], "Myanmar": [/^(myanmar|burma)$/],
  "DR Congo": [/congo.*(democratic|kinshasa)|democratic.*congo|^zaire$/], "Sahel": [/^mali$/, /^burkina faso$/, /^niger$/], "Israel – Lebanon": [/^lebanon$/],
  "Israel – Gaza": [/^gaza( strip)?$/, /^palestin/], "Yemen": [/^yemen$/], "Somalia": [/^somalia$/], "India – Pakistan": [/^india$/], "Afghanistan – Pakistan": [/^afghanistan$/, /^pakistan$/],
  "Nigeria": [/^nigeria$/], "Haiti": [/^haiti$/], "Syria / Iraq": [/^syria$/, /^iraq$/], "Iran — Internal": [/^iran$/], "Mexico": [/^mexico$/], "Cameroon": [/^cameroon$/],
  "Ethiopia – Eritrea": [/^ethiopia$/, /^eritrea$/], "South Sudan": [/^south sudan$/], "Mozambique": [/^mozambique$/], "Libya": [/^libya$/], "West Bank": [/^west bank$/],
  "South China Sea": [/spratly|paracel|south china sea/], "Bangladesh": [/^bangladesh$/], "Ecuador": [/^ecuador$/], "Brazil": [/^brazil$/], "Strait of Hormuz": [/^oman$/, /hormuz/],
};
const WEIGHT = { "major war": 9, significant: 3, active: 1 }; // cost, roughly: each tier is about three times the one below
let gapOn = false, gapData = null;
async function gap() {
  const el = $("gap"); el.innerHTML = "<p>Reading the week's world news…</p>";
  if (!gapData) { try { const r = await fetch("/api/hive/world/coverage"); gapData = r.ok ? await r.json() : null; } catch (e) {} }
  if (!gapData || gapData.empty || !Array.isArray(gapData.cov)) { el.innerHTML = "<p>AutoFaber's world record isn't answering right now, or hasn't a week on file yet. Try again later.</p>"; gapData = null; return; }
  const rows = D.map((x) => { const pats = Object.entries(GDELT).find(([k]) => x.t.startsWith(k)); const hit = pats ? gapData.cov.filter(([name]) => pats[1].some((p) => p.test(name.toLowerCase()))) : [];
    return { x, names: hit.map((h) => h[0]), m: hit.reduce((s, h) => s + h[1], 0), w: WEIGHT[x.tier] || 1 }; });
  const M = rows.reduce((s, r) => s + r.m, 0) || 1, W = rows.reduce((s, r) => s + r.w, 0);
  rows.forEach((r) => { r.share = r.m / M; r.cost = r.w / W; r.ratio = r.m ? r.cost / r.share : Infinity; });
  rows.sort((a, b) => (a.m ? 0 : 1) - (b.m ? 0 : 1) || b.ratio - a.ratio || b.w - a.w); // nothing in the record (a quiet week, or a name the record spells differently) goes last, not first const top = Math.max(...rows.map((r) => r.m)) || 1;
  const say = (r) => (r.ratio === Infinity ? "not in the record" : r.ratio >= 1.5 ? (r.ratio >= 10 ? Math.round(r.ratio) : r.ratio.toFixed(1)) + "× under-covered" : r.ratio <= 0.67 ? (1 / r.ratio).toFixed(1) + "× over-covered" : "in proportion");
  el.innerHTML = "<p>News mentions of violence, per day over the last " + esc(Math.round(gapData.days || 7)) + " days, against each conflict's cost tier. Most under-covered first.</p><ol>" +
    rows.map((r) => '<li data-i="' + r.x.i + '"><b>' + esc(r.x.t) + '</b><span class="ratio ' + (r.ratio === Infinity ? "over" : r.ratio >= 1.5 ? "under" : r.ratio <= 0.67 ? "over" : "") + '">' + esc(say(r)) + '</span><span class="bar"><i style="width:' + Math.max(1, Math.round(r.m / top * 100)) + "%;background:" + TIER[r.x.tier][2] + '"></i></span><small>' +
      esc(TIER[r.x.tier][0] + " · " + Math.round(r.m).toLocaleString() + " mentions a day · " + (r.share * 100).toFixed(1) + "% of the coverage, " + (r.cost * 100).toFixed(1) + "% of the cost" + (r.names.length ? " · counted as " + r.names.join(", ") : "")) + "</small></li>").join("") +
    "</ol><p>How it's worked out: a conflict's share of the cost is its tier's weight (major war 9, significant 3, active 1) out of all 28; its share of the coverage is its countries' mentions out of all 28 conflicts'. Countries shared by two entries (Iran) count for both. The record is GDELT's, read every 15 minutes by AutoFaber.</p>";
}
$("gapbtn").addEventListener("click", () => { gapOn = !gapOn; $("gapbtn").setAttribute("aria-pressed", String(gapOn)); $("gap").hidden = !gapOn; $("list").hidden = gapOn; ["tiers", "regions"].forEach((id) => ($(id).hidden = gapOn)); document.querySelector(".cf").hidden = gapOn; if (gapOn) gap(); });
$("gap").addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) pick(+li.dataset.i); });
// Faber Verbs: AutoFaber can open one of the conflicts (read only)
if (window.Faber) Faber.verbs({
  show: ({ query }) => { const ws = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^(war|the|and|conflict|civil)$/.test(w));
    const sc = (x) => ws.reduce((k, w) => k + ((x.t + " " + x.region + " " + x.p).toLowerCase().includes(w) ? (x.t.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
    const best = D.map((x) => [x, sc(x)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])[0];
    if (!best) return "None of the " + D.length + " conflicts tracked here matches " + query + ".";
    const x = best[0]; pick(x.i); return x.t + ": " + TIER[x.tier][0].toLowerCase() + ", " + x.status + "."; },
});
$("list").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) pick(+li.dataset.i); });
draw();
window.ConflictAtlas = { D, pick };
})();
