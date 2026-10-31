// A throwaway Worker the capture workflow (.github/workflows/capture.yml) deploys for one run: it hands Workers AI's raw
// stream back unchanged, through the same AI binding mentifaber.org uses (the deploy token isn't allowed Workers AI's REST
// API). Each request must carry that run's random key, only the models under study are allowed, and the workflow deletes
// the Worker when the run ends.
const ALLOWED = /^@cf\/openai\/gpt-oss-(120b|20b)$/;
export default {
  async fetch(req, env) {
    if (req.method !== "POST" || !env.CAPTURE_KEY || req.headers.get("x-capture-key") !== env.CAPTURE_KEY) return new Response("forbidden", { status: 403 });
    let b; try { b = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
    if (!ALLOWED.test(String(b.model || ""))) return new Response("model not allowed", { status: 400 });
    try {
      const s = await env.AI.run(b.model, b.input);
      return s && typeof s.getReader === "function" ? new Response(s, { headers: { "content-type": "text/event-stream" } }) : Response.json(s);
    } catch (e) { return Response.json({ error: String(e && e.message || e) }, { status: 502 }); }
  },
};
