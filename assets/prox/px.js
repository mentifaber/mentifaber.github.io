/* Bodywake · simulator. A fixed scanner (a laptop on a desk) watches five access points. A body is mostly water and
   water absorbs 2.4 and 5 GHz, so a person on or near the line between an access point and the scanner knocks that
   signal down a dB or three, and a different access point each time depending on where they stand. Calibrate the
   empty house (mean and spread per access point), then every scan becomes a z-score; past 2.5σ the house is occupied,
   and the pattern of which access points moved, matched against each room's signature, says which room. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const ROOMS = [{ n: "kitchen", x: 0.03, y: 0.06, w: 0.3, h: 0.4 }, { n: "living", x: 0.35, y: 0.06, w: 0.4, h: 0.55 }, { n: "hall", x: 0.03, y: 0.5, w: 0.3, h: 0.44 }, { n: "bedroom", x: 0.35, y: 0.64, w: 0.4, h: 0.3 }, { n: "garage", x: 0.77, y: 0.06, w: 0.2, h: 0.88 }];
const APS = [{ n: "router 2G", x: 0.4, y: 0.14, base: -42 }, { n: "router 5G", x: 0.42, y: 0.18, base: -49 }, { n: "nbr-A", x: 0.94, y: 0.3, base: -67 }, { n: "nbr-B", x: 0.06, y: 0.86, base: -71 }, { n: "ext-1", x: 0.72, y: 0.78, base: -58 }];
const SCAN = { x: 0.18, y: 0.28 }; // the laptop: it never moves
const S = { me: { x: 0.55, y: 0.35 }, home: true, auto: true, base: null, cal: false, path: [], last: null, sig: null, wander: { x: 0.55, y: 0.35 } };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const roomAt = (p) => ROOMS.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }
// each room bends the field its own way: reflections off its walls change every access point a little, in a pattern that
// belongs to that room (seeded, so it's the same house every time). That pattern is what calibration learns.
const ROOM_FX = (() => { let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); return ROOMS.map(() => { const v = APS.map(() => (rnd() * 2 - 1) * 2.4); const m = Math.max(...v.map(Math.abs)); return m < 2.2 ? v.map((x) => (x * 2.2) / m) : v; }); })();
function scan(person) { // one RSSI reading per access point, in dBm
  const ri = person ? ROOMS.indexOf(roomAt(person)) : -1;
  return APS.map((ap, k) => { let v = ap.base + gauss() * 0.6; if (ri >= 0) v += ROOM_FX[ri][k];
    if (person) { const d = segDist(person, ap, SCAN); v -= 2.6 * Math.exp(-(d * d) / (2 * 0.08 * 0.08)); v -= 1.2 * Math.exp(-((person.x - ap.x) ** 2 + (person.y - ap.y) ** 2) / 0.004); v += 0.6 * Math.sin(person.x * 31 + person.y * 17 + APS.indexOf(ap)) * Math.exp(-d * 6); } // shadow, near-field, a little multipath
    return v; });
}
const zOf = (v) => v.map((x, i) => (x - S.base.mean[i]) / S.base.sd[i]);
async function calibrate() {
  $("cal").disabled = true; $("state").textContent = "calibrating · nobody home"; $("state").className = "pill busy"; $("hint").textContent = "Scanning an empty house for 30 simulated seconds…";
  const runs = []; for (let k = 0; k < 60; k++) { runs.push(scan(null)); if (k % 6 === 0) await new Promise((r) => setTimeout(r, 40)); }
  const mean = APS.map((_, i) => runs.reduce((a, r) => a + r[i], 0) / runs.length), sd = APS.map((_, i) => Math.max(0.35, Math.sqrt(runs.reduce((a, r) => a + (r[i] - mean[i]) ** 2, 0) / runs.length)));
  S.base = { mean, sd };
  // each room's signature: the average z-vector of someone standing around in it
  S.sig = ROOMS.map((r) => { const acc = APS.map(() => 0); for (let k = 0; k < 80; k++) { const p = { x: r.x + r.w * (0.15 + 0.7 * Math.random()), y: r.y + r.h * (0.15 + 0.7 * Math.random()) }; zOf(scan(p)).forEach((z, i) => (acc[i] += z / 80)); } return acc; });
  S.cal = true; S.path = []; $("cal").disabled = false; $("cal").textContent = "Recalibrate"; $("state").textContent = "calibrated · " + APS.length + " BSSIDs"; $("state").className = "pill ok";
  $("hint").textContent = "Now move through the rooms (or let autopilot walk). No camera, no wearable, no app on their phone.";
}
function infer(z) {
  const mag = Math.max(...z.map(Math.abs)); if (mag < 2.5) return null;
  let best = null, bd = Infinity; S.sig.forEach((s, i) => { const d = s.reduce((a, v, k) => a + (v - z[k]) ** 2, 0); if (d < bd) { bd = d; best = ROOMS[i]; } });
  return best;
}

// ── drawing and the loop ──
const cv = $("cv"), cx = cv.getContext("2d"); let W = 0, H = 0, D = 1;
function fit() { const r = cv.getBoundingClientRect(); D = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * D; cv.height = H * D; cx.setTransform(D, 0, 0, D, 0, 0); }
new ResizeObserver(fit).observe(cv); fit();
const P = (p) => [16 + p.x * (W - 32), 16 + p.y * (H - 32)];
let lastZ = null, inferred = null, nextScan = 0;
function draw(t) {
  cx.clearRect(0, 0, W, H);
  ROOMS.forEach((r) => { const [x, y] = P(r), [x2, y2] = P({ x: r.x + r.w, y: r.y + r.h }); cx.fillStyle = inferred === r ? "rgba(255,207,74,.12)" : "rgba(255,255,255,.025)"; cx.fillRect(x, y, x2 - x, y2 - y); cx.strokeStyle = inferred === r ? "rgba(255,207,74,.7)" : "rgba(230,242,232,.18)"; cx.lineWidth = 1.5; cx.strokeRect(x, y, x2 - x, y2 - y); cx.fillStyle = "rgba(230,242,232,.5)"; cx.font = "12px ui-monospace,monospace"; cx.fillText(r.n, x + 8, y + 18); });
  const [sx, sy] = P(SCAN);
  APS.forEach((ap, i) => { const [ax, ay] = P(ap), z = lastZ ? lastZ[i] : 0, trip = Math.abs(z) > 2.5;
    cx.strokeStyle = trip ? "rgba(255,207,74,.55)" : "rgba(125,255,106,.16)"; cx.lineWidth = trip ? 2 : 1; cx.setLineDash([4, 5]); cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(sx, sy); cx.stroke(); cx.setLineDash([]);
    const pulse = (t / 900 + i * 0.3) % 1; cx.strokeStyle = "rgba(125,255,106," + (0.35 * (1 - pulse)) + ")"; cx.beginPath(); cx.arc(ax, ay, 6 + pulse * 26, 0, 7); cx.stroke();
    cx.fillStyle = trip ? "#ffcf4a" : "#7dff6a"; cx.beginPath(); cx.arc(ax, ay, 5, 0, 7); cx.fill(); cx.fillStyle = "rgba(230,242,232,.6)"; cx.font = "11px ui-monospace,monospace"; cx.fillText(ap.n, ax + 8, ay - 8); });
  cx.fillStyle = "#e6f2e8"; cx.fillRect(sx - 9, sy - 6, 18, 12); cx.fillStyle = "rgba(230,242,232,.6)"; cx.fillText("scanner", sx - 22, sy + 22);
  if (S.home) { const [px, py] = P(S.me); cx.fillStyle = "rgba(125,200,255,.18)"; cx.beginPath(); cx.arc(px, py, 18, 0, 7); cx.fill(); cx.fillStyle = "#8fd0ff"; cx.beginPath(); cx.arc(px, py, 7, 0, 7); cx.fill(); }
}
function loop(t) {
  requestAnimationFrame(loop);
  if (S.auto && S.home) { const d = Math.hypot(S.wander.x - S.me.x, S.wander.y - S.me.y); if (d < 0.02) { const r = ROOMS[Math.floor(Math.random() * ROOMS.length)]; S.wander = { x: r.x + r.w * (0.2 + 0.6 * Math.random()), y: r.y + r.h * (0.2 + 0.6 * Math.random()) }; } else { S.me.x += ((S.wander.x - S.me.x) / d) * 0.0022; S.me.y += ((S.wander.y - S.me.y) / d) * 0.0022; } }
  if (S.cal && t > nextScan) { // about twice a second, like netsh
    nextScan = t + 500; const z = zOf(scan(S.home ? S.me : null)); lastZ = lastZ ? z.map((v, i) => 0.5 * v + 0.5 * lastZ[i]) : z; inferred = infer(lastZ); // smoothed over two scans
    $("pres").textContent = inferred ? "someone's home" : "quiet"; $("pres").style.color = inferred ? "var(--hot)" : "var(--acc)";
    $("zone").textContent = "inferred room: " + (inferred ? inferred.n : "—"); const tr = S.home ? roomAt(S.me) : null; $("truth").textContent = "actually in: " + (tr ? tr.n : S.home ? "a doorway" : "nobody home");
    $("bars").innerHTML = APS.map((ap, i) => { const z = lastZ[i], w = Math.min(50, Math.abs(z) * 10); return '<div class="bar' + (Math.abs(z) > 2.5 ? " trip" : "") + '"><span>' + ap.n + '</span><span class="t"><i style="' + (z < 0 ? "right:50%" : "left:50%") + ";width:" + w + '%"></i></span><span>' + (z >= 0 ? "+" : "") + z.toFixed(1) + "σ</span></div>"; }).join("");
    if (inferred && inferred.n !== S.last) { S.last = inferred.n; S.path.push(inferred.n); if (S.path.length > 14) S.path.shift(); $("path").innerHTML = S.path.map((p) => "<span>" + p + "</span>").join("→"); }
  }
  draw(t);
}
const move = (e) => { const r = cv.getBoundingClientRect(); S.me = { x: Math.max(0, Math.min(1, (e.clientX - r.left - 16) / (W - 32))), y: Math.max(0, Math.min(1, (e.clientY - r.top - 16) / (H - 32))) }; S.home = true; if (S.auto) { S.auto = false; $("auto").textContent = "Autopilot: off"; } };
cv.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) move(e); }); cv.addEventListener("pointerdown", move);
$("cal").addEventListener("click", () => { const was = S.home; S.home = false; calibrate().then(() => { S.home = was || true; }); });
$("auto").addEventListener("click", () => { S.auto = !S.auto; S.home = true; $("auto").textContent = "Autopilot: " + (S.auto ? "on" : "off"); });
requestAnimationFrame(loop); setTimeout(() => { if (!S.cal) calibrate(); }, 600);
window.Bodywake = { S, calibrate };
})();
