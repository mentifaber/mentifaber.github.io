// Hive kit: the key vault's providers, one call shape for every model, and the tools (web search, page reading,
// vision, speech, image generation). Keys live only in the Hive Durable Object, sealed with AES-GCM; the
// browser never sees one again after it's added.

// Providers a key can belong to. "compat" speaks the OpenAI chat API; "anthropic" and the search engines have their own.
export const PRESETS = {
  openai: { name: "OpenAI", kind: "compat", base: "https://api.openai.com/v1" },
  anthropic: { name: "Anthropic", kind: "anthropic", base: "https://api.anthropic.com/v1" },
  gemini: { name: "Google Gemini", kind: "compat", base: "https://generativelanguage.googleapis.com/v1beta/openai" },
  huggingface: { name: "Hugging Face (Inference Providers)", kind: "compat", base: "https://router.huggingface.co/v1" },
  ollama: { name: "Ollama (your server or Ollama Cloud)", kind: "compat", base: "https://ollama.com/v1", editBase: true, keyless: true, pull: true },
  openrouter: { name: "OpenRouter", kind: "compat", base: "https://openrouter.ai/api/v1" },
  groq: { name: "Groq", kind: "compat", base: "https://api.groq.com/openai/v1" },
  mistral: { name: "Mistral", kind: "compat", base: "https://api.mistral.ai/v1" },
  deepseek: { name: "DeepSeek", kind: "compat", base: "https://api.deepseek.com/v1" },
  xai: { name: "xAI Grok", kind: "compat", base: "https://api.x.ai/v1" },
  together: { name: "Together", kind: "compat", base: "https://api.together.xyz/v1" },
  fireworks: { name: "Fireworks", kind: "compat", base: "https://api.fireworks.ai/inference/v1" },
  cerebras: { name: "Cerebras", kind: "compat", base: "https://api.cerebras.ai/v1" },
  sambanova: { name: "SambaNova", kind: "compat", base: "https://api.sambanova.ai/v1" },
  nvidia: { name: "NVIDIA NIM", kind: "compat", base: "https://integrate.api.nvidia.com/v1" },
  deepinfra: { name: "DeepInfra", kind: "compat", base: "https://api.deepinfra.com/v1/openai" },
  novita: { name: "Novita", kind: "compat", base: "https://api.novita.ai/v3/openai" },
  hyperbolic: { name: "Hyperbolic", kind: "compat", base: "https://api.hyperbolic.xyz/v1" },
  nebius: { name: "Nebius AI Studio", kind: "compat", base: "https://api.studio.nebius.com/v1" },
  moonshot: { name: "Moonshot (Kimi)", kind: "compat", base: "https://api.moonshot.ai/v1" },
  qwen: { name: "Alibaba Qwen (DashScope)", kind: "compat", base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  cohere: { name: "Cohere", kind: "compat", base: "https://api.cohere.ai/compatibility/v1" },
  github: { name: "GitHub Models", kind: "compat", base: "https://models.github.ai/inference", models: ["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4o", "meta/Llama-4-Maverick-17B-128E-Instruct-FP8", "deepseek/DeepSeek-R1", "mistral-ai/mistral-medium-2505", "microsoft/Phi-4", "xai/grok-3"] },
  perplexity: { name: "Perplexity", kind: "compat", base: "https://api.perplexity.ai", models: ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"] },
  custom: { name: "Custom (OpenAI-compatible: LM Studio, vLLM, LiteLLM…)", kind: "compat", base: "", editBase: true, keyless: true },
  tavily: { name: "Tavily search", kind: "search" },
  brave: { name: "Brave search", kind: "search" },
  serper: { name: "Serper (Google) search", kind: "search" },
  exa: { name: "Exa search", kind: "search" },
};
const NOT_CHAT = /embed|whisper|tts|transcri|moderation|dall-e|gpt-image|imagen|veo|rerank|guard|audio|realtime|search-preview|babbage|davinci|-image|image-|computer-use|text-to|speech|orpheus|playai|:batch|banana|lyria|sora|flux|stable-diffusion|allam|compound|-1b-|-1b$|prompt-guard/i;
export const isChat = (id) => !NOT_CHAT.test(String(id).split("|").pop()); // voices, image makers, batch-only and tiny models can't take part in a conversation

// ── the vault's seal ──
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function vaultKey(env, storage) {
  let raw;
  if (env.HIVE_VAULT_SECRET) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.HIVE_VAULT_SECRET)));
  else { raw = await storage.get("vk"); if (!raw) { raw = crypto.getRandomValues(new Uint8Array(32)); await storage.put("vk", raw); } }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(k, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return b64(iv) + "." + b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(text)))); }
export async function unseal(k, s) { const [iv, ct] = s.split("."); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, k, unb64(ct))); }

const T = (ms) => AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
async function jfetch(url, o, ms) {
  const r = await fetch(url, { ...o, signal: T(ms || 90000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok) { const m = j && (j.error && (j.error.message || j.error) || j.message || j.detail); const e = new Error((typeof m === "string" ? m : t.slice(0, 200)) || "HTTP " + r.status); e.status = r.status; throw e; }
  return j == null ? t : j;
}
const hdr = (v, key) => v.kind === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" } : { ...(key ? { authorization: "Bearer " + key } : {}), "content-type": "application/json", "http-referer": "https://mentifaber.org/hive", "x-title": "Mentifaber Hive" };

// What a key can run. Chat keys list their provider's models; search keys run one test query.
export async function probe(v, key) {
  if (v.kind === "search") { const r = await search({ ...v }, key, "cloudflare workers durable objects"); if (!r.length) throw new Error("the search came back empty"); return []; }
  const pre = PRESETS[v.provider]; if (pre && pre.models) return pre.models;
  let j; try { j = await jfetch(v.base.replace(/\/$/, "") + "/models", { headers: hdr(v, key) }, 20000); }
  catch (e) { if (v.provider !== "ollama") throw e; j = await jfetch(root(v.base) + "/api/tags", { headers: hdr(v, key) }, 20000); } // older Ollama: its own list
  const ids = (j.data || j.models || []).map((m) => (typeof m === "string" ? m : m.id || m.name || "").replace(/^models\//, "")).filter((id) => id && !NOT_CHAT.test(id));
  if (v.provider === "openrouter") { const free = (j.data || []).filter((m) => /:free$/.test(m.id)).map((m) => m.id); return [...new Set([...ids.filter((i) => !/:free$/.test(i)), ...free])].slice(0, 3000); }
  return [...new Set(ids)].slice(0, 3000);
}

// ── one call shape for every model ──
// msgs: [{ role: "user"|"assistant", text, images: ["data:image/jpeg;base64,…"] }]
const parts = (u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(u || ""); return m ? { type: m[1], data: m[2] } : null; };
export async function complete(env, v, key, model, system, msgs, max) {
  max = max || 2048;
  if (!v) { // Workers AI
    const r = await env.AI.run(model, { messages: [{ role: "system", content: system }, ...msgs.map((m) => ({ role: m.role, content: m.text || "" }))], max_tokens: max });
    return textOf(r);
  }
  if (v.kind === "anthropic") {
    const messages = msgs.map((m) => ({ role: m.role, content: [...(m.images || []).map(parts).filter(Boolean).map((p) => ({ type: "image", source: { type: "base64", media_type: p.type, data: p.data } })), { type: "text", text: m.text || "…" }] }));
    const j = await jfetch(v.base.replace(/\/$/, "") + "/messages", { method: "POST", headers: hdr(v, key), body: JSON.stringify({ model, max_tokens: max, system, messages }) });
    return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  }
  const messages = [{ role: "system", content: system }, ...msgs.map((m) => (m.images && m.images.length ? { role: m.role, content: [{ type: "text", text: m.text || "" }, ...m.images.map((u) => ({ type: "image_url", image_url: { url: u } }))] } : { role: m.role, content: m.text || "" }))];
  const j = await jfetch(v.base.replace(/\/$/, "") + "/chat/completions", { method: "POST", headers: hdr(v, key), body: JSON.stringify({ model, max_tokens: max, messages }) });
  const c = j.choices && j.choices[0] && j.choices[0].message; let out = String((c && c.content) || "").trim();
  if (j.citations && j.citations.length) out += "\n\n" + j.citations.map((u, i) => "[" + (i + 1) + "] " + u).join("\n"); // Perplexity cites its sources
  return out;
}

// Workers AI replies come in several shapes; turn any of them into text.
export function textOf(r) {
  if (r == null) return "";
  if (typeof r === "string") return r.trim();
  const v = r.response;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") return JSON.stringify(v);
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content; if (typeof c === "string" && c.trim()) return c.trim();
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text.trim();
  if (Array.isArray(r.output)) { const t = r.output.flatMap((o) => (Array.isArray(o.content) ? o.content : [o])).map((x) => (typeof x === "string" ? x : x && (x.text || x.output_text) || "")).filter(Boolean).join("\n").trim(); if (t) return t; }
  return "";
}

// ── tools ──
// Web search: the first enabled search key wins; with none, Wikipedia (keyless) still answers.
export async function search(v, key, q, n) {
  n = n || 6; const enc = encodeURIComponent(q);
  if (v && v.provider === "tavily") { const j = await jfetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ api_key: key, query: q, max_results: n, include_answer: false }) }, 20000); return (j.results || []).map((r) => ({ title: r.title, url: r.url, text: r.content })); }
  if (v && v.provider === "brave") { const j = await jfetch("https://api.search.brave.com/res/v1/web/search?count=" + n + "&q=" + enc, { headers: { accept: "application/json", "x-subscription-token": key } }, 20000); return ((j.web && j.web.results) || []).map((r) => ({ title: r.title, url: r.url, text: String(r.description || "").replace(/<[^>]+>/g, "") })); }
  if (v && v.provider === "serper") { const j = await jfetch("https://google.serper.dev/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ q, num: n }) }, 20000); return (j.organic || []).map((r) => ({ title: r.title, url: r.link, text: r.snippet })); }
  if (v && v.provider === "exa") { const j = await jfetch("https://api.exa.ai/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify({ query: q, numResults: n, contents: { text: { maxCharacters: 1200 } } }) }, 20000); return (j.results || []).map((r) => ({ title: r.title, url: r.url, text: r.text })); }
  const j = await jfetch("https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=" + Math.min(n, 5) + "&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=1200&gsrsearch=" + enc, { headers: { "user-agent": "MentifaberHive/2 (https://mentifaber.org/hive)" } }, 15000);
  return Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index).map((p) => ({ title: p.title + " (Wikipedia)", url: p.fullurl, text: p.extract }));
}
const root = (base) => base.replace(/\/+$/, "").replace(/\/v1$/, ""); // Ollama's native API sits beside /v1
// Ollama: download a model onto the server (big ones take minutes; Ollama keeps going if we stop waiting).
export async function pullModel(v, key, model) {
  let r; try { r = await fetch(root(v.base) + "/api/pull", { method: "POST", headers: hdr(v, key), body: JSON.stringify({ model, stream: false }), signal: T(25000) }); }
  catch (e) { if (e.name === "TimeoutError") return "downloading; big models take a while, press Test later to see it"; throw e; }
  const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status); return j.status || "success";
}
// Read a public web page as plain text (links the user pastes).
export async function readPage(u) {
  const url = new URL(u); if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) throw new Error("not a public page");
  const r = await fetch(url, { headers: { "user-agent": "MentifaberHive/2 (+https://mentifaber.org/hive)", accept: "text/html,text/plain,application/json" }, signal: T(15000), redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status); const t = (await r.text()).slice(0, 600000);
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || [])[1] || url.hostname;
  const body = t.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title: title.trim().slice(0, 200), url: url.href, text: body.slice(0, 12000) };
}
// Eyes for models that have none: Workers AI describes the picture, the description goes into the prompt.
export async function describe(env, dataUrl, ask) {
  const p = parts(dataUrl); if (!p || !env.AI) return "";
  const r = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", { image: [...unb64(p.data)], prompt: ask || "Describe this image in detail: subjects, any text, layout, colours.", max_tokens: 400 });
  return String((r && (r.description || r.response)) || "").trim();
}
export async function transcribe(env, audioB64, lang) { const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: audioB64, ...(/^[a-z]{2}$/.test(lang || "") ? { language: lang } : {}) }); return String((r && r.text) || "").trim(); } // a language hint stops short clips being heard as Russian or Icelandic
export async function speak(env, text) { const r = await env.AI.run("@cf/myshell-ai/melotts", { prompt: text.slice(0, 2000), lang: "en" }); return r && r.audio; }
export async function imagine(env, prompt) { const r = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: prompt.slice(0, 2000), steps: 6 }); return r && r.image; }

// ── streaming: the same call shape, but words arrive as they're written ──
async function sse(body, onData) { // read a server-sent-event stream, hand each data payload over
  const rd = body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith("data:")) { const d = line.slice(5).trim(); if (d && d !== "[DONE]") try { onData(JSON.parse(d)); } catch (e) {} } }
  }
}
const piece = (j) => { // the new text in one streamed event, whichever provider sent it
  if (!j) return "";
  if (typeof j.response === "string") return j.response;
  const c = j.choices && j.choices[0]; if (c && c.delta && typeof c.delta.content === "string") return c.delta.content;
  if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") return j.delta.text || "";
  if (j.type === "response.output_text.delta") return j.delta || "";
  return "";
};
export async function streamComplete(env, v, key, model, system, msgs, max, onDelta) {
  max = max || 2048; let text = "";
  const take = (j) => { const t = piece(j); if (t) { text += t; onDelta(t); } };
  if (!v) {
    const s = await env.AI.run(model, { messages: [{ role: "system", content: system }, ...msgs.map((m) => ({ role: m.role, content: m.text || "" }))], max_tokens: max, stream: true });
    if (s && typeof s.getReader === "function") await sse(s, take); else { const t = textOf(s); if (t) { text = t; onDelta(t); } }
    return text;
  }
  let url, body;
  if (v.kind === "anthropic") {
    url = v.base.replace(/\/$/, "") + "/messages";
    body = { model, max_tokens: max, system, stream: true, messages: msgs.map((m) => ({ role: m.role, content: [...(m.images || []).map(parts).filter(Boolean).map((p) => ({ type: "image", source: { type: "base64", media_type: p.type, data: p.data } })), { type: "text", text: m.text || "…" }] })) };
  } else {
    url = v.base.replace(/\/$/, "") + "/chat/completions";
    body = { model, max_tokens: max, stream: true, messages: [{ role: "system", content: system }, ...msgs.map((m) => (m.images && m.images.length ? { role: m.role, content: [{ type: "text", text: m.text || "" }, ...m.images.map((u) => ({ type: "image_url", image_url: { url: u } }))] } : { role: m.role, content: m.text || "" }))] };
  }
  const r = await fetch(url, { method: "POST", headers: hdr(v, key), body: JSON.stringify(body), signal: T(180000) });
  if (!r.ok) { const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} const m = j && (j.error && (j.error.message || j.error) || j.message); const e = new Error((typeof m === "string" ? m : t.slice(0, 200)) || "HTTP " + r.status); e.status = r.status; throw e; }
  if (!/event-stream/.test(r.headers.get("content-type") || "")) { const j = await r.json().catch(() => null); const t = j ? (j.content ? (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("") : String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "")) : ""; if (t) { text = t; onDelta(t); } return text; }
  await sse(r.body, take);
  return text;
}
