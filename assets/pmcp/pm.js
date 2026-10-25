/* Phone MCP · the console. Two modes: the simulated phone below, and "Your server", which connects to any real MCP server
   over Streamable HTTP and calls its tools for real (see live(), further down).
   The simulated one: What a model sees when it holds a phone over MCP: JSON-RPC 2.0 tool calls that travel a
   tunnel, a hand-written server and ADB to a device. The device here is simulated; the shapes, the tools (v1.0's 15) and
   the failure modes are the real ones: a quick tunnel's hostname rotates on restart, ADB authorisation is per host key,
   and doze kills a background listener without telling anyone. SMS is gated, and a hung send reports "likely sent",
   never "failed", so a model doesn't retry and double-text someone. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rnd = (n) => Math.random().toString(36).slice(2, 2 + n);
const S = { host: "", cfg: "", adb: "ok", doze: false, app: null, sms: [], text: "", clip: "", batt: 54, notif: ["Termux: server running on :8765", "Messages: 1 new"], id: 1 };
// live mode: your own server (see live(), further down)
const L = { on: false, url: "", token: "", sid: "", ready: false, tools: [], name: "" };
try { L.url = localStorage.getItem("pmcp:url") || ""; L.token = sessionStorage.getItem("pmcp:token") || ""; } catch (e) {}
const newHost = () => (S.host = ["bright", "quiet", "amber", "north", "cedar", "lunar"][Math.floor(Math.random() * 6)] + "-" + ["river", "stone", "field", "harbor", "signal"][Math.floor(Math.random() * 5)] + "-" + rnd(4) + ".trycloudflare.com");
newHost(); S.cfg = S.host;
const TOOLS = {
  screenshot: { d: "Capture the screen as PNG", a: {} }, tap: { d: "Tap at x,y (pixels)", a: { x: 540, y: 1200 } }, swipe: { d: "Swipe between two points", a: { x1: 540, y1: 1800, x2: 540, y2: 600, ms: 300 } },
  type_text: { d: "Type into the focused field", a: { text: "on my way" } }, key_event: { d: "Send a key (HOME, BACK, ENTER…)", a: { key: "HOME" } }, launch_app: { d: "Open an app by package", a: { package: "com.google.android.apps.messaging" } },
  list_apps: { d: "Installed packages", a: {} }, foreground_app: { d: "Which app is in front", a: {} }, sms_send: { d: "Send an SMS (gated)", a: { to: "+15555550123", text: "Running 10 minutes late" } },
  sms_list: { d: "Recent messages", a: { limit: 3 } }, battery: { d: "Battery level and state", a: {} }, gps: { d: "Last known location", a: {} },
  clipboard_get: { d: "Read the clipboard", a: {} }, clipboard_set: { d: "Write the clipboard", a: { text: "copied by a model" } }, notifications: { d: "Current notifications", a: {} },
};
const APPS = [["Messages", "com.google.android.apps.messaging", "💬", "#2563eb"], ["Termux", "com.termux", "⌨", "#111827"], ["Maps", "com.google.android.apps.maps", "🗺", "#16a34a"], ["Camera", "com.sec.android.app.camera", "📷", "#6b7280"], ["Settings", "com.android.settings", "⚙", "#475569"], ["Chrome", "com.android.chrome", "◎", "#f59e0b"], ["Clock", "com.sec.android.app.clockpackage", "⏰", "#7c3aed"], ["Files", "com.sec.android.app.myfiles", "📁", "#0ea5e9"]];

// ── the chain ──
const LINKS = [
  { k: "model", n: "Claude", s: "a tool call over MCP" },
  { k: "tunnel", n: "Cloudflare quick tunnel", s: "public https, no account", btn: "Restart tunnel" },
  { k: "server", n: "MCP server (Termux)", s: "JSON-RPC 2.0 by hand, no SDK", btn: "Doze the phone" },
  { k: "adb", n: "ADB (wireless debugging)", s: "authorised per host key", btn: "Re-pair (new key)" },
  { k: "device", n: "SM-S731U", s: "the phone on the desk" },
];
function chain() {
  $("chain").innerHTML = LINKS.map((l, i) => (i ? '<div class="hop" data-h="' + i + '"></div>' : "") + '<div class="node ' + state(l.k) + '" data-k="' + l.k + '"><b><i></i>' + esc(l.n) + "</b><small>" + esc(note(l)) + "</small>" + (l.btn ? '<button data-act="' + l.k + '">' + esc(fixLabel(l)) + "</button>" : "") + "</div>").join("");
  $("ep").textContent = "MCP config → https://" + S.cfg + "/mcp";
}
const state = (k) => (k === "tunnel" && S.cfg !== S.host ? "warn" : k === "adb" && S.adb !== "ok" ? "down" : k === "server" && S.doze ? "down" : "");
const note = (l) => l.k === "tunnel" ? (S.cfg !== S.host ? "hostname rotated: config is stale" : S.host) : l.k === "adb" ? (S.adb === "ok" ? "device authorised" : "unauthorized: approve the key on the phone") : l.k === "server" ? (S.doze ? "killed by doze; nothing told anyone" : "listening on :8765") : l.s;
const fixLabel = (l) => l.k === "tunnel" ? (S.cfg !== S.host ? "Update MCP config" : l.btn) : l.k === "adb" ? (S.adb === "ok" ? l.btn : "Approve on phone") : l.k === "server" ? (S.doze ? "Wake + exempt from battery optimisation" : l.btn) : l.btn;
$("chain").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return; const k = b.dataset.act;
  if (k === "tunnel") { if (S.cfg !== S.host) { S.cfg = S.host; log("note", "MCP config updated to the new hostname."); } else { newHost(); log("note", "Tunnel restarted. New hostname " + S.host + ". The config still points at the old one, and nothing says so."); } }
  if (k === "adb") { S.adb = S.adb === "ok" ? "unauth" : "ok"; log("note", S.adb === "ok" ? "Fingerprint approved on the device screen." : "Replugged into another host: ADB now reports the device as unauthorized."); }
  if (k === "server") { S.doze = !S.doze; log("note", S.doze ? "Doze killed the Termux listener. From the outside it looks like a network fault." : "Termux exempted from battery optimisation; the listener is back."); }
  chain(); draw(); });

// ── the console ──
function log(cls, text, obj) { const p = document.createElement("pre"); p.className = cls; p.textContent = obj ? text + "\n" + JSON.stringify(obj, null, 2) : text; $("log").appendChild(p); $("log").scrollTop = $("log").scrollHeight; }
function toolMenu() {
  const list = L.on ? L.tools.map((t) => [t.name, t.description || ""]) : Object.entries(TOOLS).map(([k, t]) => [k, t.d]);
  $("tool").innerHTML = list.length ? list.map(([k, d]) => '<option value="' + esc(k) + '">' + esc(k) + (d ? " · " + esc(d.split("\n")[0].slice(0, 80)) : "") + "</option>").join("") : '<option value="">connect, then list the tools</option>';
}
// example arguments: the simulated phone's own, or built from a live tool's input schema (defaults, examples, else a blank of the right type)
function example(sc) {
  const o = {}, P = (sc && sc.properties) || {}, req = new Set((sc && sc.required) || []);
  for (const [k, v] of Object.entries(P)) { if (!req.has(k) && Object.keys(P).length > 4) continue;
    o[k] = v.default !== undefined ? v.default : v.examples ? v.examples[0] : v.enum ? v.enum[0] : v.type === "number" || v.type === "integer" ? 0 : v.type === "boolean" ? false : v.type === "array" ? [] : v.type === "object" ? {} : ""; }
  return o;
}
const setArgs = () => { const n = $("tool").value; $("args").value = JSON.stringify(L.on ? example((L.tools.find((t) => t.name === n) || {}).inputSchema) : (TOOLS[n] || {}).a || {}, null, L.on ? 1 : 0); };
toolMenu();
$("tool").addEventListener("change", setArgs); setArgs();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function walk(upto) { for (let i = 0; i < LINKS.length; i++) { document.querySelectorAll(".node").forEach((n, j) => n.classList.toggle("act", j === i)); document.querySelectorAll(".hop").forEach((h) => h.classList.toggle("act", +h.dataset.h === i)); await sleep(110); if (i >= upto) break; } document.querySelectorAll(".node,.hop").forEach((n) => n.classList.remove("act")); }
async function rpc(method, params) {
  if (L.on) return live(method, params);
  const req = { jsonrpc: "2.0", id: S.id++, method, params }; log("req", "→ POST https://" + S.cfg + "/mcp", req);
  if (S.cfg !== S.host) { await walk(1); return log("err", "← 404 Not Found (the tunnel at that hostname no longer exists)"); }
  if (S.doze) { await walk(2); return log("err", "← 502 Bad Gateway: the tunnel is up but nothing is listening behind it"); }
  if (method === "tools/list") { await walk(2); return log("res", "←", { jsonrpc: "2.0", id: req.id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.d, inputSchema: { type: "object", properties: Object.fromEntries(Object.keys(t.a).map((k) => [k, { type: typeof t.a[k] === "number" ? "integer" : "string" }])) } })) } }); }
  if (S.adb !== "ok") { await walk(3); return log("res", "←", { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: "error: device unauthorized. This adb server's $ADB_VENDOR_KEYS is not set" }] } }); }
  await walk(4); const out = await call(params.name, params.arguments || {});
  log("res", "←", { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: out }] } });
}
$("list").addEventListener("click", () => rpc("tools/list", {}));

// ── your own server: MCP over Streamable HTTP, for real ──
// The page speaks the protocol itself: initialize (keeping the session id the server hands back), notifications/initialized,
// then tools/list and tools/call. Replies come as JSON or as a server-sent event stream; both are read. The server has to
// allow this page's origin (CORS), and expose Mcp-Session-Id if it uses sessions. Images in a result land on the screen.
async function post(body, notify) {
  const h = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
  if (L.sid) h["mcp-session-id"] = L.sid; if (L.token) h.authorization = "Bearer " + L.token;
  const r = await fetch(L.url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const sid = r.headers.get("mcp-session-id"); if (sid) L.sid = sid;
  if (notify) return { status: r.status };
  const ct = r.headers.get("content-type") || "", txt = await r.text();
  if (!r.ok) throw new Error(r.status + " " + r.statusText + (txt ? ": " + txt.slice(0, 300) : ""));
  if (ct.includes("text/event-stream")) {   // the reply is one of the events: the message with our id
    for (const chunk of txt.split(/\r?\n\r?\n/)) { const data = chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n"); if (!data) continue;
      try { const m = JSON.parse(data); if (m.id === body.id) return m; } catch (e) {} }
    throw new Error("the event stream ended without a reply");
  }
  return JSON.parse(txt);
}
async function connect() {
  L.url = $("lurl").value.trim(); L.token = $("ltok").value.trim(); L.sid = ""; L.ready = false; L.tools = [];
  if (!/^https?:\/\//.test(L.url)) return lstat("Enter the server's URL, starting https://", true);
  try { localStorage.setItem("pmcp:url", L.url); sessionStorage.setItem("pmcp:token", L.token); } catch (e) {}
  lstat("Connecting…");
  try {
    const init = { jsonrpc: "2.0", id: S.id++, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Phone MCP console", version: "2.0" } } };
    log("req", "→ POST " + L.url, init); const r = await post(init); log(r.error ? "err" : "res", "←", r);
    if (r.error) throw new Error(r.error.message || "initialize failed");
    L.name = (r.result && r.result.serverInfo && (r.result.serverInfo.name + " " + (r.result.serverInfo.version || ""))) || "MCP server";
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, true);
    L.ready = true; lstat("Connected to " + L.name + (L.sid ? " · session " + L.sid.slice(0, 8) : "")); await live("tools/list", {});
  } catch (e) {
    lstat(/Failed to fetch|NetworkError|Load failed/i.test(String(e.message)) ? "Couldn't reach it. Check the URL, that the server is up, and that it allows this page's origin (CORS)." : String(e.message || e), true);
    log("err", "← " + (e.message || e));
  }
}
async function live(method, params) {
  if (!L.ready) return lstat("Connect first.", true);
  const req = { jsonrpc: "2.0", id: S.id++, method, params }; log("req", "→ POST " + L.url, req);
  try {
    const r = await post(req), shown = JSON.parse(JSON.stringify(r, (k, v) => (k === "data" && typeof v === "string" && v.length > 120 ? "[" + Math.round(v.length * 0.75 / 1024) + " KB, shown on the screen]" : v)));
    log(r.error || (r.result && r.result.isError) ? "err" : "res", "←", shown);
    if (method === "tools/list" && r.result) { L.tools = r.result.tools || []; toolMenu(); setArgs(); lstat("Connected to " + L.name + " · " + L.tools.length + " tools"); }
    if (method === "tools/call" && r.result) shot(r.result.content || []);
  } catch (e) { log("err", "← " + (e.message || e)); }
}
function shot(content) {   // what a tool returned, on the phone's screen: an image if there is one, else its text
  const img = content.find((c) => c.type === "image" && c.data), txt = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  $("screen").innerHTML = img ? '<img class="shot" alt="What the tool returned" src="data:' + esc(img.mimeType || "image/png") + ";base64," + esc(img.data) + '">' : '<pre class="out">' + esc(txt || "(no output)") + "</pre>";
}
const lstat = (t, bad) => { const el = $("lstat"); if (el) { el.textContent = t; el.classList.toggle("bad", !!bad); } };
function mode(on) {
  L.on = on; document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", (b.dataset.m === "live") === on));
  document.body.classList.toggle("is-live", on);
  if (on) { $("chain").innerHTML = '<div class="node live"><b><i></i>Your MCP server</b><small>Streamable HTTP · JSON-RPC 2.0</small>'
      + '<label>Server URL<input id="lurl" type="url" placeholder="https://your-tunnel.trycloudflare.com/mcp" value="' + esc(L.url) + '" autocomplete="url"></label>'
      + '<label>Bearer token <em>(if it needs one; kept for this tab only)</em><input id="ltok" type="password" value="' + esc(L.token) + '" autocomplete="off"></label>'
      + '<button id="lgo" class="btn pri">Connect</button><p id="lstat" class="lstat" role="status">' + (L.ready ? "Connected to " + esc(L.name) : "Not connected") + '</p>'
      + '<p class="hint">Any MCP server that speaks Streamable HTTP and allows this page\'s origin works: a phone over Termux and a tunnel, as here, or anything else. Images it returns, such as screenshots, appear on the screen.</p></div>';
    $("lgo").onclick = connect; $("lurl").onkeydown = (e) => { if (e.key === "Enter") connect(); };
    $("ep").textContent = L.ready ? L.url : ""; $("screen").innerHTML = '<pre class="out">Connect to your server, list its tools, then call one.</pre>';
  } else { chain(); draw(); }
  toolMenu(); setArgs();
}
document.getElementById("mode").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) mode(b.dataset.m === "live"); });
$("send").addEventListener("click", () => { let a = {}; try { a = JSON.parse($("args").value || "{}"); } catch (e) { return log("err", "arguments aren't valid JSON"); } rpc("tools/call", { name: $("tool").value, arguments: a }); });

// ── the (simulated) phone ──
const PX = (v, max, el) => (v / max) * el; // device pixels (1080×2340) to the mock screen
async function call(name, a) {
  const scr = $("screen");
  switch (name) {
    case "screenshot": { const f = document.createElement("div"); f.className = "flash"; scr.appendChild(f); setTimeout(() => f.remove(), 400); return "PNG 1080x2340 · 1.42 MB (exec-out, not shell: shell mangles binary on CRLF hosts)"; }
    case "tap": { const r = scr.getBoundingClientRect(), x = PX(+a.x || 0, 1080, r.width), y = PX(+a.y || 0, 2340, r.height); const d = document.createElement("div"); d.className = "tapdot"; d.style.left = x + "px"; d.style.top = y + "px"; scr.appendChild(d); setTimeout(() => d.remove(), 700);
      if (!S.app) { const el = document.elementFromPoint(r.left + x, r.top + y), ap = el && el.closest("[data-pkg]"); if (ap) { S.app = ap.dataset.pkg; draw(); return "tapped " + a.x + "," + a.y + " → opened " + ap.dataset.name; } } return "tapped " + a.x + "," + a.y; }
    case "swipe": return "swiped " + a.x1 + "," + a.y1 + " → " + a.x2 + "," + a.y2 + " in " + (a.ms || 300) + "ms";
    case "type_text": if (S.app !== "com.google.android.apps.messaging") return "typed " + JSON.stringify(a.text) + " (no text field in focus: nothing visible changed)"; S.text = String(a.text || ""); draw(); return "typed " + JSON.stringify(a.text);
    case "key_event": { const k = String(a.key || "").toUpperCase(); if (k === "HOME" || k === "BACK") { S.app = null; S.text = ""; draw(); } if (k === "ENTER" && S.text) { S.sms.push({ me: 1, t: S.text }); S.text = ""; draw(); } return "key " + k; }
    case "launch_app": { const ap = APPS.find((x) => x[1] === a.package); if (!ap) return "Error: package not found: " + a.package; S.app = ap[1]; draw(); return "Events injected: 1 · " + ap[0] + " in front"; }
    case "list_apps": return APPS.map((x) => "package:" + x[1]).join("\n");
    case "foreground_app": return S.app ? S.app : "com.sec.android.app.launcher";
    case "sms_send": { if (!(await gate("send an SMS to " + a.to + ": “" + String(a.text).slice(0, 60) + "”"))) return "declined by the user"; S.sms.push({ me: 1, t: String(a.text || "") }); if (S.app === "com.google.android.apps.messaging") draw(); return "likely sent (termux-sms-send handed the message off and timed out after 10 s; reported as likely sent so it isn't retried)"; }
    case "sms_list": return JSON.stringify([{ from: "+15555550199", body: "Are we still on for 7?", date: "today 18:02" }, ...S.sms.slice(-2).map((m) => ({ to: "+15555550123", body: m.t }))].slice(0, +a.limit || 3));
    case "battery": return JSON.stringify({ percentage: S.batt, status: "CHARGING", temperature: 31.2, health: "GOOD" });
    case "gps": return JSON.stringify({ latitude: 45.5231, longitude: -122.6765, accuracy: 12, provider: "network" });
    case "clipboard_get": return S.clip || "(empty)";
    case "clipboard_set": S.clip = String(a.text || ""); return "clipboard set";
    case "notifications": return JSON.stringify(S.notif.map((n) => ({ title: n.split(":")[0], content: n.split(": ").slice(1).join(": ") })));
    default: return "Error: unknown tool " + name;
  }
}
function gate(what) { const g = $("gate"); g.hidden = false; g.innerHTML = "The server asks first: <b>" + esc(what) + '</b><br><button class="yes">Allow</button><button>Deny</button>'; return new Promise((ok) => { g.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; g.hidden = true; ok(b.classList.contains("yes")); }; }); }
function draw() {
  $("dev").classList.toggle("off", S.doze || S.adb !== "ok"); $("batt").textContent = S.batt + "% ⚡";
  const ap = APPS.find((x) => x[1] === S.app);
  if (!ap) $("screen").innerHTML = '<div class="grid">' + APPS.map((x) => '<div class="app" data-pkg="' + x[1] + '" data-name="' + x[0] + '"><i style="background:' + x[3] + '">' + x[2] + "</i>" + x[0] + "</div>").join("") + "</div>";
  else if (ap[0] === "Messages") $("screen").innerHTML = '<div class="appview"><h4>💬 Messages · Sam</h4><div style="align-self:flex-start;background:#272a36;padding:5px 9px;border-radius:12px">Are we still on for 7?</div>' + S.sms.map((m) => '<div class="bubble">' + esc(m.t) + "</div>").join("") + '<div class="field">' + (S.text ? esc(S.text) : '<span style="color:#6b7086">Text message</span>') + "</div></div>";
  else $("screen").innerHTML = '<div class="appview"><h4>' + ap[2] + " " + ap[0] + '</h4><p style="color:#8b90a6">' + (ap[0] === "Termux" ? "~ $ python server.py<br>MCP on :8765 · Streamable HTTP + SSE<br>15 tools registered" : "(open)") + "</p></div>";
}
setInterval(() => { const d = new Date(); $("clock").textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }, 10000);
chain(); draw(); log("note", "Pick a tool and send it, or list them all. Break a link on the left and try again.");
window.PhoneMCP = { S, rpc, call };
})();
