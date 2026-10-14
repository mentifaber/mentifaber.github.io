const O = "https://mentifaber-1.sonicnomad01.workers.dev";
for (const q of ["Hey real quick what are stock markets looking like for XRP and XOM?", "What's Tesla stock at, and gold?"]) {
  const t0 = Date.now(), r = await fetch(O + "/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "workers-ai|@cf/openai/gpt-oss-120b", stream: true, voice: true, lang: "en-US", messages: [{ role: "user", text: q }] }) });
  const sse = await r.text(), meta = /event: meta\ndata: (.*)/.exec(sse), text = [...sse.matchAll(/event: delta\ndata: (.*)/g)].map((m) => JSON.parse(m[1]).t).join("");
  console.log("\nQ:", q, "→", r.status, Date.now() - t0 + "ms"); console.log("tools:", meta && JSON.parse(meta[1]).tools); console.log("A:", text.slice(0, 600));
}
