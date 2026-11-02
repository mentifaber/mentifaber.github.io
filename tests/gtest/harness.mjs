// Runs Hive's Durable Object under Node: node:sqlite stands in for the DO's SQL storage, a fake Workers AI answers.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
for (const f of ["hive.js", "hive-kit.js", "hive-mind.js", "hive-genesis.js", "vigil.js", "push.js", "listen.js", "markets.js", "hive-world.js", "hive-know.js", "hive-agent.js", "hive-research.js", "hive-route.js", "hive-tasks.js", "hive-check.js", "hive-canvas.js", "hive-library.js", "hive-voice.js", "media.js"]) writeFileSync(OUT + f, readFileSync(REPO + "/src/" + f, "utf8").replace('from "cloudflare:workers"', 'from "../cf-shim.mjs"'));
writeFileSync(new URL("./cf-shim.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Hive } = await import(OUT + "hive.js");

class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } one() { if (this.r.length !== 1) throw new Error("one(): " + this.r.length + " rows"); return this.r[0]; } [Symbol.iterator]() { return this.r[Symbol.iterator](); } }
const db = new DatabaseSync(":memory:");
const sql = { exec(q, ...a) { a = a.map((x) => x instanceof ArrayBuffer ? new Uint8Array(x) : x === undefined ? null : typeof x === "boolean" ? +x : x); const st = db.prepare(q);
  if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((r) => { const o = {}; for (const k in r) { const v = r[k]; o[k] = v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v; } return o; }));
  st.run(...a); return new Cursor([]); } };
const store = new Map(), pending = [];
const ctx = { storage: { sql, get: async (k) => store.get(k), put: async (k, v) => { store.set(k, structuredClone(v)); }, getAlarm: async () => null, setAlarm: async () => {}, delete: async (k) => store.delete(k) }, waitUntil: (p) => pending.push(p) };
// fake Workers AI: bag-of-words vectors for embeddings (similar words → similar vectors), canned chat replies
const vec = (t) => { const v = new Array(384).fill(0); for (const w of String(t).toLowerCase().match(/[a-z]{4,}/g) || []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 384] += 1; } const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
export const calls = [];
export let reflectReply = null;
export const setReflect = (r) => { reflectReply = r; };
let responder = null; export const setResponder = (f) => { responder = f; };
let delay = 0, delayFn = null; export const setDelay = (ms) => { delay = ms; }; export const setDelayFn = (f) => { delayFn = f; };
export const ttsCalls = []; let sttFake = null; export const setStt = (f) => { sttFake = f; }; // what the fake Whisper hears, and what the fake Aura was asked to say
const AI = { async run(model, input) {
  if (/whisper/.test(model)) return sttFake ? sttFake(input) : { text: "" };
  if (/aura|melotts/.test(model)) { ttsCalls.push({ model, text: input.text || input.prompt, speaker: input.speaker }); return { audio: "QVVESU8=" }; }
  if (/bge/.test(model)) return { shape: [input.text.length, 384], data: input.text.map(vec) };
  { const d = delayFn ? delayFn(input.messages[0].content) : delay; if (d) await new Promise((r) => setTimeout(r, d)); }
  const sys = input.messages[0].content, user = input.messages[input.messages.length - 1].content; calls.push({ model, sys, user, messages: input.messages });
  if (responder) { const r = responder(sys, user); if (r != null) return { response: r }; }
  if (/reflecting privately/.test(sys)) return { response: reflectReply };
  if (/INTEGRATOR/.test(sys)) return { response: "# The finished tool\n\n" + "Working code and notes. ".repeat(400) };
  return { response: "Systems are steady tonight, Anders. The container woke in 40 seconds." };
} };
export const env = { AI };
export const hive = new Hive(ctx, env);
export const settle = async () => { while (pending.length) await pending.shift(); };
export const call = async (path, body, owner = true, extra = {}) => { const r = await hive.fetch(new Request("https://mentifaber.org/api/hive" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(owner ? { "x-hive-owner": "1" } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })); const ct = r.headers.get("content-type") || ""; return /event-stream/.test(ct) ? { status: r.status, sse: await r.text() } : { status: r.status, ...(await r.json()) }; };
export { db };
