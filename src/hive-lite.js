// AutoFaber's backup line. Everything AutoFaber keeps (conversations, memory, the key vault, the swarm, the per-visitor
// allowances) lives in one Durable Object. When Durable Objects stop answering (on the free plan that's what happens for
// the rest of the day once the account's daily Durable Object allowance is spent, until 00:00 UTC), the Worker itself
// still runs, and so does Workers AI, which has its own allowance. So src/worker.js sends /api/hive here instead of
// showing a Cloudflare error page: the model list and chat keep working on the free Workers AI models, and the parts
// that need the stored state (memory, the vault, the swarm, the owner's tools) say plainly that they're paused.
import { textOf, finalOnly } from "./hive-kit.js";

export const LITE_MODELS = [
  ["@cf/openai/gpt-oss-120b", "GPT-OSS 120B"],
  ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Llama 3.3 70B"],
  ["@cf/meta/llama-4-scout-17b-16e-instruct", "Llama 4 Scout"],
  ["@cf/mistralai/mistral-small-3.1-24b-instruct", "Mistral Small 3.1"],
  ["@cf/openai/gpt-oss-20b", "GPT-OSS 20B"],
  ["@cf/meta/llama-3.1-8b-instruct-fast", "Llama 3.1 8B"],
];
export const LITE_DAY = 30; // messages a day per visitor on the backup line (counted per address, per data centre)
export const LITE_NOTE = "AutoFaber is on its backup line: chat works on the free models, while memory, the Swarm, keys and the owner's tools wait for its storage to come back (by 00:00 UTC at the latest).";
const SYS = "You are AutoFaber, the AI on mentifaber.org, answering on your backup line: you can't search the web, see images or remember earlier conversations right now, so don't offer to. Answer helpfully, plainly and briefly; use Markdown when it helps.";

const J = (o, st, h) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*", ...(h || {}) } });

// a rough per-visitor allowance without Durable Objects: a counter in this data centre's cache, one per address per day
async function meter(req) {
  if (typeof caches === "undefined" || !caches.default) return true;
  const ip = (req.headers.get("cf-connecting-ip") || "x").slice(0, 45), day = new Date().toISOString().slice(0, 10);
  const key = new Request("https://mentifaber.org/__lite/" + day + "/" + encodeURIComponent(ip));
  try {
    const hit = await caches.default.match(key), n = hit ? +(await hit.text()) || 0 : 0;
    if (n >= LITE_DAY) return false;
    await caches.default.put(key, new Response(String(n + 1), { headers: { "cache-control": "max-age=90000" } }));
  } catch (e) {}
  return true;
}

export async function hiveLite(req, env, path) {
  if (path === "/models") return J({ owner: false, lite: true, note: LITE_NOTE, search: 0, ai: !!env.AI,
    models: env.AI ? LITE_MODELS.map(([m, name]) => ({ id: "workers-ai|" + m, name, group: "Cloudflare Workers AI (backup line)" })) : [] });
  if (path === "/list") return J({ owner: false, lite: true, note: LITE_NOTE, projects: [] });
  if (path === "/chat" && req.method === "POST") {
    if (!env.AI) return J({ error: "AutoFaber's backup line needs Workers AI, which isn't bound here", lite: true }, 503);
    let b = {}; try { b = await req.json(); } catch (e) {}
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12)
      .map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", content: String((m && (m.text != null ? m.text : m.content)) || "").slice(0, 6000) }))
      .filter((m) => m.content.trim());
    if (!msgs.length) return J({ error: "say something first", lite: true }, 400);
    if (!(await meter(req))) return J({ error: "that's today's " + LITE_DAY + " messages on AutoFaber's backup line; it's back to normal by 00:00 UTC", lite: true }, 429);
    const want = String(b.model || "").replace(/^workers-ai\|/, "");
    const order = [want, ...LITE_MODELS.map((x) => x[0])].filter((m, i, a) => m && LITE_MODELS.some((x) => x[0] === m) && a.indexOf(m) === i);
    let last = "";
    for (const m of order) {
      try {
        const r = await env.AI.run(m, { messages: [{ role: "system", content: SYS }, ...msgs], max_tokens: 1500 });
        const raw = textOf(r), text = finalOnly(m, raw) || raw;
        if (text) return J({ text, model: "workers-ai|" + m, lite: true, note: LITE_NOTE });
      } catch (e) { last = String(e && e.message || e).slice(0, 160); if (/4006|daily free allocation|neurons/i.test(last)) break; } // Workers AI's own allowance is spent too: no use trying the rest
    }
    return J({ error: "AutoFaber's backup line couldn't get an answer" + (last ? " (" + last + ")" : "") + ". Try again in a little while.", lite: true }, 503);
  }
  return J({ error: "That part of AutoFaber is paused while its storage is away (by 00:00 UTC at the latest). Chat still works on the backup line.", lite: true }, 503, { "retry-after": "300" });
}
