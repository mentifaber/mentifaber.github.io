// NULLSPACE · the internet link: a dumb, encrypted relay. Transmissions are posted sealed and fetched by frequency tag; a WebSocket
// carries pokes ("something new on this tag") and sealed ephemeral frames (who's here, pings). If the network or the server is
// gone, everything keeps working on the radio and from this device's own history.
(() => {
"use strict";
const N = (NS.Net = { state: "off", rtt: 0, sent: 0, got: 0, h: {}, on(t, f) { (N.h[t] = N.h[t] || []).push(f); } });
const emit = (t, a, b) => (N.h[t] || []).forEach((f) => { try { f(a, b); } catch (e) { console.error(e); } });
N.api = async (path, o) => { let r; try { r = await fetch("/api/ns/" + path, { cache: "no-store", ...(o || {}) }); } catch (e) { N.down(); throw { offline: true }; } const j = await r.json().catch(() => ({})); if (!r.ok) throw { err: j.error || "relay said " + r.status, status: r.status }; N.up(); return j; };
N.down = () => { if (N.state !== "down") { N.state = "down"; emit("state"); } };
N.up = () => { if (N.state === "down" || N.state === "off") { N.state = ws && ws.readyState === 1 ? "live" : "poll"; emit("state"); } };
N.tx = (f, ct, iv, extra) => N.api("tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ f: f.tag, ct, iv, dev: NS.dev, ...(extra || {}) }) }).then((j) => { N.sent++; return j; });
N.rx = async (f) => { const cur = NS.store.get("cur:" + f.tag, ""); const j = await N.api("rx?f=" + f.tag + (cur ? "&after=" + encodeURIComponent(cur) : "")); if (j.cur) NS.store.set("cur:" + f.tag, j.cur); N.got += j.tx.length; return j; };
N.blobUp = async (f, u8) => { const r = await fetch("/api/ns/blob?f=" + f.tag, { method: "POST", body: await NS.sealBytes(f, u8) }); if (!r.ok) throw { err: "upload failed" }; return (await r.json()).id; };
N.blobDown = async (f, id) => { const r = await fetch("/api/ns/blob/" + id + "?f=" + f.tag); if (!r.ok) throw { err: "gone" }; return NS.openBytes(f, await r.arrayBuffer()); };
// ── the live line ──
let ws = null, retry = 0, pingT = 0, pingAt = 0, want = false, subKey = "";
function open() {
  if (!want || ws || !NS.freqs.length) return; subKey = NS.freqs.map((f) => f.tag).join(",");
  let s; try { s = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/ns/live?f=" + subKey + "&dev=" + NS.dev); } catch (e) { return later(); }
  ws = s; s.onopen = () => { retry = 0; N.state = "live"; clearInterval(pingT); pingT = setInterval(() => { if (s.readyState === 1) { pingAt = performance.now(); s.send("ping"); } }, 15000); pingAt = performance.now(); s.send("ping"); emit("state"); emit("open"); };
  s.onmessage = async (e) => { if (e.data === "pong") { N.rtt = Math.round(performance.now() - pingAt); emit("state"); return; } let j; try { j = JSON.parse(e.data); } catch (x) { return; } const f = NS.freqs.find((x) => x.tag === j.f); if (!f) return;
    if (j.t === "tx") emit("poke", f); else if (j.t === "burn") emit("burn", f, j.id); else if (j.t === "fx") { const [iv, ct] = j.p.split("."); const o = await NS.open(f, ct, iv); if (o) emit("fx", f, o); } };
  s.onclose = () => { if (ws === s) ws = null; clearInterval(pingT); if (N.state === "live") N.state = navigator.onLine ? "poll" : "down"; emit("state"); if (want) later(); };
  s.onerror = () => { try { s.close(); } catch (e) {} };
}
function later() { clearTimeout(N.rt); N.rt = setTimeout(open, Math.min(30000, 800 * 2 ** Math.min(retry++, 6)) + Math.random() * 500); }
N.start = () => { want = true; open(); };
N.resub = () => { const k = NS.freqs.map((f) => f.tag).join(","); if (k === subKey && ws) return; if (ws) try { ws.close(); } catch (e) {} ws = null; retry = 0; open(); }; // tuned to something new: reconnect with the new list
N.fx = async (f, o) => { if (!ws || ws.readyState !== 1) return false; const s = await NS.seal(f, o); ws.send(JSON.stringify({ f: f.tag, p: s.iv + "." + s.ct })); return true; };
N.live = () => !!(ws && ws.readyState === 1);
addEventListener("online", () => { retry = 0; open(); emit("state"); }); addEventListener("offline", () => { N.down(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && want && !ws) { retry = 0; open(); } });
})();
