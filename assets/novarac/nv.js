/* Skipline · operator console, demo mode. The real Skipline runs on a mini-PC beside the rig: FastAPI talks to the VARA
   modem over TCP and to the radio through Hamlib's rigctld, and a tablet drives it over a local hotspot with no internet
   at all. This page is that same operator screen with the modem and the far station simulated, so it can be tried
   anywhere: tune the VFO, key the transmitter, link to a callsign and have a (pretend) HF conversation. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const BANDS = [["80m", 3590000], ["40m", 7102000], ["30m", 10145000], ["20m", 14105000], ["17m", 18105000], ["15m", 21105000], ["12m", 24925000], ["10m", 28105000]];
const RIGS = ["Icom IC-7300", "Icom IC-705", "Yaesu FT-991A", "Yaesu FT-891", "Kenwood TS-590SG", "Elecraft KX3", "Xiegu G90", "(tr)uSDX"];
const S = { hz: 14105000, mode: "USB", tx: false, rx: 0, link: null, rig: RIGS[0], s: 3 };
const CALL = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z]$/;

// ── the log ──
const utc = (d = new Date()) => d.toISOString().slice(11, 19) + "Z";
function line(text, cls) { const p = document.createElement("p"); p.className = cls || "sys"; p.innerHTML = '<span class="t">' + utc() + "</span>" + esc(text); const L = $("log"); L.appendChild(p); while (L.childNodes.length > 300) L.firstChild.remove(); L.scrollTop = L.scrollHeight; }

// ── the VFO ──
const fmt = (hz) => { const m = Math.floor(hz / 1e6), k = Math.floor((hz % 1e6) / 1e3), h = Math.floor((hz % 1e3) / 10); return m + "." + String(k).padStart(3, "0") + "." + String(h).padStart(2, "0"); };
function tune(hz, quiet) {
  S.hz = Math.max(1800000, Math.min(29700000, Math.round(hz / 10) * 10)); $("freq").textContent = fmt(S.hz);
  const b = BANDS.find(([, f]) => Math.abs(f - S.hz) < 250000); document.querySelectorAll("#bands button").forEach((x) => x.classList.toggle("on", !!b && x.dataset.b === b[0]));
  if (!quiet) { clearTimeout(tune.t); tune.t = setTimeout(() => line("rig: " + fmt(S.hz) + " MHz " + S.mode + " (CAT via rigctld :4532)"), 500); }
}
$("bands").innerHTML = BANDS.map(([b]) => '<button data-b="' + b + '">' + b + "</button>").join("");
$("bands").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) tune(BANDS.find((x) => x[0] === b.dataset.b)[1]); });
$("modes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.mode = b.dataset.m; $("mode").textContent = S.mode; document.querySelectorAll("#modes button").forEach((x) => x.classList.toggle("on", x === b)); line("rig: mode " + S.mode + (S.mode !== "USB" ? " (VARA HF wants USB)" : "")); });
$("rigsel").innerHTML = RIGS.map((r) => "<option>" + r + "</option>").join("") + "<option disabled>… and 275 more in the box's Hamlib list</option>";
$("rigsel").addEventListener("change", (e) => { S.rig = e.target.value; line("rigctld: " + S.rig + " on /dev/ttyUSB0 · PTT over CAT (simulated)"); });
const vfo = $("vfo"); let drag = null;
vfo.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, hz: S.hz }; vfo.setPointerCapture(e.pointerId); });
vfo.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x; tune(drag.hz + Math.sign(dx) * Math.pow(Math.abs(dx), 1.35) * 10); });
vfo.addEventListener("pointerup", () => (drag = null)); vfo.addEventListener("pointercancel", () => (drag = null));
vfo.addEventListener("wheel", (e) => { e.preventDefault(); tune(S.hz - Math.sign(e.deltaY) * (e.shiftKey ? 1000 : 100)); }, { passive: false });
vfo.addEventListener("keydown", (e) => { const st = e.shiftKey ? 1000 : 10; if (e.key === "ArrowRight" || e.key === "ArrowUp") { tune(S.hz + st); e.preventDefault(); } if (e.key === "ArrowLeft" || e.key === "ArrowDown") { tune(S.hz - st); e.preventDefault(); } });

// ── push to talk ──
const ptt = $("ptt");
const key = (on, why) => { if (S.tx === on) return; S.tx = on; ptt.classList.toggle("on", on); ptt.textContent = on ? "TRANSMITTING" : "HOLD TO TRANSMIT"; if (why !== "modem") line(on ? "PTT on · " + fmt(S.hz) + " " + S.mode : "PTT off"); };
ptt.addEventListener("pointerdown", (e) => { e.preventDefault(); ptt.setPointerCapture(e.pointerId); key(true); });
for (const ev of ["pointerup", "pointercancel"]) ptt.addEventListener(ev, () => key(false));
addEventListener("keydown", (e) => { if (e.code === "Space" && document.activeElement.tagName !== "INPUT" && !e.repeat) { e.preventDefault(); key(true); } });
addEventListener("keyup", (e) => { if (e.code === "Space" && document.activeElement.tagName !== "INPUT") key(false); });

// ── the simulated VARA link ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pill = (t, cls) => { $("link").textContent = t; $("link").className = "pill " + (cls || ""); };
async function airtime(bytes, who) { // VARA moves data in bursts; airtime from the current speed level
  const bps = S.link ? S.link.bps : 600, s = Math.max(1.2, (bytes * 8) / bps + 0.8);
  if (who === "me") key(true, "modem"); else S.rx = 1;
  await sleep(s * 1000);
  if (who === "me") key(false, "modem"); else S.rx = 0;
  return s;
}
async function link(call) {
  if (S.link) { line("DISCONNECT " + S.link.call); await airtime(12, "me"); line("link closed · " + S.link.call + " 73", "sys"); S.link = null; pill("NO LINK"); $("b-link").textContent = "LINK"; return; }
  if (!CALL.test(call)) return line("That doesn't look like a callsign (e.g. W1AW, KD8XYZ, G4ABC).", "err");
  if (S.mode !== "USB") line("VARA HF expects USB; linking anyway.", "err");
  pill("CALLING", "busy"); $("b-link").textContent = "…"; line("VARA HF · CONNECT " + call + " on " + fmt(S.hz) + " MHz " + S.mode);
  await airtime(20, "me"); await sleep(600); await airtime(20, "them");
  const sn = Math.round(2 + Math.random() * 12), lvl = sn > 10 ? 8 : sn > 6 ? 6 : 4, bps = { 4: 470, 6: 1100, 8: 2900 }[lvl];
  S.link = { call, sn, bps, lvl, said: 0 }; pill("LINKED " + call, "on"); $("b-link").textContent = "73";
  line("LINKED · " + call + " · S/N +" + sn + " dB · speed level " + lvl + " (≈" + bps + " bps) · 2300 Hz");
  await sleep(1500); hear(pick(["GM, copy you fine on " + fmt(S.hz) + ". Name here is Dale, QTH Ohio. How copy?", "Hello, solid copy here. Running 50 W into a dipole. Your signal is good.", "QSL the link. Good copy. What's your QTH?"]));
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
async function hear(text) { if (!S.link) return; await airtime(text.length, "them"); if (!S.link) return; line(S.link.call + ": " + text, "them"); }
function reply(t) {
  const l = t.toLowerCase();
  if (/\b(73|bye|cheers|sk)\b/.test(l)) return "73, thanks for the QSO. Clear.";
  if (/qth|where/.test(l)) return "QTH is just outside Columbus, Ohio. Grid EN80.";
  if (/name/.test(l)) return "Name is Dale. Good to meet you.";
  if (/wx|weather|rain|sun/.test(l)) return "WX here is overcast, 12 C, light wind. Band's been decent all morning.";
  if (/rig|radio|power|antenna/.test(l)) return "Rig is an IC-7300 at 50 W into an 80 m dipole up 40 ft. Digirig for the audio.";
  if (/snr|copy|signal|report/.test(l)) return "You're S/N +" + (S.link.sn + 1) + " here, very readable.";
  if (/offline|internet|grid/.test(l)) return "Same idea here: nothing between us but the ionosphere.";
  return pick(["QSL. " + t.slice(0, 40) + (t.length > 40 ? "…" : "") + " copied.", "Copy all. Anything else?", "Roger, got it.", "Copied fine. Band is holding up."]);
}
$("conn").addEventListener("submit", (e) => { e.preventDefault(); link($("call").value.trim().toUpperCase()); });
$("say").addEventListener("submit", async (e) => {
  e.preventDefault(); const t = $("txt").value.trim(); if (!t) return;
  if (!S.link) return line("No link. Enter a callsign and press LINK first.", "err");
  $("txt").value = ""; line("me: " + t, "me"); const s = await airtime(new TextEncoder().encode(t).length + 12, "me"); line("ack · " + s.toFixed(1) + " s on air");
  const r = reply(t); await sleep(900 + Math.random() * 1200); await hear(r);
  if (/^73/.test(r)) { await sleep(800); S.link = null; pill("NO LINK"); $("b-link").textContent = "LINK"; line("link closed by the far station"); }
});

// ── waterfall and S-meter ──
const wf = $("wf"), g = wf.getContext("2d"); const BW = 256, BH = 150; wf.width = BW; wf.height = BH;
const img = g.createImageData(BW, 1), pal = (v) => { v = Math.max(0, Math.min(1, v)); return [Math.round(255 * Math.min(1, v * 1.6)), Math.round(176 * v * v + 30 * v), Math.round(40 * v * v * v)]; };
let phase = 0;
function frame() {
  requestAnimationFrame(frame); if (document.hidden) return; phase++;
  if (phase % 2) return; // ~30 rows a second
  g.drawImage(wf, 0, 0, BW, BH - 1, 0, 1, BW, BH - 1);
  const busy = S.tx || S.rx, carrier = (S.hz / 1000) % 7 < 0.4; // an occasional stray carrier as you tune
  for (let x = 0; x < BW; x++) {
    const hz = (x / BW) * 3000; let v = Math.random() * 0.22 + 0.05;
    if (busy && hz > 350 && hz < 2650) v += 0.45 + Math.random() * 0.35;
    if (carrier && Math.abs(hz - 1500 - ((S.hz / 10) % 60) * 10) < 18) v += 0.7;
    const [r, gg, b] = pal(v); img.data[x * 4] = r; img.data[x * 4 + 1] = gg; img.data[x * 4 + 2] = b; img.data[x * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const target = S.rx ? 8 + Math.random() : S.tx ? 0 : 2.5 + Math.random() * 1.5 + (carrier ? 2 : 0); S.s += (target - S.s) * 0.15;
  $("smeter").style.width = Math.min(100, (S.s / 9) * 90) + "%"; $("sval").textContent = S.tx ? "TX" : S.s > 9 ? "S9+" : "S" + Math.max(1, Math.round(S.s));
}
setInterval(() => ($("utc").textContent = utc()), 1000);
tune(S.hz, true); $("utc").textContent = utc(); requestAnimationFrame(frame);
line("Skipline operator console · demo modem. On the box this screen drives the VARA modem over TCP and the rig through Hamlib.");
line("Try it: tune with a drag or the wheel, hold the red button (or Space) to key up, or link to a callsign like W8DLE.");
window.Skipline = { S, tune, link };
})();
