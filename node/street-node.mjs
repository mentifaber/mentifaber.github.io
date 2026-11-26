#!/usr/bin/env node
// The Street Node (game plan GP-9.1): a box on a lamp post that a street's phones join over Wi-Fi in an outage. It runs on a
// Raspberry Pi or any old laptop with Node.js 20 or newer, and needs nothing else installed.
//
// It serves Street Board and Street Library from the box, with the same /api/board and /api/library the site has: the
// site's own code (src/board.js, src/library.js) runs here, over a store kept in one JSON file. A phone that joins the
// box's Wi-Fi is sent to the street's page (the checks phones make to see if they're online are answered with it). When
// the box has an internet connection (--upstream), it swaps the street's notices with mentifaber.org every few minutes,
// and keeps a copy of the workshop's public seal key so condition photos sealed earlier still check out offline.
//
//   node node/street-node.mjs --board elm-street [--port 80] [--data street-node.json] [--upstream https://mentifaber.org]
//
// What it doesn't do yet: relay notices to the next street's node over a mesh radio (the Meshtastic bridge), and the Wi-Fi
// itself (hostapd and dnsmasq on the Pi; see node/README.md).
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BOARD = String(arg("board", "")).toLowerCase(), PORT = +arg("port", 80), DATA = path.resolve(arg("data", "street-node.json")), UP = arg("upstream", "").replace(/\/+$/, ""), SYNC_MIN = +arg("sync", 5);
const { board, boardOk } = await import(path.join(ROOT, "src/board.js")), { library } = await import(path.join(ROOT, "src/library.js"));
if (!boardOk(BOARD)) { console.error("Say which street: --board elm-street (3 to 24 letters, digits and hyphens) or a 5-letter place code."); process.exit(2); }

// ── the store: what the site keeps in a Durable Object, kept here in one file (written a moment after each change) ──
const mem = new Map(Object.entries((() => { try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch (e) { return {}; } })()));
let timer = null; const persist = () => { clearTimeout(timer); timer = setTimeout(() => { const tmp = DATA + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(mem))); fs.renameSync(tmp, DATA); }, 200); };
const hits = new Map();
const st = {
  kvGet: async (k) => structuredClone(mem.get(k)) ?? null,
  kvPut: async (k, v) => { mem.set(k, structuredClone(v)); persist(); },
  kvDel: async (k) => { mem.delete(k); persist(); },
  // one step, so nothing comes between the check and the write (as in the site's Store)
  kvCas: async (k, expect, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== expect) return { ok: false, cur: structuredClone(cur) }; mem.set(k, structuredClone(v)); persist(); return { ok: true }; },
  hit: async (k, limit, windowMs) => { if (k.endsWith(":upstream")) return true; const now = Date.now(); let r = hits.get(k); if (!r || r.until < now) r = { n: 0, until: now + windowMs }; r.n++; hits.set(k, r); return r.n <= limit; },
};
const env = { STORE: { idFromName: () => "main", get: () => st } };
const json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });

// ── what the box serves: the street's two apps and what they load; nothing else of the site ──
const FILES = new Map([["/street", "street.html"], ["/street.html", "street.html"], ["/library", "library.html"], ["/library.html", "library.html"], ["/street-sw.js", "street-sw.js"]]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const fileFor = (p) => { if (FILES.has(p)) return path.join(ROOT, FILES.get(p)); if (/^\/assets\/[\w./-]+$/.test(p) && !p.includes("..")) return path.join(ROOT, p.slice(1)); return null; };
// the checks phones and laptops make to see whether they're online: answered with the street's page, which opens it
const CHECKS = /^\/(generate_204|gen_204|hotspot-detect\.html|library\/test\/success\.html|connecttest\.txt|ncsi\.txt|success\.txt|canonical\.html|redirect)$/;
const landing = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BOARD} · Street Node</title>
<style>body{margin:0;background:#0a0d0c;color:#e8f1ed;font:17px/1.5 system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:28px 18px}h1{font-size:28px;margin:0 0 6px}p{color:#9fb0a8}a.b{display:block;margin:12px 0;padding:16px 18px;border-radius:12px;background:#151b19;border:1px solid #2a3632;color:#e8f1ed;text-decoration:none}a.b b{display:block;font-size:19px}small{color:#9fb0a8}</style></head>
<body><main><h1>This street's box</h1><p>You're on <b>${BOARD}</b>'s Street Node: it works with no internet. What's posted here stays on the box and reaches the site when the box next has a connection.</p>
<a class="b" id="to-street" href="/street"><b>Street Board</b><small>Needs, offers, road news and who's safe</small></a>
<a class="b" id="to-library" href="/library"><b>Street Library</b><small>Borrow the ladder, not buy it</small></a>
<p><small>${UP ? "Last swap with mentifaber.org: <span id='sync'>" + (sync.at ? new Date(sync.at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "not yet") + "</span>." : "This box isn't connected to mentifaber.org."}</small></p></main>
<script>try{localStorage.setItem("street:board",JSON.stringify(${JSON.stringify(BOARD)}));localStorage.setItem("library:board",JSON.stringify(${JSON.stringify(BOARD)}));}catch(e){}</script></body></html>`;

// ── the workshop's public seal key (fetched when there's internet), and the swap with the site ──
const sync = { at: 0, sent: 0, got: 0, error: null, key: mem.get("node:sealkey") || null };
const local = (method, p, body) => board(new Request("http://node/api/board/" + BOARD + p, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "upstream" }, body: body ? JSON.stringify(body) : undefined }), env, json).then((r) => r.json());
export async function swap() {
  if (!UP) return sync;
  try {
    const mine = (await local("GET", "")).posts.filter((p) => !p.gone);
    for (let i = 0; i < mine.length; i += 40) { const r = await fetch(UP + "/api/board/" + BOARD, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ posts: mine.slice(i, i + 40) }) }); if (r.ok) sync.sent += (await r.json()).added || 0; }
    const theirs = (await (await fetch(UP + "/api/board/" + BOARD)).json()).posts.filter((p) => !p.gone);
    for (let i = 0; i < theirs.length; i += 40) sync.got += (await local("POST", "", { posts: theirs.slice(i, i + 40) })).added || 0;
    const k = await fetch(UP + "/api/seal/key").then((r) => (r.ok ? r.json() : null)).catch(() => null); if (k) { sync.key = k; mem.set("node:sealkey", k); persist(); }
    sync.at = Date.now(); sync.error = null;
  } catch (e) { sync.error = String(e.message || e).slice(0, 200); }
  return sync;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://node"), p = url.pathname, ip = req.socket.remoteAddress || "phone";
  const send = async (r) => { res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); };
  if (CHECKS.test(p)) { res.writeHead(302, { location: "/", "cache-control": "no-store" }); return res.end(); }
  if (p === "/" || p === "/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(landing()); }
  if (p === "/api/node") return send(json({ board: BOARD, upstream: UP || null, sync: { at: sync.at || null, sent: sync.sent, got: sync.got, error: sync.error } }));
  if (p.startsWith("/api/board/") || p.startsWith("/api/library/")) {
    const chunks = []; for await (const c of req) chunks.push(c); const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r2 = new Request("http://node" + req.url, { method: req.method, headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: req.method === "POST" ? body : undefined });
    return send(await (p.startsWith("/api/board/") ? board(r2, env, json) : library(r2, env, json)));
  }
  if (p === "/api/seal/key") return send(sync.key ? json(sync.key) : json({ error: "this box hasn't fetched the workshop's key yet" }, 503));
  if (p.startsWith("/api/seal/")) return send(json({ error: "sealing needs the workshop, so it needs the internet; this box keeps the photo's fingerprint instead" }, 503));
  const f = fileFor(p);
  if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); return fs.createReadStream(f).pipe(res); }
  if (p.startsWith("/api/")) return send(json({ error: "not on this box" }, 404));
  // anything else (a page from the wider internet, asked for while offline): the street's page
  res.writeHead(302, { location: "/", "cache-control": "no-store" }); res.end();
}

const server = http.createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(e.message || e) })); }));
server.listen(PORT, () => console.log("Street Node for " + BOARD + " on port " + PORT + (UP ? ", swapping with " + UP + " every " + SYNC_MIN + " min" : "")));
if (UP) { swap(); setInterval(swap, SYNC_MIN * 60e3).unref(); }
process.on("SIGTERM", () => { clearTimeout(timer); if (mem.size) fs.writeFileSync(DATA, JSON.stringify(Object.fromEntries(mem))); process.exit(0); });
// a test (or an admin) can ask for a swap now
process.on("SIGUSR2", () => { swap().then((s) => console.log("swap " + JSON.stringify({ at: s.at, sent: s.sent, got: s.got, error: s.error }))); });
