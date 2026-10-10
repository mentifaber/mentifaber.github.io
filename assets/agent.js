// MENTIFABER AGENT 1.0 for any page on mentifaber.org:
//   <script src="/assets/agent.js"></script>
//   const text = await MentifaberAgent.chat("Hello", { onToken: (t) => out.textContent += t });
//   const text = await MentifaberAgent.chat([{ role: "system", content: "…" }, { role: "user", content: "…" }]);
// Replies stream; the first message after a quiet spell can take a minute while the model loads from R2, and a very
// long prompt takes a while to read on CPU (the connection is kept open meanwhile). Without maxTokens the reply may use
// all the memory the prompt leaves free.
(() => {
  const status = () => fetch("/api/agent/status", { cache: "no-store" }).then((r) => r.json());
  async function chat(input, opt) {
    opt = opt || {}; const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    const r = await fetch("/api/agent/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, signal: opt.signal, body: JSON.stringify({ messages, stream: true, max_tokens: opt.maxTokens || undefined, temperature: opt.temperature == null ? 0.7 : opt.temperature }) });
    if (!r.ok || !/event-stream/.test(r.headers.get("content-type") || "")) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "the agent said " + r.status); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", text = "";
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith("data:") || line === "data: [DONE]") continue;
        let j; try { j = JSON.parse(line.slice(5)); } catch (e) { continue; }
        if (j.error) throw new Error(j.error.message || j.error);
        const t = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || ""; if (t) { text += t; opt.onToken && opt.onToken(t, text); } } }
    return text;
  }
  window.MentifaberAgent = { name: "MENTIFABER AGENT 1.0", chat, status };
})();
