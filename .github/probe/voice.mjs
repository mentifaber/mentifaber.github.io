import { readFileSync } from "node:fs";
const O = "https://mentifaber-1.sonicnomad01.workers.dev", wav = (f) => readFileSync(f), url = (b) => "data:audio/wav;base64," + b.toString("base64");
const t = () => new Date().toISOString().slice(11, 23);
for (const f of ["speech.wav", "noise.wav"]) {
  const t0 = Date.now(), r = await fetch(O + "/api/hive/stt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audio: url(wav(f)), lang: "en", kt: "Hive" }) });
  console.log("STT", f, r.status, Date.now() - t0 + "ms", (await r.text()).slice(0, 300));
}
// live: stream the speech at real-time pace in 80 ms packets, then quiet, like the voice link does
const pcm = wav("speech.wav").subarray(44); const t0 = Date.now(); let done = false;
await new Promise((resolve) => {
  const ws = new WebSocket("wss://mentifaber-1.sonicnomad01.workers.dev/api/hive/listen?rate=16000&eot=0.70&wait=4000&kt=Genesis&debug=1"); ws.binaryType = "arraybuffer";
  const stop = setTimeout(() => { console.log(t(), "LIVE timeout"); try { ws.close(); } catch (e) {} resolve(); }, 20000);
  ws.onopen = async () => { console.log(t(), "LIVE open after", Date.now() - t0, "ms");
    for (let i = 0; i < pcm.length && !done; i += 2560) { ws.send(pcm.subarray(i, i + 2560)); await new Promise((r) => setTimeout(r, 80)); }
    for (let k = 0; k < 40 && !done; k++) { ws.send(new Uint8Array(2560)); await new Promise((r) => setTimeout(r, 80)); }
    console.log(t(), "LIVE sent all audio"); };
  ws.onmessage = (e) => { const s = typeof e.data === "string" ? e.data : "[binary " + e.data.byteLength + "]"; console.log(t(), "LIVE msg", s.slice(0, 400)); if (/EndOfTurn/.test(s)) { done = true; clearTimeout(stop); setTimeout(() => { ws.close(); resolve(); }, 300); } };
  ws.onerror = (e) => console.log(t(), "LIVE error", e.message || e.type);
  ws.onclose = (e) => { console.log(t(), "LIVE close", e.code, e.reason); clearTimeout(stop); resolve(); };
});
// a spoken reply from a reasoning model: not empty, not cut off, no lists
const c0 = Date.now(), r = await fetch(O + "/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "workers-ai|@cf/openai/gpt-oss-120b", voice: true, stream: true, lang: "en-US", messages: [{ role: "user", text: "Quick question: why is the sky blue?" }] }) });
const sse = await r.text(), text = [...sse.matchAll(/event: delta\ndata: (.*)/g)].map((m) => JSON.parse(m[1]).t).join(""), done2 = /event: done\ndata: (.*)/.exec(sse);
console.log("CHAT", r.status, Date.now() - c0 + "ms", JSON.stringify(text).slice(0, 700), "| done:", done2 && done2[1].slice(0, 300));
