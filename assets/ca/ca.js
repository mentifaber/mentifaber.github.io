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

// ── the map (tiles need a connection; the list doesn't) ──
let map = null; const marks = [];
try {
  map = L.map("map", { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 30], 2);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 8, attribution: "© OpenStreetMap, © CARTO" }).addTo(map);
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
  $("detail").hidden = false; $("detail").innerHTML = '<button aria-label="Close" id="dx">✕</button><div class="meta" style="color:' + t[1] + '">' + esc(t[0] + " · " + x.region + " · " + x.status) + "</div><h2>" + esc(x.t) + "</h2><p>" + esc(x.p) + "</p>";
  $("dx").onclick = () => { $("detail").hidden = true; S.sel = null; draw(); };
  if (map) map.flyTo([x.lat, x.lon], Math.max(map.getZoom(), 4), { duration: 0.8 });
  draw(); const li = document.querySelector('#list li[data-i="' + i + '"]'); if (li) li.scrollIntoView({ block: "nearest" });
}
$("tiers").addEventListener("click", (e) => { const b = e.target.closest("[data-tier]"); if (!b) return; const k = b.dataset.tier; if (S.tiers.has(k) && S.tiers.size > 1) S.tiers.delete(k); else S.tiers.add(k); b.classList.toggle("on", S.tiers.has(k)); draw(); });
$("regions").addEventListener("click", (e) => { const b = e.target.closest("[data-region]"); if (!b) return; S.region = b.dataset.region || null; document.querySelectorAll("#regions button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
$("ceasefire").addEventListener("change", (e) => { S.cf = e.target.checked; draw(); });
$("q").addEventListener("input", (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); });
$("list").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) pick(+li.dataset.i); });
draw();
window.ConflictAtlas = { D, pick };
})();
