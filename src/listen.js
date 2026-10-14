// /api/hive/listen: the voice link's live ears. The browser streams 16 kHz 16-bit PCM over a WebSocket; this relays it to
// Deepgram Flux on Workers AI, which sends back the words as they're said (Update), and EndOfTurn when the speaker has
// finished the thought rather than merely paused. One socket per turn (assets/hive/ears.js opens it at the first syllable).
// Visitors get a daily allowance, metered by Hive like its other voice routes; the owner has none.
const MAX_MS = 3 * 60e3, IDLE_MS = 20e3;
export async function listen(req, env, owner, meter) {
  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") return new Response("expected a WebSocket", { status: 426 });
  if (!env.AI) return new Response("Workers AI is not bound", { status: 503 });
  if (!owner && !(await meter())) return new Response("voice allowance used up for today", { status: 429 });
  const u = new URL(req.url), num = (k, lo, hi, d) => { const v = +u.searchParams.get(k); return isFinite(v) && v >= lo && v <= hi ? v : d; };
  const kt = String(u.searchParams.get("kt") || "").replace(/[^\p{L}\p{N}' -]/gu, "").trim().slice(0, 40);
  const input = { encoding: "linear16", sample_rate: String(num("rate", 8000, 48000, 16000)), eot_threshold: num("eot", 0.5, 0.9, 0.7).toFixed(2), eot_timeout_ms: String(Math.round(num("wait", 1000, 10000, 4000))), ...(kt ? { keyterm: kt } : {}) };
  const [client, server] = Object.values(new WebSocketPair()); server.accept();
  const say = (o) => { try { server.send(JSON.stringify(o)); } catch (e) {} };
  let up = null;
  try {
    const r = await env.AI.run("@cf/deepgram/flux", input, { websocket: true });
    up = r && (r.webSocket || (typeof r.accept === "function" && typeof r.send === "function" ? r : null));
    if (!up) throw new Error("the recognizer didn't open a socket" + (r && r.status ? " (" + r.status + ")" : ""));
    up.accept();
  } catch (e) { say({ type: "Error", error: "live recognition unavailable: " + String(e && e.message || e).slice(0, 160) }); server.close(1011, "no recognizer"); return new Response(null, { status: 101, webSocket: client }); }
  const t0 = Date.now(); let last = Date.now(), closed = false;
  const end = (code, why) => { if (closed) return; closed = true; clearInterval(watch); try { server.close(code, why); } catch (e) {} try { up.close(1000, "done"); } catch (e) {} };
  const watch = setInterval(() => { if (Date.now() - t0 > MAX_MS) end(1000, "turn too long"); else if (Date.now() - last > IDLE_MS) end(1000, "idle"); }, 5000);
  server.addEventListener("message", (e) => { last = Date.now(); try { up.send(e.data); } catch (x) { end(1011, "recognizer gone"); } }); // audio (binary) and control messages (text) go straight through
  up.addEventListener("message", (e) => { try { server.send(e.data); } catch (x) {} });
  up.addEventListener("close", (e) => end(1000, String(e.reason || "recognizer closed").slice(0, 100)));
  up.addEventListener("error", () => { say({ type: "Error", error: "the recognizer failed" }); end(1011, "recognizer error"); });
  server.addEventListener("close", () => end(1000, "client closed"));
  server.addEventListener("error", () => end(1011, "client error"));
  return new Response(null, { status: 101, webSocket: client });
}
