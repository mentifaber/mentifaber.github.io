// Genesis · Studio: one conversation with any model, plus web search, page reading, images, video, voice and pictures.
// Conversations stay on this device; keys stay on the server.
(() => {
"use strict";
const $ = (id) => document.getElementById(id), esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LS = { get(k, d) { try { const v = localStorage.getItem("hive:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("hive:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
const api = async (path, body, signal, ms) => { if (ms && !signal && window.AbortSignal && AbortSignal.timeout) signal = AbortSignal.timeout(ms); const r = await fetch("/api/hive" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal } : { cache: "no-store", signal }); const j = await r.json().catch(() => ({ error: "the server said " + r.status })); if (!r.ok && !j.error) j.error = "the server said " + r.status; return j; };
const toast = (t, ms) => { const e = $("toast"); e.textContent = t; e.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add("hidden"), ms || 2600); };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "#"); // only real web links leave the page
const SV = { up: "Good", down: "Off", swarm: "Build it", copy: "Copy", say: "Listen", redo: "Again", dl: "Download" }; // the actions under an answer, in words

// ── theme ──
const applyTheme = () => { const l = LS.get("theme", "dark") === "light"; document.documentElement.dataset.theme = l ? "light" : "dark"; const tc = document.querySelector("meta[name=theme-color]"); if (tc) tc.content = l ? "#e9eae4" : "#0d1012"; }; // basalt (dark) by default, limestone by day
applyTheme(); $("theme").onclick = () => { const t = LS.get("theme", "dark") === "light" ? "dark" : "light"; LS.set("theme", t); applyTheme(); toast(t === "light" ? "Limestone" : "Basalt"); };

// ── views ──
let owner = false, gname = "", busyAt = 0; // gname: Genesis, the mind the owner talks to (visitors talk to plain Genesis)
function route() {
  const v = (location.hash.slice(1) || (new URLSearchParams(location.search).get("p") ? "swarm" : "studio")).split("?")[0].split("/")[0]; // "#mind/genesis": a view and a part of it
  const view = ["studio", "swarm", "keys", "mind"].includes(v) ? v : "studio";
  for (const s of ["studio", "swarm", "keys", "mind"]) $("v-" + s).classList.toggle("hidden", s !== view);
  document.querySelectorAll("#realms a").forEach((a) => { a.classList.toggle("on", a.dataset.v === view); if (a.dataset.v === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (view === "swarm") window.HiveSwarm.show(); else window.HiveSwarm.hide();
  if (view === "keys") Keys.load();
  if (view === "mind") MindV.load();
  if (view === "studio" && !matchMedia("(pointer:coarse)").matches) setTimeout(() => $("inp").focus({ preventScroll: true }), 50); // not on phones: it would raise the keyboard
}
addEventListener("hashchange", route);

// ── models ──
async function loadModels() {
  const j = await api("/models").catch(() => ({ models: [] })); owner = !!j.owner; models = j.models || []; gname = owner && j.genesis || ""; if (gname) $("greet").innerHTML = "<em class='gn'>" + esc(gname) + "</em> is listening."; else named();
  if (j.resting) { const t = new Date(j.resting).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); models.forEach((m) => { if (m.id.startsWith("workers-ai|")) m.group = "Cloudflare Workers AI (free) · resting until " + t; }); }
  const sel = $("model"), groups = {}; for (const m of models) (groups[m.group] = groups[m.group] || []).push(m);
  sel.innerHTML = Object.entries(groups).map(([g, ms]) => "<optgroup label='" + esc(g) + "'>" + ms.map((m) => "<option value='" + esc(m.id) + "'>" + esc(m.name) + "</option>").join("") + "</optgroup>").join("") || "<option value=''>No models available</option>";
  const want = (chat && chat.model) || LS.get("model", ""); if (models.some((m) => m.id === want)) sel.value = want; else { const d = models.find((m) => /gpt-oss-120b/.test(m.id)) || models[0]; if (d) sel.value = d.id; }
  if (j.resting && j.standIn && sel.value.startsWith("workers-ai|")) { sel.value = j.standIn; toast("Cloudflare's free allowance is resting, so AutoFaber switched to " + nameOf(j.standIn), 5000); }
  $("mtot").textContent = models.length + " models"; showPick();
  const pg = {}; for (const m of models) { const k = m.group.split(" · resting")[0]; (pg[k] = pg[k] || { label: (() => { let x = k.replace(/\s*\(.*?\)/g, "").replace(/ ••.*$/, ""); if (x.includes(" · ")) x = x.split(" · ").pop(); x = x.replace(/^Cloudflare /, ""); return x.charAt(0).toUpperCase() + x.slice(1); })(), n: 0, free: m.id.startsWith("workers-ai|") }).n++; }
  const gl = Object.values(pg); $("esub").textContent = models.length + " minds from " + gl.length + " provider" + (gl.length === 1 ? "" : "s") + ". One, a council, or a whole swarm.";
  $("t-models").textContent = models.length + " minds · " + gl.length + " provider" + (gl.length === 1 ? "" : "s"); $("t-free").textContent = j.resting ? "resting" : "online"; $("led-free").className = "led " + (j.resting ? "warn" : "ok");
  stone(); tele();
  $("who").textContent = owner ? (j.search ? "owner · " + j.search + " search key" + (j.search > 1 ? "s" : "") : "owner") : "";
  $("quota").textContent = owner ? "" : "Visitors get the free models and a daily allowance.";
}
let models = [];
// the AutoFaber mark on an empty Studio: the orbits are every mind it can reach, the AF the one that answers
const stone = () => { if (!window.HiveFX) return;
  const fam = new Set(models.map((m) => HiveFX.mineralName(m.id))).size;
  $("gcap").innerHTML = "<b>" + models.length + " minds</b> on call, " + fam + " famil" + (fam === 1 ? "y" : "ies") + ".<br>The orbits are every mind AutoFaber can reach; the AF at their heart is the one that answers you."; };
// live telemetry in the header and the side panel
let lastMs = 0, lastTtft = 0, lastCps = 0; window.tele = () => tele();
function tele() {
  const modes = [on("web") && "search", on("council") && "council", on("draw") && "imagine"].filter(Boolean), layers = chat ? chat.msgs.filter((m) => m.role === "user").length : 0;
  $("tele").innerHTML = [modes.length ? "<b>" + modes.join(" + ") + "</b>" : "", lastTtft ? "first word <b>" + (lastTtft / 1000).toFixed(2) + "s</b>" : lastMs ? "<b>" + (lastMs / 1000).toFixed(1) + "s</b>" : "", lastCps ? "<b>" + lastCps + "</b> ch/s" : "", layers ? "<b>" + layers + "</b> layer" + (layers === 1 ? "" : "s") : ""].filter(Boolean).join(" · ");
}
const link = () => { const ok = navigator.onLine !== false; $("t-link").textContent = ok ? "online" : "offline"; $("led-link").className = "led " + (ok ? "ok" : "bad"); };
addEventListener("online", link); addEventListener("offline", link); link();
// the picker: thousands of models, searchable
const nameOf = (id) => { const m = models.find((x) => x.id === id); return m ? m.name : "Choose a model"; };
// minerals: each family of minds is one (assets/hive/field.js), so who laid a layer down shows at a glance; the whole page
// takes the mineral of the mind you're talking to
const pollen = (id) => (window.HiveFX ? HiveFX.mineral(id) : "var(--m-flint)");
const showPick = () => { $("mname").textContent = nameOf($("model").value); const pc = $("mpollen"), m = pollen($("model").value); if (pc) pc.style.setProperty("--pc", m); document.documentElement.style.setProperty("--m", m); };
function drawPick() {
  const q = $("mq").value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), named = (m) => words.every((w) => m.name.toLowerCase().includes(w)) ? 0 : 1;
  const hit = models.filter((m) => words.every((w) => (m.name + " " + m.group + " " + m.id).toLowerCase().includes(w))).map((m, i) => [m, i]).sort((a, b) => (words.length ? named(a[0]) - named(b[0]) : 0) || a[1] - b[1]).map((x) => x[0]); // names first: "gemma" means Gemma, not a model built on it
  const groups = {}; for (const m of hit) (groups[m.group] = groups[m.group] || []).push(m); let shown = 0;
  $("mlist").innerHTML = Object.entries(groups).map(([g, ms]) => "<h6>" + esc(g) + " · " + ms.length + "</h6>" + ms.slice(0, q ? 200 : 60).map((m) => (shown++, "<button role='option' data-m='" + esc(m.id) + "' class='" + (m.id === $("model").value ? "on" : "") + "'><i class='pollen' style='--pc:" + pollen(m.id) + "'></i>" + esc(m.name) + (m.vision ? "<span class='tg'>sees</span>" : "") + "</button>")).join("")).join("") || "<p class='dim sm' style='padding:10px'>No model matches.</p>";
  $("mcount").textContent = hit.length + " of " + models.length + " models" + (shown < hit.length ? " · showing " + shown + ", search to narrow" : "");
}
$("mpick").onclick = (e) => { e.stopPropagation(); const o = $("mpop").classList.toggle("hidden"); if (!o) { $("mq").value = ""; drawPick(); $("mq").focus(); } };
$("mq").oninput = drawPick; $("mpop").onclick = (e) => e.stopPropagation();
$("mq").onkeydown = (e) => { if (e.key === "Enter") { const b = $("mlist").querySelector("[data-m]"); if (b) b.click(); } if (e.key === "Escape") $("mpop").classList.add("hidden"); };
$("mlist").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; $("model").value = b.dataset.m; $("model").onchange(); $("mpop").classList.add("hidden"); };
document.addEventListener("click", () => $("mpop").classList.add("hidden"));
$("model").onchange = () => { showPick(); LS.set("model", $("model").value); if (chat) { chat.model = $("model").value; save(); } };

// ── chats ──
let chats = LS.get("chats", []), chat = null;
const save = () => { chats.sort((a, b) => b.ts - a.ts); chats = chats.slice(0, 80); if (!LS.set("chats", chats)) { for (const c of chats.slice(10)) for (const m of c.msgs) { delete m.image; m.thumbs = []; } LS.set("chats", chats); } drawHist(); };
// the lattice behind the app hears what happens here (assets/hive/lattice.js)
const fx = (name, detail) => { try { dispatchEvent(new CustomEvent("af:" + name, { detail })); } catch (e) {} };
const turns = () => (chat ? chat.msgs.filter((x) => x.role !== "user" && !x.pending && !x.error).length : 0);
function drawHist() {
  const q = ($("hsearch").value || "").trim().toLowerCase(), list = q ? chats.filter((c) => (c.title + " " + c.msgs.map((m) => m.text || "").join(" ")).toLowerCase().includes(q)) : chats;
  const day = (t) => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], d.getFullYear() === n.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" }); };
  $("hist").innerHTML = list.map((c) => { const n = c.msgs.filter((m) => m.role === "user").length, last = [...c.msgs].reverse().find((m) => m.role !== "user" && m.model), mid = (last && last.model) || c.model || "";
    return "<div data-c='" + esc(c.id) + "' class='sess" + (chat && chat.id === c.id ? " on" : "") + "' style='--m:" + pollen(mid) + "' tabindex='0' role='button'><time>" + esc(day(c.ts)) + "</time><span class='strip'></span><span class='t'>" + (window.Lattice ? Lattice.sigil(c.id, n + 2) : "") + "<span>" + esc(c.title || "Untitled") + "</span><small>" + n + " layer" + (n === 1 ? "" : "s") + (mid ? " · " + esc(String(mid).split("|").pop().split("/").pop()) : "") + "</small></span><button data-del title='Delete this session' aria-label='Delete'>✕</button></div>"; }).join("")
    || "<p>" + (q ? "Nothing down there matches “" + esc(q) + "”." : "Nothing beneath yet. Every session you start settles here.") + "</p>";
}
$("hist").onclick = (e) => { const d = e.target.closest("[data-c]"); if (!d) return; if (e.target.closest("[data-del]")) { chats = chats.filter((c) => c.id !== d.dataset.c); if (chat && chat.id === d.dataset.c) newChat(); save(); return; } openChat(d.dataset.c); };
$("hist").onkeydown = (e) => { if (e.key === "Enter" && e.target.matches("[data-c]")) openChat(e.target.dataset.c); };
// an empty surface shows the greeting, the seams and the geode; a session shows its layers
const ground = (empty) => { $("empty").classList.toggle("hidden", !empty); $("lede").classList.toggle("hidden", !empty); $("welcome").classList.toggle("hidden", !empty || !!LS.get("intro", 0)); };
// who they are, in their own words: a name, a line about them, how long they like answers. Kept on this device, sent with each message.
const me = () => LS.get("me", {}), hello = () => { const h = new Date().getHours(); return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
function named() { const n = me().name; if (!gname && n) $("greet").innerHTML = esc(hello()) + ", <em>" + esc(n) + "</em>."; }
function setMe(m) { const o = { name: String(m.name || "").trim().slice(0, 40), about: String(m.about || "").trim().slice(0, 200), len: m.len === "short" || m.len === "long" ? m.len : "" }; LS.set("me", o); named(); return o; }
{ const m = me(); $("w-name").value = m.name || ""; $("w-about").value = m.about || "";
  const lens = [...document.querySelectorAll("#welcome .wlen button")], pickLen = (v) => lens.forEach((b) => { b.classList.toggle("on", b.dataset.len === v); b.setAttribute("aria-checked", b.dataset.len === v); }); pickLen(m.len || "");
  lens.forEach((b) => (b.onclick = () => pickLen(b.dataset.len)));
  const done = () => { LS.set("intro", 1); $("welcome").classList.add("hidden"); $("inp").focus(); };
  $("w-form").onsubmit = (e) => { e.preventDefault(); setMe({ name: $("w-name").value, about: $("w-about").value, len: (lens.find((b) => b.classList.contains("on")) || {}).dataset?.len }); done(); };
  $("w-skip").onclick = done; }
function newChat() { if (window.Lattice) Lattice.grow(0); chat = null; $("log").innerHTML = ""; ground(true); greet(); drawHist(); tele(); if (location.hash !== "#studio") location.hash = "studio"; else route(); $("scroll").scrollTop = 0; }
function openChat(id) { chat = chats.find((c) => c.id === id); if (!chat) return newChat(); if (chat.model && models.some((m) => m.id === chat.model)) { $("model").value = chat.model; showPick(); } ground(false); $("log").innerHTML = ""; chat.msgs.forEach((m, i) => drawMsg(m, i, true)); drawHist(); tele(); if (window.Lattice) Lattice.grow(turns(), chat.id); if (location.hash !== "#studio") location.hash = "studio"; else route(); $("scroll").scrollTop = 0; }
$("newchat").onclick = newChat; $("hsearch").oninput = drawHist;
function greet() {
  const ideas = [["Council", "Several minds argue it out; one merges the best", "What's the best way to learn a new programming language fast? Disagree with each other if you need to.", false, false, false, true], ["Search", "The live web, with its sources in the margin", "What are the most important AI developments this week?", true], ["Imagine", "A picture from your words", "A forge in the dark where gold filament is spun into a glowing lattice, sparks drifting up, cinematic macro photograph", false, true], ["Build", "Code a small working thing", "Write a tiny snake game in one HTML file."], ["Swarm", "Agents plan, build and review a whole project", null, false, false, false, false, true], ["Voice", "Talk with it, hands-free", null, false, false, true]];
  const tint = ["var(--m-azurite)", "var(--m-malachite)", "var(--m-rhodo)", "var(--m-citrine)", "var(--m-jasper)", "var(--m-selenite)"];
  $("starters").innerHTML = ideas.map((x, i) => "<li><button data-i='" + i + "'><i style='--c:" + tint[i] + "'></i><b>" + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></button></li>").join("");
  $("starters").onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; const x = ideas[+b.dataset.i]; if (x[7]) { location.hash = "swarm"; return; } if (x[5]) return Voice.start(); setTog("web", !!x[3]); setTog("draw", !!x[4]); setTog("council", !!x[6]); $("inp").value = x[2]; send(); }; }

// ── markdown (small, safe: everything is escaped first) ──
// a finished answer's code is checked where it can be, in the browser: JavaScript and JSON parse, HTML tags close,
// CSS braces balance. Nothing is run; a ✓ means it parses, a ⚠ says what doesn't.
function checkCode(lang, body) {
  const l = String(lang || "").toLowerCase(), t = String(body || "");
  try {
    if (/^(js|javascript|mjs|cjs|node)$/.test(l)) {
      const src = /^\s*(import|export)\b/m.test(t) ? t.replace(/^\s*import\b[^\n;]*;?|^\s*export\s+(default\s+)?/gm, "") : t; // a module: its imports and exports set aside
      try { new Function(src); } catch (e) { if (/await/.test(e.message)) new (Object.getPrototypeOf(async function () {}).constructor)(src); else throw e; } return [1, "parses"];
    }
    if (l === "json") { JSON.parse(t); return [1, "valid JSON"]; }
    if (/^html?$/.test(l)) { const st = []; for (const m of t.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").matchAll(/<(\/?)(html|head|body|div|section|main|header|footer|nav|article|aside|ul|ol|table|form|svg|button|select|textarea|template)\b[^>]*?(\/?)>/gi)) { if (m[3]) continue; if (!m[1]) st.push(m[2].toLowerCase()); else { const k = st.lastIndexOf(m[2].toLowerCase()); if (k < 0) return [0, "a stray </" + m[2] + ">"]; st.length = k; } }
      if ((t.match(/<script\b/gi) || []).length !== (t.match(/<\/script>/gi) || []).length) return [0, "a <script> isn't closed"]; return st.length ? [0, "<" + st[st.length - 1] + "> isn't closed"] : [1, "tags close"]; }
    if (l === "css") { let d = 0; for (const c of t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, "")) { if (c === "{") d++; else if (c === "}" && --d < 0) break; } return d ? [0, "braces don't balance"] : [1, "braces balance"]; }
  } catch (e) { return [0, String(e.message || e).slice(0, 120)]; }
  return null;
}
function md(src, sources, done) {
  const blocks = [], code = []; md.bad = 0;
  let s = String(src || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (_, lang, body) => { code.push([lang, body.replace(/\n$/, "")]); return "\u0000C" + (code.length - 1) + "\u0000"; });
  s = esc(s);
  const inline = (t) => t.replace(/`([^`\n]+)`/g, (_, c) => "<code>" + c + "</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>").replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, u) => "<a href='" + u + "' target='_blank' rel='noopener noreferrer'>" + a + "</a>")
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => p + "<a href='" + u + "' target='_blank' rel='noopener'>" + u + "</a>")
    .replace(/\[(\d{1,2})\]/g, (m, n) => { const x = sources && sources[n - 1]; if (x) return "<a class='cite' href='" + esc(safeUrl(x.url)) + "' target='_blank' rel='noopener' title='" + esc(x.title) + "'>" + n + "</a>"; md.bad = (md.bad || 0) + 1; return ""; }); // a citation with no source behind it is dropped, and counted
  const lines = s.split("\n"); let i = 0, out = "";
  while (i < lines.length) {
    const l = lines[i];
    if (/^\u0000C\d+\u0000$/.test(l.trim())) { out += l.trim(); i++; continue; }
    if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length; out += "<h" + n + ">" + inline(l.slice(n + 1)) + "</h" + n + ">"; i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) { out += "<hr>"; i++; continue; }
    if (/^&gt; ?/.test(l)) { let q = []; while (i < lines.length && /^&gt; ?/.test(lines[i])) q.push(lines[i++].replace(/^&gt; ?/, "")); out += "<blockquote>" + inline(q.join("<br>")) + "</blockquote>"; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) { const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim())); const h = row(l); i += 2; let t = "<table><tr>" + h.map((c) => "<th>" + c + "</th>").join("") + "</tr>"; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t += "<tr>" + row(lines[i++]).map((c) => "<td>" + c + "</td>").join("") + "</tr>"; out += t + "</table>"; continue; }
    if (/^\s*([-*+]|\d+[.)]) /.test(l)) { const ol = /^\s*\d/.test(l); let items = []; while (i < lines.length && (/^\s*([-*+]|\d+[.)]) /.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) { if (/^\s*([-*+]|\d+[.)]) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)]) /, "")); else items[items.length - 1] += " " + lines[i].trim(); i++; } out += (ol ? "<ol>" : "<ul>") + items.map((x) => "<li>" + inline(x) + "</li>").join("") + (ol ? "</ol>" : "</ul>"); continue; }
    if (!l.trim()) { i++; continue; }
    let p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4} |&gt;|\s*([-*+]|\d+[.)]) |\u0000C)/.test(lines[i])) p.push(lines[i++]); if (!p.length) p.push(lines[i++]);
    out += "<p>" + inline(p.join("<br>")) + "</p>";
  }
  const note = done && md.bad ? "<div class='cknote' title='The model cited sources that weren&#39;t gathered for this answer'>⚠ " + md.bad + " citation" + (md.bad > 1 ? "s" : "") + " pointed at no source and " + (md.bad > 1 ? "were" : "was") + " removed</div>" : "";
  return note + out.replace(/\u0000C(\d+)\u0000/g, (_, n) => { const [lang, body] = code[n]; return "<div class='pre'><header><span>" + esc(lang || "code") + "</span><span>" + (/^html?$/i.test(lang) ? "<button data-run='" + n + "'>Preview</button>" : "") + "<button data-copy='" + n + "'>Copy</button></span></header>" + ((ck) => ck ? "<div class='ck " + (ck[0] ? "ok" : "bad") + "' title='Checked in your browser, not run'>" + (ck[0] ? "✓ " : "⚠ ") + esc(ck[1]) + (ck[0] ? "" : " <button data-fixck='" + n + "' data-err='" + esc(ck[1]) + "' data-lang='" + esc(lang || "code") + "'>Fix it</button>") + "</div>" : "")(done ? checkCode(lang, body) : null) + "<pre><code>" + esc(body) + "</code></pre></div>"; });
}
const codeOf = (el, n) => { const m = chat && chat.msgs[+el.closest(".m").dataset.i]; const all = []; String(m && m.text || "").replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (_, l, b) => all.push(b.replace(/\n$/, ""))); return all[n] || ""; };

// ── drawing messages: each question and its answer are one layer; layers stack newest first, under the surface ──
const when = (t) => { if (!t) return ""; const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
function layerOf(i) {
  let k = i; while (k > 0 && chat.msgs[k] && chat.msgs[k].role !== "user") k--;
  let ex = $("log").querySelector(".ex[data-x='" + k + "']");
  if (!ex) {
    ex = document.createElement("article"); ex.className = "ex core"; ex.dataset.x = k;
    const n = chat.msgs.slice(0, k + 1).filter((m) => m.role === "user").length, u = chat.msgs[k];
    ex.innerHTML = "<div class='rail'><b class='lyr'>" + String(n).padStart(2, "0") + "</b><time>" + esc(when(u && u.ts) || "") + "</time></div><div class='strip'></div><div class='bed'></div>";
    const below = [...$("log").children].find((e) => +e.dataset.x < k); $("log").insertBefore(ex, below || null);
  }
  return ex;
}
function drawMsg(m, i, quiet) {
  const ex = layerOf(i), bed = ex.querySelector(".bed"), d = document.createElement("div"); d.className = "m " + (m.role === "user" ? "user" : "ai"); d.dataset.i = i;
  if (!quiet && m.role === "user") { ex.classList.add("fresh"); }
  if (m.role === "user") { const t = m.show || m.text || ""; if (t.length > 320 || t.split("\n").length > 6) d.classList.add("long");
    d.innerHTML = (m.thumbs && m.thumbs.length ? "<div class='thumbs'>" + m.thumbs.map((t) => "<img src='" + esc(t) + "' alt=''>").join("") + "</div>" : "") + (m.files && m.files.length ? "<div class='tools'>" + m.files.map((f) => "<span>" + esc(f) + "</span>").join("") + "</div>" : "") + (t ? "<div class='b'>" + esc(t) + "</div>" : "") + "<div class='uacts'><button data-uact='edit' title='Edit and send again'>Edit</button><button data-uact='copy' title='Copy'>Copy</button></div>"; }
  else {
    const mid = String(m.model || $("model").value || ""), who = "<div class='who-line'><i class='gem'></i><b>" + esc(mid.split("|").pop().split("/").pop()) + "</b><span>" + esc(gname || "AutoFaber") + (m.council ? " · council" : "") + "</span></div>";
    const body = m.pending && !m.text ? who + "<div class='dots'>" + "<i></i>".repeat(m.council ? 5 : 3) + "</div>" + (m.steps && m.steps.length || m.status ? "<div class='tools'>" + (m.steps || []).map((t) => "<span class='did'>" + esc(t) + "</span>").join("") + (m.status ? "<span class='now'>" + esc(m.status) + "</span>" : "") + "</div>" : "")
      : m.pending ? who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + "<div class='b'>" + md(m.text, m.sources).replace(/(<\/[a-z0-9]+>)?$/, "<span class='caret'></span>$1") + "</div>"
      : m.error ? who + "<p class='err'>" + esc(m.error) + "</p>"
      : who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + "<div class='b'>" + (m.image ? "<img class='gen' src='" + esc(m.image) + "' alt='" + esc(m.text) + "'><p class='dim' style='font-size:14px;margin-top:8px'>" + esc(m.text) + "</p>" : md(m.text, m.sources, true)) + "</div>" +
        (m.drafts && m.drafts.length ? "<details class='drafts'><summary>" + m.drafts.filter((x) => x.text).length + " council drafts" + (m.drafts.some((x) => x.error) ? " · " + m.drafts.filter((x) => x.error).length + " couldn't answer (open to see why)" : "") + "</summary><div class='grid-d'>" + m.drafts.map((x) => "<div class='d" + (x.error ? " err" : "") + "' style='--dm:" + pollen(x.model) + "'><h5>" + esc(x.model.split("|").pop().split("/").pop()) + " · " + (x.ms / 1000).toFixed(1) + "s</h5><div class='b'>" + (x.error ? esc(x.error) : md(x.text)) + "</div></div>").join("") + "</div></details>" : "") +
        (m.sources && m.sources.length ? "<div class='srcs'>" + m.sources.map((s, k) => "<a href='" + esc(safeUrl(s.url)) + "' target='_blank' rel='noopener noreferrer'><b>" + (k + 1) + "</b><span>" + esc(s.title) + "</span></a>").join("") + "</div>" : "");
    d.innerHTML = body + (m.pending ? "" : "<div class='acts'>" + (m.image ? "<button data-act='dl'>" + SV.dl + "</button>" : m.error ? "" : "<button data-act='copy'>" + SV.copy + "</button><button data-act='say' title='Read it aloud'>" + SV.say + "</button>") + (m.cut && !m.error ? "<button data-act='more' class='more' title='Pick up exactly where it stopped'>Continue</button>" : "") + "<button data-act='redo' title='Ask again'>" + SV.redo + "</button>" + (m.image || m.error ? "" : "<button data-act='swarm' title='Hand this to the swarm to build'>" + SV.swarm + "</button>") + (owner && m.turn ? "<button data-act='up' class='rate" + (m.rating > 0 ? " on" : "") + "' title='Good answer: " + esc(gname) + " learns from this' aria-pressed='" + (m.rating > 0) + "'>" + SV.up + "</button><button data-act='down' class='rate" + (m.rating < 0 ? " on" : "") + "' title='Not right: tell " + esc(gname) + " what to change' aria-pressed='" + (m.rating < 0) + "'>" + SV.down + "</button>" : "") + (m.model ? "<span class='meta'>" + (m.ttft ? "first word " + (m.ttft / 1000).toFixed(2) + "s · " : "") + (m.ms ? (m.ms / 1000).toFixed(1) + "s" : "") + "</span>" : "") + "</div>");
    // the strip: the mind's mineral; dashed when it searched, fine lines for a picture, banded by every member of a council
    ex.style.setProperty("--m", pollen(mid)); ex.classList.toggle("pending", !!m.pending); ex.classList.toggle("failed", !!m.error); ex.classList.toggle("img", !!m.image || (m.pending && /paint/.test(m.status || "")));
    const u = chat.msgs[+ex.dataset.x]; ex.classList.toggle("web", !!(u && u.web)); ex.classList.toggle("council", !!m.council);
    if (m.drafts && m.drafts.length) { const ds = m.drafts.filter((x) => x.text), n = ds.length + 1, cols = [pollen(mid), ...ds.map((x) => pollen(x.model))]; ex.style.setProperty("--strata", "linear-gradient(180deg," + cols.map((c, k) => c + " " + (k * 100 / n).toFixed(1) + "% " + ((k + 1) * 100 / n).toFixed(1) + "%").join(",") + ")"); }
  }
  const old = bed.querySelector(".m[data-i='" + i + "']"); if (old) old.replaceWith(d); else bed.appendChild(d);
  return d;
}
const scrollEnd = (now) => { if (now) $("scroll").scrollTo({ top: 0, behavior: "smooth" }); }; // the newest layer is just under the surface: nothing to chase
const unlayer = (k) => { $("log").querySelectorAll(".m").forEach((n) => +n.dataset.i >= k && n.remove()); $("log").querySelectorAll(".ex").forEach((x) => !x.querySelector(".m") && x.remove()); };
$("log").onclick = async (e) => {
  const c = e.target.closest("[data-copy]"), r = e.target.closest("[data-run]"), a = e.target.closest("[data-act]");
  if (c) { navigator.clipboard.writeText(codeOf(c, +c.dataset.copy)).then(() => { c.textContent = "Copied"; setTimeout(() => (c.textContent = "Copy"), 1400); }); return; }
  const fk = e.target.closest("[data-fixck]"); // a block that failed its check: ask for it corrected, in full
  if (fk) { if (busy) return toast("Wait for the current answer first"); return send("The " + fk.dataset.lang + " block (number " + (+fk.dataset.fixck + 1) + " in your last answer) doesn't check out: " + fk.dataset.err + ". Send the corrected block in full, nothing else."); }
  if (r) { const w = window.open("", "_blank"); if (w) { w.document.open(); w.document.write(codeOf(r, +r.dataset.run)); w.document.close(); } return; }
  const ua = e.target.closest("[data-uact]");
  if (ua && chat) { const k = +ua.closest(".m").dataset.i, um = chat.msgs[k]; if (ua.dataset.uact === "copy") { navigator.clipboard.writeText(um.show || um.text || ""); return toast("Copied"); }
    if (busy) return toast("Wait for the reply to finish"); inp.value = um.show || um.text || ""; grow(); sync(); chat.msgs.splice(k); unlayer(k); save(); if (!chat.msgs.length) ground(true); inp.focus(); return toast("Edit and send again"); }
  if (!a || !chat) return; const i = +a.closest(".m").dataset.i, m = chat.msgs[i];
  if (a.dataset.act === "copy") { navigator.clipboard.writeText(m.text || ""); toast("Copied"); }
  if (a.dataset.act === "say") Voice.say(plain(m.text));
  if (a.dataset.act === "dl") { const x = document.createElement("a"); x.href = m.image; x.download = "hive-" + Date.now() + ".jpg"; x.click(); }
  if (a.dataset.act === "swarm") { const u = chat.msgs[i - 1], brief = ((u && u.text) || "") + "\n\nWhat we worked out so far:\n" + String(m.text || "").slice(0, 4000);
    if (!confirm("Release the swarm on this? It splits the work into tasks and builds it.")) return; const j = await api("/new", { brief }); if (j.error) return toast(j.error, 4000);
    try { const mm = JSON.parse(localStorage.getItem("hive-mine") || "{}"); mm[j.id] = j.ctok; localStorage.setItem("hive-mine", JSON.stringify(mm)); } catch (x) {} history.replaceState(null, "", "/hive-app?p=" + j.id + "#swarm"); route(); return; }
  if (a.dataset.act === "up" || a.dataset.act === "down") { // 👍/👎: Genesis reads these when it reflects
    const up = a.dataset.act === "up", r = up ? (m.rating > 0 ? 0 : 1) : (m.rating < 0 ? 0 : -1); let note = "";
    if (r < 0) { note = prompt("What should " + gname + " do differently? (optional, it reads this when it reflects)") ; if (note === null) return; }
    const j = await api("/genesis/rate", { turn: m.turn, rating: r, note: note || undefined }); if (j.error) return toast(j.error);
    m.rating = r; save(); drawMsg(m, i); if (r) toast(r > 0 ? "Noted: " + gname + " keeps doing that" : gname + " will learn from this", 2400); return; }
  if (a.dataset.act === "more") { if (i !== chat.msgs.length - 1) return toast("Continue works on the latest answer"); return send(resume(chat.msgs[i].text)); }
  if (a.dataset.act === "redo") { const u = chat.msgs[i - 1]; if (!u || u.role !== "user") return; chat.msgs.splice(i); unlayer(i); run(u.mode === "image"); }
};
const SAY_AS = Object.fromEntries("NATO NASA NOAA GDACS OPEC UNESCO ASEAN UNICEF FEMA LIDAR RADAR SCUBA LASER COVID AIDS GIF JPEG ASCII CAPTCHA WIFI OK AM PM NOT AND THE YOU ARE BUT FOR NOW NEW ALL ONE TWO YES NO STOP GO NOTE WARNING ALERT HELP".split(" ").map((w) => [w, 1]));
// say it like this: "Anders = Onders", one per line (Settings → Voice link), so names come out the way their owners say them
const sayAs = () => String(S("say") || "").split("\n").map((l) => l.split("=").map((x) => x.trim())).filter((x) => x.length === 2 && x[0] && x[1]);
const respell = (t) => sayAs().reduce((s, [w, how]) => s.replace(new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"), how), t);
const speakable = (t) => respell(String(t || "")).replace(/https?:\/\/\S+/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/[\u2010\u2011\u2012]/g, "-").replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2").replace(/(\w)–(\w)/g, "$1-$2").replace(/\s*—\s*|\s+–\s+/g, ", ")
  .replace(/≈|~(?=\s?\d)/g, "about ").replace(/±/g, " plus or minus ").replace(/×/g, " times ").replace(/→|->/g, " to ").replace(/&/g, " and ").replace(/(\d)\s?%/g, "$1 percent")
  .replace(/°\s?F\b/g, " degrees Fahrenheit").replace(/°\s?C\b/g, " degrees Celsius").replace(/°/g, " degrees").replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is").replace(/\betc\./gi, "et cetera").replace(/\bvs\.?\s/gi, "versus ")
  .replace(/(\d)\s?km\/h\b/g, "$1 kilometers per hour").replace(/(\d)\s?mph\b/g, "$1 miles per hour").replace(/(\d)\s?km\b/g, "$1 kilometers").replace(/(\d)\s?nm\b/g, "$1 nautical miles").replace(/(\d)\s?ft\b/g, "$1 feet").replace(/(\d)\s?kts?\b/g, "$1 knots").replace(/(\d)\s?h\b/g, "$1 hours").replace(/(\d)\s?min\b/g, "$1 minutes")
  .replace(/\bM\s?(\d\.\d)\b/g, "magnitude $1").replace(/\bKp\b/g, "K P").replace(/(\d(?:\.\d+)?)\s?([KMBT])\b/g, (m, n, u) => n + " " + { K: "thousand", M: "million", B: "billion", T: "trillion" }[u])
  .replace(/\b[A-Z]{2,5}\b/g, (w) => (SAY_AS[w] ? w : w.split("").join(" "))).replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").trim(); // tickers and initialisms letter by letter (X O M), words like NATO as words
const plain = (t) => String(t || "").replace(/```[\s\S]*?```/g, " (code) ").replace(/[#*_`>|]/g, "").replace(/\[(\d+)\]/g, "").replace(/\]\([^)]*\)/g, "]").replace(/\s+/g, " ").trim();

// ── attachments ──
let att = []; // {kind:'image'|'video'|'file', name, data(dataURL)|frames[{t,data}]|text, thumb}
const shrink = (src, max, q) => new Promise((ok, no) => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL("image/jpeg", q || .85)); }; img.onerror = () => no(new Error("can't read that image")); img.src = src; });
const readAs = (f, how) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r[how](f); });
async function addImage(f) { const u = URL.createObjectURL(f); try { const data = await shrink(u, 1280), thumb = await shrink(u, 160, .7); att.push({ kind: "image", name: f.name || "image", data, thumb }); } catch (e) { toast(e.message); } URL.revokeObjectURL(u); drawAtt(); }
async function addVideo(f) {
  const v = document.createElement("video"), u = URL.createObjectURL(f); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = u; toast("Sampling frames…", 8000);
  try {
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error("this browser can't open that video")); });
    const n = Math.max(2, Math.min(8, Math.ceil(v.duration / 4))), frames = [];
    for (let k = 0; k < n; k++) { const t = Math.min(v.duration - .05, (v.duration * (k + .5)) / n); await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; }); const c = document.createElement("canvas"), sc = Math.min(1, 768 / Math.max(v.videoWidth, v.videoHeight)); c.width = v.videoWidth * sc; c.height = v.videoHeight * sc; c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); frames.push({ t: t.toFixed(1) + "s", data: c.toDataURL("image/jpeg", .8) }); }
    att = att.filter((a) => a.kind !== "video"); att.push({ kind: "video", name: f.name, frames, thumb: await shrink(frames[0].data, 160, .7), dur: v.duration }); toast(n + " frames from " + Math.round(v.duration) + "s of video");
  } catch (e) { toast(e.message); }
  URL.revokeObjectURL(u); drawAtt();
}
async function addFile(f) { if (f.size > 400000) return toast(f.name + " is too big (400 KB max)"); att.push({ kind: "file", name: f.name, text: await readAs(f, "readAsText") }); drawAtt(); }
const addAny = (f) => (/^image\//.test(f.type) ? addImage(f) : /^video\//.test(f.type) ? addVideo(f) : addFile(f));
function drawAtt() { $("att").innerHTML = att.map((a, i) => "<div class='chip" + (a.thumb ? "" : " fileonly") + "'>" + (a.thumb ? "<img src='" + a.thumb + "' alt=''>" : "") + "<span class='t'>" + esc(a.name) + "<small>" + (a.kind === "video" ? a.frames.length + " frames · " + Math.round(a.dur) + "s" : a.kind === "file" ? Math.ceil(a.text.length / 1000) + "k chars" : "image") + "</small></span><button class='x' data-x='" + i + "' aria-label='Remove'>✕</button></div>").join(""); sync(); }
$("att").onclick = (e) => { const x = e.target.closest("[data-x]"); if (x) { att.splice(+x.dataset.x, 1); drawAtt(); } };
$("plus").onclick = (e) => { e.stopPropagation(); $("plusm").classList.toggle("hidden"); };
document.addEventListener("click", () => $("plusm").classList.add("hidden"));
$("plusm").onclick = (e) => { const b = e.target.closest("[data-a]"); if (b) $("f-" + b.dataset.a).click(); };
for (const k of ["image", "video", "file", "camera"]) $("f-" + k).onchange = (e) => { [...e.target.files].forEach(addAny); e.target.value = ""; };
$("inp").addEventListener("paste", (e) => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); fs.forEach(addAny); } });
const cmp = $("composer"); ["dragenter", "dragover"].forEach((t) => document.addEventListener(t, (e) => { if ($("v-studio").classList.contains("hidden")) return; e.preventDefault(); cmp.classList.add("drag"); }));
["dragleave", "drop"].forEach((t) => document.addEventListener(t, (e) => { cmp.classList.remove("drag"); if (t === "drop" && e.dataTransfer && e.dataTransfer.files.length && !$("v-studio").classList.contains("hidden")) { e.preventDefault(); [...e.dataTransfer.files].forEach(addAny); } }));

// ── composer ──
const inp = $("inp"), grow = () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, innerHeight * .4) + "px"; };
const sync = () => { $("sendb").disabled = !busy && !inp.value.trim() && !att.length; };
inp.addEventListener("input", () => { grow(); sync(); fx("type"); });
inp.addEventListener("keydown", (e) => { if (e.key !== "Enter" || e.shiftKey || e.isComposing) return; const mod = e.metaKey || e.ctrlKey; if (mod || (S("enter") && !matchMedia("(pointer:coarse)").matches)) { e.preventDefault(); send(); } });
const setTog = (id, v) => { $(id).setAttribute("aria-pressed", v ? "true" : "false"); if (id === "draw") { inp.placeholder = v ? "Describe a picture…" : "Ask anything…  ( / for commands )"; $("sendb").textContent = busy ? "Stop" : v ? "Paint" : "Ask"; } if (window.tele) tele(); };
$("web").onclick = () => { setTog("web", $("web").getAttribute("aria-pressed") !== "true"); if ($("web").getAttribute("aria-pressed") === "true") setTog("draw", false); };
$("council").onclick = () => { setTog("council", $("council").getAttribute("aria-pressed") !== "true"); if (on("council")) setTog("draw", false); };
$("draw").onclick = () => { setTog("draw", $("draw").getAttribute("aria-pressed") !== "true"); if ($("draw").getAttribute("aria-pressed") === "true") setTog("web", false); };
const on = (id) => $(id).getAttribute("aria-pressed") === "true";
["web", "council", "draw"].forEach((id) => $(id).addEventListener("click", () => setTimeout(tele)));
let busy = null; // AbortController while a reply is coming
$("sendb").onclick = () => (busy ? Date.now() - busyAt > 1500 && busy.abort() : send()); // a quick second tap on send isn't a stop

// The continuation arrives as its own message, so it must reopen whatever the cut left open or it renders as loose text.
function resume(t) {
  t = String(t || ""); const fences = t.match(/^\s*```.*$/gm) || [], last = t.trimEnd().split("\n").slice(-1)[0] || "";
  let how = "Don't repeat anything you already wrote and don't add a preamble.";
  if (fences.length % 2) how += " You stopped inside a code block: start your reply with " + fences[fences.length - 1].trim() + " on its own line, then carry on from the next line of code (rewrite the last line whole if it was cut mid-line), and close the block when it's done.";
  else if (/^\s*\|/.test(last)) { const rows = t.trimEnd().split("\n"); let h = -1; for (let k = rows.length - 1; k > 0; k--) if (/^\s*\|?\s*:?-{3,}/.test(rows[k]) && /^\s*\|/.test(rows[k - 1])) { h = k; break; }
    if (h > 0) how += " You stopped inside a table: start your reply with its header row and separator again (" + rows[h - 1].trim() + " / " + rows[h].trim() + "), then carry on from the next row" + (/\|\s*$/.test(last) ? "" : ", rewriting the last, unfinished row whole") + "."; }
  return "Continue exactly where you stopped. " + how;
}
function send(text, opts) {
  opts = opts || {}; text = (text != null ? text : inp.value).trim(); if (busy || (!text && !att.length)) return;
  const sl = /^\/(\w+)\s*([\s\S]*)$/.exec(text); // slash commands: /search /council /imagine /swarm /model /new /keep /teach /remember
  if (sl) { const [, c, rest] = sl;
    if (c === "new") { inp.value = ""; return newChat(); }
    if (c === "me" || c === "mind") { inp.value = ""; grow(); location.hash = "mind"; return; }
    if (c === "teach" && rest) { inp.value = ""; grow(); return api("/genesis/teach", { text: rest }).then((j) => toast(j.error || (gname || "AutoFaber") + " learned it", 3000)); }
    if (c === "keep" && rest) { inp.value = ""; grow(); const r = rest.trim(), isUrl = /^https?:\/\/\S+$/.test(r); toast("Keeping it in your library…", 2000); // into the library, by link or as text
      return api("/library/add", isUrl ? { url: r } : { text: r }).then((j) => toast(j.error || "Kept “" + j.title + "” in your library (" + j.chunks + " passage" + (j.chunks === 1 ? "" : "s") + ")", 4000)); }
    if (c === "remember" && rest) { inp.value = ""; grow(); return api("/mind/remember", { text: rest }).then((j) => toast(j.error || "Remembered", 2500)); }
    if (c === "model") { const q = rest.toLowerCase(), m = models.find((x) => x.name.toLowerCase() === q) || models.find((x) => (x.name + " " + x.group).toLowerCase().includes(q)); inp.value = ""; grow(); if (!m) return toast("No model matches “" + rest + "”"); $("model").value = m.id; $("model").onchange(); return toast("Model: " + m.name); }
    if (c === "swarm") { inp.value = ""; grow(); if (!rest) { location.hash = "swarm"; return; } return api("/new", { brief: rest }).then((j) => { if (j.error) return toast(j.error, 4000); try { const mm = JSON.parse(localStorage.getItem("hive-mine") || "{}"); mm[j.id] = j.ctok; localStorage.setItem("hive-mine", JSON.stringify(mm)); } catch (x) {} history.replaceState(null, "", "/hive-app?p=" + j.id + "#swarm"); route(); }); }
    const map = { search: "web", web: "web", council: "council", imagine: "draw", draw: "draw" };
    if (map[c] && rest) { setTog("web", c === "search" || c === "web" ? true : on("web") && map[c] !== "draw"); setTog("council", map[c] === "council"); setTog("draw", map[c] === "draw"); text = rest; }
  }
  if (!$("model").value && !on("draw")) return toast("No model is available right now");
  if (!chat) { chat = { id: Math.random().toString(36).slice(2, 10), title: (text || att.map((a) => a.name).join(", ")).slice(0, 60), model: $("model").value, msgs: [], ts: Date.now() }; chats.unshift(chat); ground(false); }
  const files = att.filter((a) => a.kind === "file"), imgs = att.filter((a) => a.kind === "image"), vid = att.find((a) => a.kind === "video");
  const full = text + files.map((f) => "\n\n" + f.name + ":\n```\n" + f.text.slice(0, 100000) + "\n```").join("");
  const u = { role: "user", text: full, show: text, files: files.map((f) => f.name), thumbs: [...imgs, ...(vid ? [vid] : [])].map((a) => a.thumb), mode: on("draw") ? "image" : "chat", web: on("web"), council: on("council") && !on("draw"), voice: !!opts.voice, ts: Date.now() };
  u._images = opts.images || (vid ? vid.frames.map((f) => f.data) : imgs.map((a) => a.data)); u._frames = vid ? vid.frames.map((f) => f.t) : null;
  if (opts.images) { u.thumbs = opts.images.slice(); u.live = true; }
  chat.msgs.push(u); drawMsg(u, chat.msgs.length - 1); chat.ts = Date.now();
  inp.value = ""; att = []; drawAtt(); grow(); save(); scrollEnd(true);
  return run(u.mode === "image", opts);
}
async function run(image, opts) {
  opts = opts || {}; const u = chat.msgs[chat.msgs.length - 1], i = chat.msgs.length, m = { role: "assistant", pending: true, status: image ? "painting…" : u.council ? "the council is drafting…" : u.web ? "searching the web…" : (u._images && u._images.length) ? (u._frames ? "watching the video…" : "looking…") : /https?:\/\//.test(u.text) ? "reading the page…" : "" };
  chat.msgs.push(m); drawMsg(m, i); scrollEnd(true); busy = new AbortController(); busyAt = Date.now(); $("sendb").classList.add("stop"); $("sendb").disabled = false; $("sendb").textContent = "Stop";
  const t0 = Date.now(); let j; m.council = !!u.council; m.model = opts.model || $("model").value;
  const body = { me: me().name || me().about || me().len ? me() : undefined, lang: navigator.language || "en", model: opts.model || $("model").value, live: !!(opts.live || u.live) || undefined, web: u.web, swarm: !!u.council, voice: !!opts.voice || u.voice, frames: u._frames || undefined, system: [LS.get("sys", ""), (opts.voice || u.voice) && sayAs().length ? "HOW NAMES ARE SAID (the owner taught you; your words are read aloud through this list): " + sayAs().map(([w, h]) => w + " sounds like “" + h + "”").join("; ") + ". If asked how to say one, say it that way." : ""].filter(Boolean).join("\n\n") || undefined,
    cid: chat.id, sid: Math.random().toString(36).slice(2) + Date.now().toString(36), messages: chat.msgs.slice(0, -1).filter((x) => !x.error && !x.image).map((x, k, arr) => ({ role: x.role, text: x.text, images: k === arr.length - 1 ? x._images || [] : [] })) };
  // while the answer is being prepared, show what Genesis is doing (planning, searching, reading…) as it happens
  let polls = 0; const was = m.status, watchSteps = image ? 0 : setInterval(async () => {
    if (!m.pending || m.text || ++polls > 120) return clearInterval(watchSteps);
    const s = await api("/steps?sid=" + body.sid).catch(() => null); if (!s || !m.pending || m.text) return;
    const st = s.now ? s.now + "…" : (s.steps.length ? null : was); if (JSON.stringify([s.steps, st]) === JSON.stringify([m.steps, m.status])) return;
    m.steps = s.steps; m.status = st; if (chat.msgs[i] === m) drawMsg(m, i);
  }, 700);
  fx("think", { at: $("composer") });
  try {
    if (image) j = await api("/imagine", { prompt: u.text }, busy.signal);
    else if (u.council) j = await api("/chat", body, busy.signal);
    else j = await stream(body, m, i, busy.signal);
  } catch (e) { j = { error: e.name === "AbortError" ? (m.text ? null : "Stopped.") : m.text ? null : "Couldn't reach AutoFaber. Check your connection.", text: m.text && e.name !== "AbortError" ? m.text + "\n\n_(the connection dropped here)_" : m.text }; if (j.error === null) { delete j.error; j.tools = m.tools; j.sources = m.sources; j.turn = m.turn; } }
  clearInterval(watchSteps); delete m.steps; if (chat) fx("done", { n: turns() + 1, seed: chat.id });
  busy = null; $("sendb").classList.remove("stop"); $("sendb").textContent = on("draw") ? "Paint" : "Ask"; sync();
  delete m.pending; delete m.status;
  delete m.streaming;
  if (j.error) m.error = j.error; else if (image) { m.image = j.image; m.text = u.text; m.model = "flux-1-schnell"; } else Object.assign(m, { text: j.text + (j.cut && !body.voice ? "\n\n_(cut off at the model's length limit: say “continue” for the rest)_" : ""), cut: j.cut || undefined, sources: j.sources, tools: j.tools, drafts: j.drafts, model: j.model || opts.model || $("model").value, turn: j.turn || m.turn });
  m.ms = Date.now() - t0; lastMs = m.ms; lastTtft = m.ttft || 0; lastCps = m.text && m.ttft && m.ms > m.ttft ? Math.round(m.text.length / ((m.ms - m.ttft) / 1000)) : 0; tele();
  if (chat.msgs[i] === m) { drawMsg(m, i); scrollEnd(); } delete u._images; save();
  return m;
}
// Esc stops a reply that's still coming
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && busy && !Voice.on && !$("cmdk").open && !$("sdlg").open) busy.abort(); });
// streamed replies: server-sent events meta → delta… → done; the message redraws at most once a frame
async function stream(body, m, i, signal) {
  const tReq = performance.now();
  const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, stream: true }), signal });
  if (!/event-stream/.test(r.headers.get("content-type") || "")) { const j = await r.json().catch(() => ({ error: "the server said " + r.status })); if (!r.ok && !j.error) j.error = "the server said " + r.status; return j; }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = { text: "" }, raf = 0, lastWord = Date.now(), stalled = false; const tStart = Date.now() - (performance.now() - tReq);
  const watch = setInterval(() => { if (Date.now() - lastWord > (body.voice ? 35000 : 150000)) { stalled = true; clearInterval(watch); rd.cancel().catch(() => {}); } }, 2000); // keep-alive pings don't count: only words do
  m.text = ""; m.streaming = true;
  const paint = () => { raf = 0; if (chat && chat.msgs[i] === m) { drawMsg(m, i); scrollEnd(); } };
  for (;;) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let k; while ((k = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, k); buf = buf.slice(k + 2); const ev = (/^event: (.*)$/m.exec(chunk) || [])[1], data = (/^data: (.*)$/m.exec(chunk) || [])[1]; if (!ev || !data) continue; let d; try { d = JSON.parse(data); } catch (e) { continue; }
      if (ev === "meta") { lastWord = Date.now(); m.tools = d.tools; m.sources = d.sources; if (d.model) m.model = d.model; if (d.turn) m.turn = out.turn = d.turn; out.sources = d.sources; out.tools = d.tools; out.model = d.model; }
      else if (ev === "delta") { lastWord = Date.now(); if (!m.ttft) { m.ttft = Date.now() - tStart; } m.text += d.t; out.text = m.text; fx("token"); if (!raf) raf = requestAnimationFrame(paint); if (body.voice && Voice.live) { Voice.feed(m.text); if (Voice.playing) Voice.set("Speaking…", plain(m.text).slice(-280)); } }
      else if (ev === "done") { out.tools = d.tools || out.tools; out.model = d.model || out.model; out.turn = d.turn || out.turn; out.cut = !!d.cut; }
      else if (ev === "error") { if (!m.text) return { error: d.error }; out.text = m.text + "\n\n_(" + d.error + ")_"; }
    }
  }
  clearInterval(watch);
  if (stalled && !out.text) return { error: "The model went quiet and never answered. Try again, or pick another model." };
  if (stalled) out.text += "\n\n_(the model went quiet here)_";
  return out;
}
// ── command palette (⌘K) ──
const CMDS = () => [
  ["New session", "⇧⌘O", () => newChat()], ["Studio", "view", () => (location.hash = "studio")], ["Swarm", "view", () => (location.hash = "swarm")], ["Uplinks · keys", "view", () => (location.hash = "keys")], ["Mind · what AutoFaber knows about you", "view", () => (location.hash = "mind")], ["Analyze me", "mind", () => { location.hash = "mind"; MindV.analyze(); }],
  ["Toggle search", "mode", () => $("web").click()], ["Toggle council", "mode", () => $("council").click()], ["Toggle imagine", "mode", () => $("draw").click()],
  ["Voice link", "voice", () => Voice.start()], ["Export session", "markdown", () => $("export").click()], ["Settings", "voice · stone · data", () => openSettings()], ["Basalt or limestone", "light or dark", () => $("theme").click()],
  ...chats.map((c) => [c.title || "Untitled", "session · " + new Date(c.ts).toLocaleDateString([], { month: "short", day: "numeric" }), () => openChat(c.id)]),
  ...models.map((m) => [m.name, "model · " + m.group.replace(/ ••.*$/, ""), () => { $("model").value = m.id; $("model").onchange(); toast("Model: " + m.name); }]),
];
let csel = 0, chits = [];
function drawCmds() {
  const q = $("cq").value.trim().toLowerCase(), ws = q.split(/\s+/).filter(Boolean); chits = CMDS().filter((c) => ws.every((w) => (c[0] + " " + c[1]).toLowerCase().includes(w))).slice(0, q ? 60 : 12); csel = Math.min(csel, Math.max(0, chits.length - 1));
  $("clist").innerHTML = chits.map((c, k) => "<button data-k='" + k + "' class='" + (k === csel ? "on" : "") + "'>" + esc(c[0]) + "<small>" + esc(c[1]) + "</small></button>").join("") || "<p class='dim sm' style='padding:10px'>Nothing matches.</p>";
}
const openCmd = () => { $("cq").value = ""; csel = 0; drawCmds(); if (!$("cmdk").open) $("cmdk").showModal(); $("cq").focus(); };
const runCmd = (k) => { const c = chits[k]; if (!c) return; $("cmdk").close(); c[2](); };
$("cq").oninput = () => { csel = 0; drawCmds(); };
$("cq").onkeydown = (e) => { if (e.key === "ArrowDown") { csel = Math.min(chits.length - 1, csel + 1); drawCmds(); e.preventDefault(); } if (e.key === "ArrowUp") { csel = Math.max(0, csel - 1); drawCmds(); e.preventDefault(); } if (e.key === "Enter") { e.preventDefault(); runCmd(csel); } };
$("clist").onclick = (e) => { const b = e.target.closest("[data-k]"); if (b) runCmd(+b.dataset.k); };
$("cmdk").onclick = (e) => { if (e.target === $("cmdk")) $("cmdk").close(); };
$("cmdk-btn").onclick = openCmd;
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); } });
window.HiveMD = md;
$("export").onclick = () => { if (!chat) return toast("Nothing to export yet"); const t = "# " + chat.title + "\n\n" + chat.msgs.map((m) => (m.role === "user" ? "**You:** " : "**AutoFaber:** ") + (m.image ? "![image](generated)" : m.text || m.error || "") + (m.sources && m.sources.length ? "\n\n" + m.sources.map((s, k) => "[" + (k + 1) + "] " + s.url).join("\n") : "")).join("\n\n---\n\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/markdown" })); a.download = chat.title.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 50) + ".md"; a.click(); };
$("settings").onclick = () => openSettings();
$("ssave").onclick = () => { LS.set("sys", $("sys").value.trim()); $("sdlg").close(); };
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newChat(); } if (e.key === "/" && document.activeElement === document.body) { e.preventDefault(); inp.focus(); } });

// ── voice: recording, transcription, speech ──
const toWav = async (blob) => { // any recording → 16 kHz mono WAV, which Whisper always takes
  const ac = new (window.AudioContext || window.webkitAudioContext)(), buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close && ac.close();
  const rate = 16000, len = Math.ceil(buf.duration * rate), off = new OfflineAudioContext(1, len, rate), src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(); const pcm = (await off.startRendering()).getChannelData(0);
  const dv = new DataView(new ArrayBuffer(44 + pcm.length * 2)), w = (o, s) => [...s].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
  for (let k = 0; k < pcm.length; k++) dv.setInt16(44 + k * 2, Math.max(-1, Math.min(1, pcm[k])) * 0x7fff, true);
  return readAs(new Blob([dv], { type: "audio/wav" }), "readAsDataURL");
};
// ── settings (this device) ──
const SET = { rate: 1, sil: 900, hands: "1", barge: false, recog: "cloud", vmodel: "", motion: true, enter: true, say: "Anders = Onders" };
const S = (k) => LS.get("set:" + k, SET[k]), setS = (k, v) => LS.set("set:" + k, v);
const motion = () => document.body.classList.toggle("still", !S("motion")); motion();

// Records until stop(), or with vad until the speaker has been quiet a moment. One microphone stream is kept open for a
// whole voice session (no permission round-trip per turn); dictation opens its own.
const AC = window.AudioContext || window.webkitAudioContext;
async function record(opt) {
  const own = !opt.stream, stream = opt.stream || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
  let an = opt.an, ac = null; if (!an) { ac = new AC(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); }
  const rec = new MediaRecorder(stream), chunks = [], data = new Uint8Array(an.fftSize); let spoke = false, quietSince = 0, raf = 0, t0 = performance.now(), done;
  const finished = new Promise((ok) => (done = ok));
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { cancelAnimationFrame(raf); if (own) stream.getTracks().forEach((t) => t.stop()); if (ac) ac.close(); done(spoke || !opt.vad ? new Blob(chunks, { type: rec.mimeType }) : null); };
  const tick = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) s += (v - 128) ** 2; const lv = Math.min(1, Math.sqrt(s / data.length) / 30), now = performance.now(); opt.level && opt.level(lv);
    if (opt.vad) { if (lv > .16) { spoke = true; quietSince = 0; } else if (spoke && !quietSince) quietSince = now;
      if ((spoke && quietSince && now - quietSince > (opt.silence || 900)) || now - t0 > 60000 || (!spoke && now - t0 > 20000)) return rec.state === "recording" && rec.stop(); }
    raf = requestAnimationFrame(tick); };
  rec.start(100); tick();
  return { stop: () => rec.state === "recording" && rec.stop(), finished };
}
async function stt(blob) { const j = await api("/stt", { audio: await toWav(blob), lang: (navigator.language || "en").slice(0, 2) }); if (j.error) throw new Error(j.error); return j.text; }

// dictation: live browser recognition when there is one, otherwise record → Whisper
let dict = null;
$("mic").onclick = async () => {
  if (dict) return dict.stop();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, base = inp.value ? inp.value.replace(/\s*$/, " ") : "";
  $("mic").classList.add("rec");
  if (SR && !navigator.brave) { const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US"; r.onresult = (e) => { inp.value = base + [...e.results].map((x) => x[0].transcript).join(""); grow(); sync(); }; r.onend = () => { dict = null; $("mic").classList.remove("rec"); inp.focus(); }; r.onerror = (e) => e.error !== "no-speech" && toast("Mic: " + e.error); dict = { stop: () => r.stop() }; r.start(); return; }
  try { const h = await record({}); dict = h; const blob = await h.finished; dict = null; $("mic").classList.remove("rec"); toast("Transcribing…"); inp.value = base + (await stt(blob)); grow(); sync(); inp.focus(); }
  catch (e) { dict = null; $("mic").classList.remove("rec"); toast(e.message || "No microphone"); }
};

// ── voice link: listen → transcribe → answer (streamed) → speak sentence by sentence → listen again ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Voice = (window.HiveVoice = {
  on: false, h: null, audio: null, mode: "idle", lv: 0,
  set(state, text) { $("vstate").textContent = state; if (text != null) $("vtext").textContent = text; Voice.mode = /Thinking|Transcrib/.test(state) ? "think" : /Speaking/.test(state) ? "talk" : /Listening|Hold/.test(state) ? "listen" : "idle"; },
  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast("This browser can't record audio");
    if (location.hash !== "#studio") location.hash = "studio";
    Voice.ac = Voice.ac || new AC(); Voice.ac.resume && Voice.ac.resume(); // unlocked by this tap, so replies can play
    if (!Voice.outAn) { Voice.outAn = Voice.ac.createAnalyser(); Voice.outAn.fftSize = 256; Voice.outAn.connect(Voice.ac.destination); }
    try { Voice.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return toast("Microphone blocked: allow it for this site"); }
    Voice.micAn = Voice.ac.createAnalyser(); Voice.micAn.fftSize = 256; Voice.ac.createMediaStreamSource(Voice.mic).connect(Voice.micAn);
    try { Voice.ear = window.HiveEars ? await window.HiveEars.open(Voice.ac, Voice.mic) : null; } catch (e) { Voice.ear = null; } // assets/hive/ears.js; without it, the old recorder
    Voice.on = true; Voice.paused = false; $("voiceo").classList.remove("hidden"); Voice.ui(); viz.start(); Voice.loop();
  },
  ui() {
    const ptt = S("hands") === "0"; $("vptt").classList.toggle("hidden", !ptt); $("vmute").classList.toggle("hidden", ptt);
    $("vmute").setAttribute("aria-pressed", Voice.paused ? "true" : "false"); $("vmutel").textContent = Voice.paused ? "Paused" : "Live";
    $("vmodel").textContent = (voiceModel() || $("model").value || "").split("|").pop().split("/").pop() || "Voice link";
    $("vhint").textContent = ptt ? "hold the button while you talk" : S("barge") ? "talk over it to interrupt" : "tap to interrupt";
    $("vscreen").classList.toggle("hidden", !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || matchMedia("(pointer:coarse)").matches);
  },
  async listen() { // one turn of the user speaking → text (or null)
    if (S("recog") === "device" && (window.SpeechRecognition || window.webkitSpeechRecognition) && !navigator.brave) return Voice.listenDevice();
    const ptt = S("hands") === "0";
    if (ptt) { Voice.set("Hold to talk", ""); await new Promise((ok) => (Voice.pttGo = ok)); if (!Voice.on) return null; }
    Voice.set("Listening…", "");
    if (!Voice.ear) return Voice.listenRec();
    const t = Voice.ear.turn({ engine: S("recog") === "whisper" ? "whisper" : "flux", ptt, silence: +S("sil") || 900, guard: ptt ? 0 : 450, keyterm: gname || "AutoFaber", lang: (navigator.language || "en").slice(0, 2),
      onStart: () => Voice.set("Listening…", ""), onPartial: (x) => { $("vtext").textContent = x; }, onSend: () => Voice.set("Transcribing…"), onWait: () => Voice.set("Listening…", ""), onError: (m) => toast("Couldn't hear that: " + m) });
    if (ptt) Voice.pttStop = () => Voice.ear && Voice.ear.stop();
    const r = await t; Voice.pttStop = null;
    if (!Voice.on || Voice.paused || !r) return null;
    Voice.sttMs = r.sttMs || 0; Voice.heardBy = r.engine; return r.text;
  },
  async listenRec() { // browsers where the ears can't open: record, then Whisper
    let blob; try { Voice.h = await record({ vad: S("hands") !== "0", stream: Voice.mic, an: Voice.micAn, silence: S("sil"), level: (lv) => (Voice.lv = lv) }); if (S("hands") === "0") Voice.pttStop = () => Voice.h && Voice.h.stop(); blob = await Voice.h.finished; }
    catch (e) { Voice.set("Microphone error", e.message); return null; }
    Voice.h = null; if (!Voice.on || Voice.paused || !blob) return null;
    Voice.set("Transcribing…"); const t0 = performance.now();
    try { const text = await stt(blob); Voice.sttMs = performance.now() - t0; Voice.heardBy = "whisper"; return window.HiveEars && window.HiveEars.phantom(text, 1000) ? null : text; } catch (e) { Voice.set("Couldn't hear that", e.message); await sleep(1200); return null; }
  },
  listenDevice() { // browser recognition: live captions while you talk
    return new Promise((ok) => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition, r = new SR(); r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = false; let fin = "";
      Voice.set("Listening…", ""); r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(""); fin = t; $("vtext").textContent = t; Voice.lv = .4 + Math.random() * .3; };
      r.onerror = () => {}; r.onend = () => { Voice.lv = 0; Voice.sttMs = 0; ok(fin.trim() || null); }; Voice.h = { stop: () => r.stop() }; r.start(); });
  },
  async loop() {
    while (Voice.on && !Voice.paused) {
      const text = await Voice.listen(); if (!Voice.on || Voice.paused) return; if (!text || text.trim().length < 2) continue;
      $("vtext").textContent = "“" + text + "”"; Voice.set("Thinking…");
      const frame = await Voice.frame(); Voice.hush(); Voice.spoken = 0; Voice.live = true; Voice.t0 = performance.now(); Voice.first = 0;
      const m = await send(text, { voice: true, model: voiceModel(), images: frame ? [frame] : null, live: !!frame }); Voice.live = false; if (!Voice.on) return;
      if (!m || m.error) { Voice.set("That one didn't go through", m && m.error); Voice.say(/per-minute|busy|overloaded/i.test(m && m.error || "") ? "Everyone's busy for a moment. Try me again in a few seconds." : "That one didn't go through. Say it again?"); await Voice.drained(); await sleep(400); continue; }
      Voice.feed(m.cut ? String(m.text || "").replace(/[^.!?…]*$/, "") || m.text : m.text || "", true); if (Voice.q.length || Voice.playing) Voice.set("Speaking…");
      if (S("barge") && S("hands") !== "0") Voice.watchBarge();
      await Voice.drained();
    }
  },
  watchBarge() { // talking over the reply cuts it off and starts the next turn
    let loud = 0; const d = new Uint8Array(Voice.micAn.fftSize);
    const t = setInterval(() => { if (!Voice.playing) return clearInterval(t); if (Voice.ear) loud = Voice.ear.loud; else { Voice.micAn.getByteTimeDomainData(d); let s = 0; for (const v of d) s += (v - 128) ** 2; const lv = Math.sqrt(s / d.length) / 30; loud = lv > .32 ? loud + 50 : 0; } if (loud >= 350) { clearInterval(t); Voice.hush(); } }, 50);
  },
  // ── eyes: the camera or a shared screen; one frame goes with each turn ──
  async cam(on, facing) {
    Voice.stopVideo(); if (!on) return;
    try { Voice.vs = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing || Voice.facing || "user", width: { ideal: 1280 } }, audio: false }); }
    catch (e) { toast("Camera blocked: allow it for this site"); return; }
    Voice.facing = facing || Voice.facing || "user"; Voice.src = "cam"; const v = $("cam"); v.srcObject = Voice.vs; v.classList.remove("hidden"); v.classList.toggle("mirror", Voice.facing === "user"); await v.play().catch(() => {});
    $("vcam").setAttribute("aria-pressed", "true"); $("vflip").classList.remove("hidden");
  },
  async screen() {
    Voice.stopVideo(); try { Voice.vs = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch (e) { return; }
    Voice.src = "screen"; const v = $("cam"); v.srcObject = Voice.vs; v.classList.remove("hidden", "mirror"); await v.play().catch(() => {}); $("vscreen").setAttribute("aria-pressed", "true");
    Voice.vs.getVideoTracks()[0].onended = () => Voice.stopVideo();
  },
  stopVideo() { if (Voice.vs) Voice.vs.getTracks().forEach((t) => t.stop()); Voice.vs = null; Voice.src = null; $("cam").classList.add("hidden"); $("cam").srcObject = null; ["vcam", "vscreen"].forEach((id) => $(id).setAttribute("aria-pressed", "false")); $("vflip").classList.add("hidden"); },
  async frame() { const v = $("cam"); if (!Voice.vs || !v.videoWidth) return null; const k = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas"); c.width = v.videoWidth * k; c.height = v.videoHeight * k; c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", .82); },
  // ── speech: sentences are voiced in order, each fetched while the one before plays ──
  q: [], playing: false, gen: 0, spoken: 0,
  pick() { const s = LS.get("voice", ""); if (s && (s === "device" || !Voice.list || Voice.list.some((v) => v.id === s))) return s; return (Voice.list && Voice.list[0] && Voice.list[0].id) || "device"; }, // unchosen: ElevenLabs if you have it, else free Aura-2
  clip(text) { const g = Voice.gen; if (Voice.pick() === "device") return Promise.resolve({ device: text, g });
    const once = () => api("/tts", { text, voice: Voice.pick() }, null, 12000).then((j) => { if (j.error || !j.audio) throw new Error(j.error || "no audio came back"); return j; }); // a clip that never comes would stall the whole conversation
    return once().catch(() => sleep(250).then(once)).then((j) => { const a = new Audio(); a.preload = "auto"; a.src = j.audio; return { url: j.audio, audio: a, g, used: j.used }; }).catch((e) => ({ device: text, g, err: e.message })); },
  queue(text) { text = speakable(plain(text)); if (!text) return; Voice.q.push(Voice.clip(text)); if (!Voice.playing) Voice.play(); },
  async play() {
    Voice.playing = true; if (Voice.on) Voice.set("Speaking…");
    while (Voice.q.length) { const c = await Voice.q.shift(); if (c.g !== Voice.gen) continue;
      if (Voice.t0 && !Voice.first) { Voice.first = performance.now() - Voice.t0; $("vlat").textContent = "voice in " + (Voice.first / 1000).toFixed(1) + "s" + (/flux/.test(Voice.heardBy || "") ? " · heard live" + (Voice.heardBy !== "flux" ? " + checked" : "") : Voice.sttMs ? " · heard in " + (Voice.sttMs / 1000).toFixed(1) + "s" : "") + (c.used ? " · " + c.used : ""); }
      await new Promise((ok) => { let to = 0; const fin = () => { clearTimeout(to); ok(); }; // a clip that never says it ended (it happens) can't hold the conversation up
        if (c.url) { const a = (Voice.audio = c.audio || new Audio(c.url)); a.playbackRate = +S("rate") || 1; try { if (Voice.ac && Voice.outAn) Voice.ac.createMediaElementSource(a).connect(Voice.outAn); } catch (e) {} to = setTimeout(fin, 60000);
          a.onloadedmetadata = () => { if (isFinite(a.duration)) { clearTimeout(to); to = setTimeout(fin, (a.duration * 1000) / (a.playbackRate || 1) + 4000); } }; a.onended = a.onerror = fin; a.play().catch(fin); }
        else Voice.device(c.device).then(fin); }); }
    Voice.playing = false; (Voice.idle || []).splice(0).forEach((f) => f());
  },
  device(text) { text = String(text || ""); if (!window.speechSynthesis || !text) return Promise.resolve(); return new Promise((ok) => { const u = new SpeechSynthesisUtterance(text.slice(0, 3000)); const vs = speechSynthesis.getVoices(), pick = vs.find((v) => /natural|neural|premium|enhanced|samantha|google us english/i.test(v.name) && /^en/.test(v.lang)) || vs.find((v) => /^en/.test(v.lang)); if (pick) u.voice = pick; u.rate = 1.03 * (+S("rate") || 1); const to = setTimeout(() => { try { speechSynthesis.cancel(); } catch (e) {} ok(); }, 4000 + text.length * 95 / (+S("rate") || 1)); u.onend = u.onerror = () => { clearTimeout(to); ok(); }; speechSynthesis.speak(u); }); }, // Android's voice sometimes never says it finished
  drained() { return Voice.playing || Voice.q.length ? new Promise((ok) => (Voice.idle = Voice.idle || []).push(ok)) : Promise.resolve(); },
  // a growing reply: the first short sentence goes out at once, then fuller chunks
  feed(text, final) {
    const rest = text.slice(Voice.spoken), re = /[\s\S]*?[.!?…:;](?=\s|$)|[\s\S]*?\n/g, need = Voice.spoken ? 70 : 18; let m, cut = 0, chunk = "";
    while ((m = re.exec(rest)) && m[0]) { chunk += m[0]; cut = re.lastIndex; if (chunk.trim().length >= need) { Voice.queue(chunk); Voice.spoken += cut; return Voice.feed(text, final); } }
    if (final && rest.trim()) { Voice.queue(rest); Voice.spoken = text.length; }
  },
  say(text) { Voice.hush(); Voice.spoken = 0; Voice.feed(String(text || ""), true); return Voice.drained(); },
  hush() { Voice.gen++; Voice.q = []; try { speechSynthesis.cancel(); } catch (e) {} if (Voice.audio) { Voice.audio.pause(); Voice.audio = null; } Voice.playing = false; (Voice.idle || []).splice(0).forEach((f) => f()); },
  end() { Voice.on = false; Voice.hush(); if (Voice.h) Voice.h.stop(); if (Voice.ear) { Voice.ear.close(); Voice.ear = null; } if (Voice.pttGo) Voice.pttGo(); Voice.stopVideo(); if (Voice.mic) Voice.mic.getTracks().forEach((t) => t.stop()); Voice.mic = null; viz.stop(); $("voiceo").classList.add("hidden"); },
});
const voiceModel = () => { const v = S("vmodel"); if (!v) return ""; if (v !== "fast") return models.some((m) => m.id === v) ? v : "";
  const fast = /(groq|cerebras|sambanova)/i, good = /gpt-oss-120b|llama-3\.3-70b|llama-4|qwen3|kimi|gpt-oss-20b/i; // fastest inference hosts, decent models
  const f = models.find((m) => fast.test(m.group) && good.test(m.id)) || models.find((m) => fast.test(m.group)) || models.find((m) => /llama-3\.1-8b-instruct-fast|gpt-oss-20b/.test(m.id)); return f ? f.id : ""; };

// ── the live visual: the Genesis ring. Its hollow glows with your voice, a light runs round its stones while it thinks and
// they flare with the sound while it speaks (assets/hive/field.js) ──
const viz = { start() { const fd = new Uint8Array(128); HiveFX.voice.start($("viz"), () => {
    const an = Voice.mode === "talk" ? Voice.outAn : Voice.micAn; let lv = 0;
    if (an && (Voice.mode === "talk" || Voice.mode === "listen")) { an.getByteFrequencyData(fd); for (let i = 0; i < 64; i++) lv += fd[i]; lv /= 64 * 255; }
    const ml = Voice.ear ? Voice.ear.level : Voice.lv; if (Voice.mode === "listen" && ml) lv = Math.max(lv, ml * .6);
    return { mode: Voice.mode, level: Math.min(1, lv * 1.6), color: HiveFX.hex(HiveFX.mineralName(voiceModel() || $("model").value)) }; }); },
  stop() { HiveFX.voice.stop(); } };

$("voice").onclick = () => Voice.start(); $("vend").onclick = $("vx").onclick = () => Voice.end();
$("vmute").onclick = () => { Voice.paused = !Voice.paused; Voice.ui(); if (Voice.paused) { Voice.hush(); if (Voice.h) Voice.h.stop(); if (Voice.ear) Voice.ear.cancel(); Voice.set("Paused", ""); } else Voice.loop(); };
const pttDown = (e) => { e.preventDefault(); Voice.hush(); $("vptt").classList.add("held"); if (Voice.pttGo) { const f = Voice.pttGo; Voice.pttGo = null; f(); } };
const pttUp = () => { $("vptt").classList.remove("held"); setTimeout(() => Voice.pttStop && Voice.pttStop(), 150); };
$("vptt").addEventListener("pointerdown", pttDown); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => $("vptt").addEventListener(ev, pttUp));
$("vcam").onclick = () => Voice.cam(!(Voice.vs && Voice.src === "cam")); $("vflip").onclick = () => Voice.cam(true, Voice.facing === "user" ? "environment" : "user"); $("vscreen").onclick = () => (Voice.src === "screen" ? Voice.stopVideo() : Voice.screen());
$("vset").onclick = () => openSettings();
async function loadVoices() {
  if (!LS.get("voice-v2", 0)) { if (/^oa:/.test(LS.get("voice", ""))) LS.set("voice", ""); LS.set("voice-v2", 1); } // OpenAI was the default by accident once: forget that
  const j = await api("/voices").catch(() => ({ voices: [] })); Voice.list = j.voices || []; const groups = {}; for (const v of Voice.list) (groups[v.group] = groups[v.group] || []).push(v);
  const html = Object.entries(groups).map(([g, vs]) => "<optgroup label='" + esc(g) + "'>" + vs.map((v) => "<option value='" + esc(v.id) + "'>" + esc(v.name) + "</option>").join("") + "</optgroup>").join("") + "<optgroup label='This device'><option value='device'>Device voice (works offline)</option></optgroup>";
  for (const id of ["vvoice", "s-voice"]) { $(id).innerHTML = html; $(id).value = Voice.pick(); if (!$(id).value) $(id).value = "device"; }
}
const pickVoice = (v) => { LS.set("voice", v); $("vvoice").value = $("s-voice").value = v; Voice.say("Hi. This is how I sound now."); };
$("vvoice").onchange = () => pickVoice($("vvoice").value); $("s-voice").onchange = () => pickVoice($("s-voice").value);
$("vtest").onclick = () => Voice.say("Hey. Voice link is live. Ask me anything, and I'll start talking as soon as I have the first sentence.");
$("orb").onclick = () => { if (Voice.playing) { Voice.hush(); Voice.set("Listening…", ""); } }; // interrupt
loadVoices();
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Voice.on) Voice.end(); if (e.key === " " && Voice.on && S("hands") === "0" && !e.repeat && document.activeElement === document.body) pttDown(e); });
document.addEventListener("keyup", (e) => { if (e.key === " " && Voice.on && S("hands") === "0") pttUp(); });

// ── settings panel ──
function openSettings() {
  $("s-theme").value = LS.get("theme", "dark") === "light" ? "light" : "dark"; $("s-motion").checked = !!S("motion"); $("s-enter").checked = !!S("enter");
  $("s-rate").value = S("rate"); $("s-rate-v").textContent = (+S("rate")).toFixed(2) + "×"; $("s-hands").value = S("hands"); $("s-sil").value = S("sil"); $("s-sil-v").textContent = (S("sil") / 1000).toFixed(1) + " s";
  $("s-barge").checked = !!S("barge"); $("s-recog").value = S("recog");
  const vm = S("vmodel"), cur = $("s-vmodel"); [...cur.querySelectorAll("option.pin")].forEach((o) => o.remove());
  const add = (id) => { const m = models.find((x) => x.id === id); if (!m) return; const o = document.createElement("option"); o.className = "pin"; o.value = id; o.textContent = "Pin: " + m.name; cur.appendChild(o); };
  add($("model").value); if (vm && vm !== "fast" && vm !== $("model").value) add(vm); cur.value = vm; if (cur.value !== vm) cur.value = "";
  $("s-name").value = me().name || ""; $("s-about").value = me().about || ""; $("s-len").value = me().len || "";
  $("s-say").value = S("say"); $("sys").value = LS.get("sys", ""); if (!$("sdlg").open) $("sdlg").showModal();
}
["s-name", "s-about", "s-len"].forEach((id) => ($(id).onchange = () => setMe({ name: $("s-name").value, about: $("s-about").value, len: $("s-len").value })));
$("s-intro").onclick = () => { LS.set("intro", 0); $("sdlg").close(); newChat(); };
$("s-theme").onchange = () => { LS.set("theme", $("s-theme").value); applyTheme(); };
$("s-motion").onchange = () => { setS("motion", $("s-motion").checked); motion(); };
$("s-enter").onchange = () => setS("enter", $("s-enter").checked);
$("s-rate").oninput = () => { setS("rate", +$("s-rate").value); $("s-rate-v").textContent = (+$("s-rate").value).toFixed(2) + "×"; if (Voice.audio) Voice.audio.playbackRate = +$("s-rate").value; };
$("s-hands").onchange = () => { setS("hands", $("s-hands").value); if (Voice.on) { Voice.ui(); if (Voice.h) Voice.h.stop(); if (Voice.ear) Voice.ear.cancel(); } };
$("s-sil").oninput = () => { setS("sil", +$("s-sil").value); $("s-sil-v").textContent = ($("s-sil").value / 1000).toFixed(1) + " s"; };
$("s-barge").onchange = () => { setS("barge", $("s-barge").checked); if (Voice.on) Voice.ui(); };
$("s-recog").onchange = () => setS("recog", $("s-recog").value);
$("s-vmodel").onchange = () => { setS("vmodel", $("s-vmodel").value); if (Voice.on) Voice.ui(); };
$("s-say").onchange = () => setS("say", $("s-say").value.trim());
$("s-sayt").onclick = () => { setS("say", $("s-say").value.trim()); const first = sayAs()[0]; Voice.say(first ? "Hi " + first[0] + ". Did I get your name right?" : "Add a line like: Anders = Onders."); };
$("sys").onchange = () => LS.set("sys", $("sys").value.trim());
$("s-export").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(chats, null, 1)], { type: "application/json" })); a.download = "hive-sessions-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); };
$("s-clear").onclick = () => { if (!confirm("Delete every session on this device? This can't be undone.")) return; chats = []; LS.set("chats", chats); newChat(); toast("Sessions cleared"); };

// ── key vault ──
const Keys = {
  presets: {},
  async load() {
    const j = await api("/keys"); $("k-locked").classList.toggle("hidden", !j.error); $("k-open").classList.toggle("hidden", !!j.error); if (j.error) return;
    Agent.draw(); Keys.presets = j.presets; const sel = $("k-prov");
    if (!sel.options.length) { const g = { compat: "Models", anthropic: "Models", search: "Web search", voice: "Voices" }, by = {}; for (const [k, p] of Object.entries(j.presets)) (by[g[p.kind]] = by[g[p.kind]] || []).push("<option value='" + k + "'>" + esc(p.name) + "</option>"); sel.innerHTML = Object.entries(by).map(([n, o]) => "<optgroup label='" + n + "'>" + o.join("") + "</optgroup>").join(""); sel.onchange(); }
    Keys.draw(j.keys); Keys.perf();
  },
  async perf() {
    const j = await api("/perf").catch(() => ({})), ms = (j.models || []).filter((m) => m.ok + m.fail > 0).slice(0, 24);
    $("k-perf").innerHTML = ms.length ? "<table><thead><tr><th>Model</th><th>Calls</th><th>Failed</th><th>Avg time</th><th>Order</th></tr></thead><tbody>" + ms.map((m) => { const n = m.ok + m.fail, fr = m.fail / n;
      return "<tr><td>" + esc(m.model.split("/").pop()) + "</td><td>" + n + "</td><td class='" + (fr > 0.2 ? "bad" : "") + "'>" + Math.round(fr * 100) + "%</td><td>" + (m.ms ? (m.ms / 1000).toFixed(1) + " s" : "—") + "</td><td>" + (m.rank >= 99 ? "—" : m.rank + 1) + "</td></tr>"; }).join("") + "</tbody></table>"
      : "<p class='dim' style='margin:0'>Nothing counted yet: talk to AutoFaber or run a mission.</p>";
  },
  draw(keys) {
    Keys.keys = keys; $("kcount").textContent = keys.length + " key" + (keys.length === 1 ? "" : "s");
    $("k-list").innerHTML = keys.length ? keys.map((k) => "<div class='key" + (k.live ? "" : " off") + "' data-k='" + k.id + "'><div class='badge'>" + esc(k.name[0]) + "</div><div class='nm'>" + esc(k.label || k.name) + " <span class='dim' style='font-weight:400'>" + (k.label ? esc(k.name) + " · " : "") + "••••" + esc(k.tail) + "</span></div>" +
      "<div class='bt'><button class='sw' role='switch' aria-checked='" + k.live + "' data-kact='live' title='On / off'></button><button class='ghost sm' data-kact='test'>Test</button><button class='ghost sm' data-kact='del'>Remove</button></div>" +
      "<div class='meta" + (k.err ? " err" : "") + "'>" + (k.err ? "⚠ " + esc(k.err) : k.kind === "search" ? "powers web search" : k.kind === "voice" ? k.models + " voices · pick one in Voice link" : k.models + " models") + " · used " + k.used + "×" + (k.base ? " · " + esc(k.base) : "") + "</div>" +
      (k.pull ? "<div class='row mt' style='grid-column:2/-1'><input data-pullname placeholder='pull a model, e.g. qwen3:8b, llama3.2, gpt-oss:20b' style='flex:1'><button class='ghost sm' data-kact='pull'>Pull</button></div>" : "") + (k.kind !== "search" && k.kind !== "voice" && k.list.length ? "<details><summary>" + k.models + " models · swarm uses " + esc(k.pick === "*" ? "up to 40" : k.pick || "its strongest few") + "</summary><div class='row mt'><input data-pick placeholder='models for the swarm, comma separated, or * for up to 40' value='" + esc(k.pick) + "'><button class='ghost sm' data-kact='pick'>Save</button></div><div class='mods'>" + k.list.map((m) => "<code>" + esc(m) + "</code>").join("") + "</div></details>" : "") + "</div>").join("")
      : "<div class='card'><p class='dim' style='margin:0'>No keys yet. The free Workers AI models work without any.</p></div>";
  },
};
$("k-prov").onchange = () => { const p = Keys.presets[$("k-prov").value] || {}; $("k-baseL").classList.toggle("hidden", !p.editBase); $("k-base").placeholder = p.base || "https://your-server.example/v1"; $("k-key").placeholder = p.keyless ? "optional (your own server may not need one)" : "paste it here"; $("k-pickL").classList.toggle("hidden", p.kind === "search" || p.kind === "voice"); };
const addKey = async (force) => {
  $("k-add").disabled = true; $("k-msg").textContent = "checking with the provider…"; $("k-force").classList.add("hidden");
  const j = await api("/keys/add", { provider: $("k-prov").value, label: $("k-label").value, base: $("k-base").value, key: $("k-key").value, pick: $("k-pick").value, force }); $("k-add").disabled = false;
  if (j.error) { $("k-msg").textContent = j.error; $("k-force").classList.toggle("hidden", !j.canForce); return; }
  $("k-msg").textContent = "Added " + (j.key.kind === "search" ? "a search key" : j.key.kind === "voice" ? j.key.models + " voices" : j.key.models + " models") + "."; loadVoices(); $("k-key").value = $("k-label").value = $("k-pick").value = ""; Keys.load(); loadModels();
};
$("k-add").onclick = () => addKey(false); $("k-force").onclick = () => addKey(true);
$("k-list").onclick = async (e) => {
  const b = e.target.closest("[data-kact]"); if (!b) return; const card = b.closest("[data-k]"), kid = card.dataset.k, k = Keys.keys.find((x) => x.id === kid), act = b.dataset.kact;
  if (act === "del" && !confirm("Remove this key from the vault? It's deleted for good.")) return;
  b.disabled = true; const j = act === "del" ? await api("/keys/del", { kid }) : act === "test" ? await api("/keys/test", { kid }) : act === "pull" ? (toast("Pulling… this can take a while", 25000), await api("/keys/pull", { kid, model: card.querySelector("[data-pullname]").value })) : act === "live" ? await api("/keys/set", { kid, live: !k.live }) : await api("/keys/set", { kid, pick: card.querySelector("[data-pick]").value }); b.disabled = false;
  if (act === "pull") toast(j.error || "Ollama: " + j.status, 5000); else if (act === "test") toast(j.ok ? "Works: " + (j.key.kind === "search" ? "search answered" : j.key.models + " models") : "Failed: " + j.error, 4000); else if (j.error) toast(j.error);
  Keys.load(); loadModels();
};

// ── MENTIFABER AGENT 1.0 panel (Uplinks) ──
const gb = (n) => (n / 1024 ** 3).toFixed(1) + " GB";
const Agent = {
  timer: 0,
  async draw() {
    let st; try { st = await (await fetch("/api/agent/status", { cache: "no-store" })).json(); } catch (e) { st = null; }
    const el = $("agentp"); if (!st || st.error === "the agent isn't deployed") { el.innerHTML = "<div class='ah'><h3>Mentifaber Agent 1.0<small>not deployed on this site yet</small></h3></div>"; return; }
    const led = { online: "ok", waking: "warn", asleep: "", empty: "" }[st.state] || "", seed = st.seed;
    el.innerHTML = "<div class='ah'><i class='led " + led + "'></i><h3>Mentifaber Agent 1.0<small>" + (st.model ? esc(st.model.label) + " · " + gb(st.model.size) + " in R2" : "no model in R2 yet") + "</small></h3>" + (st.model ? "<label class='mtg' title='Keep it running around the clock; it restarts itself if it ever stops'><span>Always on</span><input type='checkbox' class='tg' data-ag='always'" + (st.always ? " checked" : "") + "></label>" : "") + "<span class='st " + (st.state === "online" ? "working" : st.state === "waking" ? "paused" : "") + "'>" + esc(st.state === "empty" ? "no model" : st.state) + "</span></div>" +
      (seed ? "<div class='prog'><div class='bar'><i style='width:" + (100 * seed.done / seed.size).toFixed(1) + "%'></i></div><p>" + (seed.error ? "⚠ " + esc(seed.error) : "copying " + esc(seed.label) + " into your R2 · " + gb(seed.done) + " of " + gb(seed.size)) + "</p></div>" : "") +
      "<div class='facts'><div>runs on<b>your domain</b></div><div>stored in<b>R2 · mentifaber-models</b></div><div>container<b>4 vCPU · 12 GiB</b></div>" + (st.always ? "<div>runs<b>24/7 · always on</b></div>" + (st.upSince ? "<div>up since<b>" + esc(new Date(st.upSince).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + "</b></div>" : "") + (st.restarts ? "<div>self-restarts<b>" + st.restarts + "</b></div>" : "") : "<div>sleeps after<b>20 idle min</b></div>") + (st.model && st.model.ctx ? "<div>memory<b>" + Math.round(st.model.ctx / 1024) + "K tokens</b></div>" : "") + "</div>" +
      "<div class='ab'>" + (st.model ? (st.state === "asleep" ? "<button class='pri' data-ag='wake'>Wake</button>" : st.state !== "empty" ? "<button class='q' data-ag='sleep'>Sleep now</button>" : "") : "") +
      (!seed || seed.error ? "<button class='" + (st.model ? "ghost" : "pri") + "' data-ag='seed' data-m='14b'>Load Qwen3 14B · 9.0 GB · 16K memory (smartest)</button><button class='ghost' data-ag='seed' data-m='8b'>Load Qwen3 8B · 5.0 GB · 32K memory (2× faster)</button>" : "") + "</div>" +
      (!seed || seed.error ? "<div class='own'><input id='ag-url' placeholder='or your own model: https://…/model.gguf (up to 11 GB)'><button class='ghost' data-ag='seed-url'>Load</button></div>" : "") +
      (st.error ? "<p class='dim sm' style='color:var(--bad)'>" + esc(st.error) + "</p>" : "") +
      (st.always && st.healed ? "<p class='dim sm'>Last self-restart, " + esc(new Date(st.healed.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + ": " + esc(st.healed.why) + ".</p>" : "") +
      "<p class='dim sm'>It appears as the first model in the Studio picker, joins your councils and swarms, works in voice, and any page can use it: <code>&lt;script src=\"/assets/agent.js\"&gt;</code> then <code>MentifaberAgent.chat(…)</code>.</p>";
    clearTimeout(Agent.timer); if ((seed && !seed.error) || st.state === "waking") Agent.timer = setTimeout(() => !$("v-keys").classList.contains("hidden") && Agent.draw(), 3000);
  },
};
$("agentp").onclick = async (e) => {
  const b = e.target.closest("[data-ag]"); if (!b) return; const a = b.dataset.ag;
  if (a === "sleep" && b.closest("#agentp").querySelector("[data-ag='always']:checked") && !confirm("Put it to sleep? That also turns Always on off: it will sleep after 20 idle minutes until you turn it back on.")) return;
  b.disabled = true;
  const post = (p, body) => fetch("/api/agent/" + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  const j = a === "seed" ? await post("seed", { model: b.dataset.m }) : a === "seed-url" ? await post("seed", { url: $("ag-url").value.trim() }) : a === "always" ? await post("always", { on: b.checked }) : await post(a);
  if (j.error) toast(j.error, 5000); else if (a === "wake") toast("Waking: the model loads from R2 in a minute or two", 5000); else if (a.startsWith("seed")) toast("Copying the model into your R2…", 4000);
  else if (a === "always") toast(j.always ? "Always on: it runs around the clock and restarts itself if it ever stops" : "It sleeps after 20 idle minutes again", 5000);
  Agent.draw(); loadModels();
};

// ── MIND: what Genesis knows about the owner. Tabs: You (profile, what Genesis noticed), Memory (memories, open threads),
// Timeline (rhythm, activity), Genesis; a search across all of it ──
const agoT = (t) => { const d = (Date.now() - t) / 60e3; return d < 1 ? "just now" : d < 60 ? Math.round(d) + " min ago" : d < 1440 ? Math.round(d / 60) + " h ago" : Math.round(d / 1440) + " d ago"; };
const MTABS = ["you", "mem", "lib", "time", "gen"], ACTK = { chat: "Chat", voice: "Voice", council: "Council", image: "Pictures", project: "Swarm briefs", history: "Imported sessions" };
// ── the library: documents Genesis keeps (src/hive-library.js) ──
const LIBJS = { pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", pdfw: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", docx: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js" };
const loadJS = (src) => new Promise((ok, no) => { if (document.querySelector("script[src='" + src + "']")) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("couldn't load the reader for this file")); document.head.appendChild(s); });
const LibV = {
  async load() {
    const j = await api("/library").catch(() => ({ docs: [] })); if (j.error) return;
    $("l-docs").innerHTML = (j.docs || []).length ? j.docs.map((d) => "<div class='mi'><div class='tx'><b>" + esc(d.title) + "</b><small class='dim'>" + d.chunks + " passage" + (d.chunks === 1 ? "" : "s") + " · " + Math.round(d.chars / 1000) + "k characters · " + new Date(d.ts).toLocaleDateString() + (d.src ? " · <a href='" + esc(d.src) + "' target='_blank' rel='noopener'>source</a>" : "") + "</small></div><button class='ic' data-ldel='" + d.id + "' title='Remove from the library' aria-label='Remove'>✕</button></div>").join("")
      : "<p class='dim' style='margin:0'>Nothing kept yet. Add a link, paste text, or add files above.</p>";
    $("l-used").textContent = j.docs && j.docs.length ? j.used + " of " + j.max + " passages used" : "";
  },
  async read(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") { await loadJS(LIBJS.pdf); pdfjsLib.GlobalWorkerOptions.workerSrc = LIBJS.pdfw; const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; let out = ""; for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); out += (await pg.getTextContent()).items.map((x) => x.str).join(" ") + "\n\n"; } return out; }
    if (ext === "docx") { await loadJS(LIBJS.docx); return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value; }
    const t = await f.text(); return /^html?$/.test(ext) ? new DOMParser().parseFromString(t, "text/html").body.innerText : t;
  },
  async add(body) { $("l-add").disabled = true; $("l-msg").textContent = "Reading and indexing…"; const r = await api("/library/add", body).catch((e) => ({ error: e.message })); $("l-add").disabled = false;
    $("l-msg").textContent = r.error ? r.error : "Kept “" + r.title + "” (" + r.chunks + " passages)."; if (!r.error) LibV.load(); return !r.error; },
};
$("l-add").onclick = async () => { const url = $("l-url").value.trim(), text = $("l-text").value; if (!url && !text.trim()) return ($("l-msg").textContent = "Give a link or paste some text.");
  if (await LibV.add({ title: $("l-title").value.trim(), url: url || undefined, text: text.trim() ? text : undefined })) { $("l-title").value = ""; $("l-url").value = ""; $("l-text").value = ""; } };
$("l-files").onchange = async (e) => { for (const f of [...e.target.files]) { try { $("l-msg").textContent = "Reading " + f.name + "…"; await LibV.add({ title: f.name.replace(/\.[^.]+$/, ""), text: await LibV.read(f), src: f.name }); } catch (x) { $("l-msg").textContent = "Couldn't read " + f.name + ": " + (x.message || x); } } e.target.value = ""; };
$("l-docs").onclick = async (e) => { const b = e.target.closest("[data-ldel]"); if (!b || !confirm("Remove this document from the library? AutoFaber forgets its passages.")) return; await api("/library/remove", { id: +b.dataset.ldel }); LibV.load(); };
let lqT = 0; $("l-q").oninput = () => { clearTimeout(lqT); lqT = setTimeout(async () => { const q = $("l-q").value.trim(); $("l-hits").classList.toggle("hidden", q.length < 3); if (q.length < 3) return;
  const j = await api("/library/search?q=" + encodeURIComponent(q)).catch(() => ({ hits: [] }));
  $("l-hits").innerHTML = (j.hits || []).length ? j.hits.map((h) => "<div class='mi hit'><div class='tx'><small class='dim'>" + esc(h.title) + " · passage " + h.n + " · match " + Math.round(h.score * 100) + "%</small><span>" + esc(h.text.slice(0, 360)) + (h.text.length > 360 ? "…" : "") + "</span></div></div>").join("") : "<p class='dim' style='margin:0'>Nothing in the library matches that.</p>"; }, 350); };

const MindV = {
  tab: LS.get("mind-tab", "you"), f: "all", searching: false, j: null,
  kl(k) { return ((MindV.j && MindV.j.kinds) || {})[k] || "About you"; },
  show(t) {
    if (!MTABS.includes(t)) t = "you"; MindV.tab = t; LS.set("mind-tab", t);
    document.querySelectorAll("#mtabs [data-mt]").forEach((b) => { const on = b.dataset.mt === t && !MindV.searching; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    for (const k of MTABS) $("mt-" + k).classList.toggle("hidden", k !== t || MindV.searching);
    if (/^#mind/.test(location.hash) && location.hash !== "#mind/" + t) history.replaceState(null, "", location.pathname + location.search + "#mind/" + t);
  },
  async load() {
    const h = location.hash.split("/")[1], sub = ({ genesis: "gen", memory: "mem", timeline: "time", library: "lib" })[h] || h; if (MTABS.includes(sub)) MindV.tab = sub; // "#mind/genesis" (the alerts' link) works too
    const j = await api("/mind?tz=" + -new Date().getTimezoneOffset());
    $("m-locked").classList.toggle("hidden", !j.error); $("m-open").classList.toggle("hidden", !!j.error); $("m-q").classList.toggle("hidden", !!j.error); if (j.error) return;
    MindV.j = j; MindV.show(MindV.tab); GenV.load(); LibV.load(); MindV.you(j); MindV.mem(j); MindV.time(j);
  },
  you(j) {
    const st = j.stats || {}, k = st.kinds || {}, hrs = Array(24).fill(0); (st.grid || []).forEach((row) => row.forEach((n, h) => { hrs[h] += n; }));
    $("m-on").checked = !!j.on; $("m-led").className = "led " + (j.on ? "ok" : "");
    $("m-sub").textContent = j.on ? (j.at ? "profile from " + agoT(j.at) + (j.model ? " · " + j.model.split("|").pop().split("/").pop() : "") + (j.fresh ? " · " + j.fresh + " new since" : "") : "no profile yet: analyze to build one") : "memory is off: nothing is noted or shared";
    $("m-at").textContent = st.total ? st.total + " notes" : "";
    const top = hrs.indexOf(Math.max(...hrs)), fmt = (h) => (h % 12 || 12) + (h < 12 ? "am" : "pm");
    const f = [["last 90 days", (st.last90 || 0) + " actions"], ["active days", st.activeDays || 0], ["streak", st.streak ? st.streak + " day" + (st.streak > 1 ? "s" : "") : "—"], ["chat · voice", (k.chat || 0) + " · " + (k.voice || 0)], ["councils · pictures", (k.council || 0) + " · " + (k.image || 0)],
      ["swarm projects", Object.values(st.projects || {}).reduce((a, b) => a + b, 0)], ["peak hour", Math.max(...hrs) ? fmt(top) : "—"], ["favourite mind", (st.models && st.models[0] && st.models[0][0]) || "—"], ["memories", st.memories || 0], ["open threads", st.threads || 0]];
    $("m-facts").innerHTML = f.map(([a, b]) => "<div>" + a + "<b title='" + esc(b) + "'>" + esc(b) + "</b></div>").join("");
    // what Genesis noticed, waiting for a yes
    const pm = (j.pending && j.pending.memories) || [], pt = (j.pending && j.pending.threads) || [], n = pm.length + pt.length;
    $("m-review").classList.toggle("hidden", !n); $("m-badge").classList.toggle("hidden", !n); $("m-badge").textContent = n || "";
    const row = (small, text, yes, no, key) => "<div class='mi rv'><p><small>" + small + "</small>" + esc(text) + "</p><div class='ib'><button data-rv='" + key + ":1'>" + yes + "</button><button data-rv='" + key + ":0'>" + no + "</button></div></div>";
    $("m-rlist").innerHTML = [...pm.map((m) => row("remember · " + esc(MindV.kl(m.kind)) + " · " + (m.src === "analysis" ? "from the analysis" : "noticed") + " " + agoT(m.ts), m.text, "Keep", "Not right", "mem:" + m.id)),
      ...pt.map((t) => t.ask === "done" ? row("did you finish this? · from your recent chats", t.text, "Yes, done", "Not yet", "thread:" + t.id) : row("open thread · " + (t.src === "analysis" ? "from the analysis" : "noticed") + " " + agoT(t.ts), t.text, "Track it", "No", "thread:" + t.id))].join("");
    // the profile, and the ones before it
    const hs = j.history || [], sel = $("m-hist"); sel.classList.toggle("hidden", !hs.length);
    const day = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    sel.innerHTML = "<option value=''>Current" + (j.at ? " · " + day(j.at) : "") + "</option>" + hs.map((h) => "<option value='" + h.at + "'>" + day(h.at) + (h.model ? " · " + esc(h.model.split("|").pop().split("/").pop()) : "") + (h.old ? " (older analyst)" : "") + "</option>").join("");
    MindV.profile(j);
  },
  profile(j) {
    $("m-profile").innerHTML = j.outdated ? "<p class='dim'>⚠ This profile came from AutoFaber's older analyst, which invented numbers. It's no longer used in your chats and is being rebuilt; hit <b>Analyze me now</b> to do it immediately.</p><details><summary class='dim'>show the old one</summary>" + md(j.profile) + "</details>"
      : j.profile ? md(j.profile) : "<p class='dim'>No analysis yet. Hit <b>Analyze me now</b>: the strongest model you have reads your activity, projects, memories and threads and writes you up, frankly. It refreshes on its own as you keep using AutoFaber, and each new one says what changed.</p>";
  },
  mem(j) {
    const ks = Object.keys(j.kinds || {}), ms = j.memories || [], opt = (sel) => ks.map((k) => "<option value='" + k + "'" + (k === sel ? " selected" : "") + ">" + esc(j.kinds[k]) + "</option>").join("");
    if ($("m-kind").options.length < 2) $("m-kind").innerHTML = "<option value=''>auto</option>" + opt("");
    const count = (f) => ms.filter(f).length, chips = [["all", "All", ms.length], ["pin", "★ Pinned", count((m) => m.pin)], ...ks.map((k) => [k, j.kinds[k], count((m) => (m.kind || "about") === k)])].filter((c) => c[0] === "all" || c[2]);
    if (!chips.some((c) => c[0] === MindV.f)) MindV.f = "all";
    $("m-chips").innerHTML = chips.map(([f, l, n]) => "<button class='chip" + (f === MindV.f ? " on" : "") + "' data-mf='" + f + "'>" + esc(l) + " <i>" + n + "</i></button>").join("");
    const show = ms.filter((m) => MindV.f === "all" || (MindV.f === "pin" ? m.pin : (m.kind || "about") === MindV.f)), src = (s) => (s === "analysis" ? "from analysis" : s === "noticed" ? "noticed by AutoFaber" : "you");
    $("m-mem").innerHTML = show.map((m) => "<div class='mi mem'><button class='pin" + (m.pin ? " on" : "") + "' data-pin='" + m.id + "' aria-pressed='" + !!m.pin + "' title='" + (m.pin ? "Pinned: in every chat. Tap to unpin" : "Pin it: always in every chat") + "'>" + (m.pin ? "★" : "☆") + "</button>" +
      "<p><small><select data-mk='" + m.id + "' aria-label='Kind'>" + opt(m.kind || "about") + "</select> · " + src(m.src) + " · " + agoT(m.upd || m.ts) + "</small><span class='mtx' data-edit='" + m.id + "' tabindex='0' role='button' title='Tap to edit'>" + esc(m.text) + "</span></p><button data-mem='" + m.id + "' title='Forget this'>✕</button></div>").join("")
      || "<p class='dim sm'>" + (ms.length ? "None of that kind." : "Nothing yet. Say “remember …” in any chat, add one above, or let AutoFaber notice things as you talk.") + "</p>";
    $("m-trust").checked = !!j.trust;
    const th = j.threads || [], open = th.filter((t) => t.status === "open"), closed = th.filter((t) => t.status !== "open"), from = (s) => (s === "analysis" ? "from the analysis" : s === "noticed" ? "noticed" : "you");
    // his own threads first; what Genesis noticed or the analysis suggested sits below, and can be cleared in one go
    const trow = (t) => "<div class='mi th'><p><small><i class='src " + esc(t.src || "you") + "'>" + from(t.src) + "</i> · " + agoT(t.ts) + "</small>" + esc(t.text) + "</p><div class='ic'><button data-th='" + t.id + ":done' title='Done' aria-label='Mark done'>✓</button><button data-th='" + t.id + ":dropped' title='Drop' aria-label='Drop'>✕</button></div></div>";
    const mine = open.filter((t) => (t.src || "you") === "you"), sugg = open.filter((t) => (t.src || "you") !== "you");
    $("m-threads").innerHTML = (mine.map(trow).join("") || (sugg.length ? "" : "<p class='dim sm'>No open threads. Add what you're in the middle of, or let AutoFaber notice it.</p>")) +
      (sugg.length ? "<div class='tsugg'><div class='th-h'><span>Suggested by AutoFaber <b>" + sugg.length + "</b></span><button class='q' data-thall='dropped'>Drop all suggestions</button></div>" + sugg.map(trow).join("") + "</div>" : "");
    $("m-tdone").classList.toggle("hidden", !closed.length);
    $("m-tclosed").innerHTML = closed.map((t) => "<div class='mi'><p><small>" + esc(t.status) + " · " + agoT(t.upd || t.ts) + "</small>" + esc(t.text) + "</p><div class='ib'><button data-th='" + t.id + ":open'>Reopen</button></div></div>").join("");
  },
  time(j) {
    const st = j.stats || {}, days = st.days || [], grid = st.grid || [], wd = (new Date().getDay() + 6) % 7, cols = Math.floor((6 - wd + days.length - 1) / 7) + 1, mx = Math.max(1, ...days);
    $("m-cal").style.setProperty("--cols", cols);
    $("m-cal").innerHTML = days.map((n, i) => { const k = days.length - 1 - i, p = 6 - wd + k, col = cols - Math.floor(p / 7), r = 6 - (p % 7), lv = n ? Math.min(4, Math.ceil((4 * n) / mx)) : 0;
      return "<i class='l" + lv + "' style='grid-column:" + col + ";grid-row:" + (r + 1) + "' title='" + new Date(Date.now() - k * 864e5).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ": " + n + "'></i>"; }).join("");
    const act = days.filter(Boolean).length; $("m-streak").textContent = (act + " active day" + (act === 1 ? "" : "s") + " in 26 weeks") + (st.streak > 1 ? " · " + st.streak + "-day streak" : "");
    const gm = Math.max(1, ...grid.flat()), fmt = (h) => (h % 12 || 12) + (h < 12 ? "a" : "p");
    $("m-grid").innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, r) => "<span>" + d + "</span>" + (grid[r] || Array(24).fill(0)).map((n, h) => "<i style='--a:" + (n ? 0.18 + (0.82 * n) / gm : 0) + "' title='" + d + " " + fmt(h) + "m: " + n + "'></i>").join("")).join("") + "<span></span>" + Array.from({ length: 24 }, (_, h) => "<b>" + (h % 6 ? "" : fmt(h)) + "</b>").join("");
    const kinds = Object.entries(st.kinds || {}).sort((a, b) => b[1] - a[1]), km = Math.max(1, ...kinds.map((x) => x[1])), models = st.models || [], mm = Math.max(1, ...models.map((x) => x[1]));
    const bar = (l, n, m) => "<div class='kb'><span>" + esc(l) + "</span><i><u style='width:" + Math.max(2, (100 * n) / m) + "%'></u></i><b>" + n + "</b></div>";
    $("m-kbars").innerHTML = (kinds.length ? "<h4>what you do · last 90 days</h4>" + kinds.map(([k, n]) => bar(ACTK[k] || k, n, km)).join("") : "") + (models.length ? "<h4 class='mt'>the minds you lean on</h4>" + models.map(([k, n]) => bar(k, n, mm)).join("") : "");
    const acts = j.recent || [], have = [...new Set(acts.map((a) => a.kind))], ak = $("m-akind");
    if (ak.dataset.k !== have.join()) { const v = ak.value; ak.innerHTML = "<option value=''>everything</option>" + have.map((k) => "<option value='" + esc(k) + "'>" + esc(ACTK[k] || k) + "</option>").join(""); ak.dataset.k = have.join(); ak.value = have.includes(v) ? v : ""; }
    $("m-act").innerHTML = acts.filter((a) => !ak.value || a.kind === ak.value).map((a) => "<div class='mi'><p><small>" + esc(ACTK[a.kind] || a.kind) + " · " + agoT(a.ts) + "</small>" + esc(String(a.text).slice(0, 400)) + "</p><button data-act='" + a.id + "' title='Forget this'>✕</button></div>").join("") || "<p class='dim sm'>Nothing yet. Use AutoFaber and it shows up here.</p>";
  },
  edit(span) {
    const id = +span.dataset.edit, old = span.textContent, inp = document.createElement("input"); inp.value = old; inp.className = "medit"; inp.setAttribute("aria-label", "Edit memory"); span.textContent = ""; span.appendChild(inp); inp.focus(); inp.select();
    let done = false; const fin = async (save) => { if (done) return; done = true; const v = inp.value.trim();
      if (save && v && v !== old) { const j = await api("/mind/edit", { id, text: v }); if (j.error) { toast(j.error); span.textContent = old; return; } toast("Memory updated"); return MindV.load(); } span.textContent = old; };
    inp.onkeydown = (e) => { if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); }; inp.onblur = () => fin(true);
  },
  async search() {
    const q = $("m-q").value.trim(); MindV.searching = q.length >= 2; $("m-results").classList.toggle("hidden", !MindV.searching); MindV.show(MindV.tab);
    if (!MindV.searching) { $("m-results").innerHTML = ""; return; }
    const j = await api("/mind/search", { q }); if ($("m-q").value.trim() !== q) return; if (j.error) { $("m-results").innerHTML = "<div class='card'><p class='dim'>" + esc(j.error) + "</p></div>"; return; }
    const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), rx = terms.length ? new RegExp("(" + terms.join("|") + ")", "gi") : null, hl = (t) => (rx ? esc(t).replace(rx, "<mark>$1</mark>") : esc(t));
    const sec = (title, items) => (items.length ? "<div class='sres'><h3>" + title + "<small>" + items.length + "</small></h3><div class='mlist'>" + items.join("") + "</div></div>" : "");
    const local = new Set(chats.map((c) => c.id)), who = gname || "AutoFaber";
    const html = sec("Memories", (j.memories || []).map((m) => "<div class='mi'><p><small>" + esc(MindV.kl(m.kind)) + (m.pin ? " · pinned" : "") + "</small>" + hl(m.text) + "</p></div>")) +
      sec("Threads", (j.threads || []).map((t) => "<div class='mi'><p><small>thread · " + esc(t.status) + " · " + agoT(t.ts) + "</small>" + hl(t.text) + "</p></div>")) +
      sec("Conversations", (j.turns || []).map((t) => { const can = t.cid && local.has(t.cid); return "<div class='mi turn'" + (can ? " data-cid='" + esc(t.cid) + "' tabindex='0' role='button'" : "") + "><p><small>" + agoT(t.ts) + (can ? " · open it" : "") + "</small><b>You:</b> " + hl(t.said) + "<br><span class='dim'>" + esc(who) + ":</span> " + hl(t.reply) + "</p></div>"; })) +
      sec("Activity", (j.activity || []).map((a) => "<div class='mi'><p><small>" + esc(ACTK[a.kind] || a.kind) + " · " + agoT(a.ts) + "</small>" + hl(String(a.text).slice(0, 400)) + "</p></div>"));
    $("m-results").innerHTML = html || "<div class='card'><p class='dim'>Nothing AutoFaber knows matches “" + esc(q) + "”.</p></div>";
  },
  async exportAll(kind) {
    const j = await api("/mind/export?tz=" + -new Date().getTimezoneOffset()); if (j.error) return toast(j.error);
    const today = new Date().toISOString().slice(0, 10), d = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
    const save = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    if (kind === "json") return save("hive-mind-" + today + ".json", JSON.stringify(j, null, 2), "application/json");
    const K = (MindV.j && MindV.j.kinds) || {}, kept = (j.memories || []).filter((m) => m.ok === 1), th = (j.threads || []).filter((t) => t.ok === 1);
    let s = "# What AutoFaber knows about you\n\n_Exported " + d(Date.now()) + " UTC._\n\n";
    if (j.profile) s += "## Profile\n\n" + (j.profileAt ? "_Written " + d(j.profileAt) + " UTC" + (j.profileModel ? " by " + j.profileModel.split("|").pop().split("/").pop() : "") + "._\n\n" : "") + j.profile.replace(/^## /gm, "### ") + "\n\n";
    if (kept.length) { s += "## Memories\n\n"; for (const k of Object.keys(K)) { const g = kept.filter((m) => (m.kind || "about") === k); if (g.length) s += "### " + K[k] + "\n\n" + g.map((m) => "- " + (m.pin ? "★ " : "") + m.text).join("\n") + "\n\n"; } }
    if (th.length) s += "## Threads\n\n" + th.map((t) => "- [" + (t.status === "done" ? "x" : " ") + "] " + t.text + (t.status === "dropped" ? " _(dropped)_" : "") + " (since " + d(t.ts).slice(0, 10) + ")").join("\n") + "\n\n";
    if ((j.activity || []).length) s += "## Activity (" + j.activity.length + " notes)\n\n" + j.activity.map((a) => "- " + d(a.ts) + " **" + a.kind + "** " + String(a.text).replace(/\s+/g, " ").slice(0, 600)).join("\n") + "\n";
    save("hive-mind-" + today + ".md", s, "text/markdown");
  },
  async analyze() {
    const b = $("m-analyze"); b.disabled = true; b.textContent = "Analyzing…"; MindV.show("you"); $("m-profile").innerHTML = "<p class='dim'>Reading everything you've done in AutoFaber… this takes up to a minute.</p>";
    const j = await api("/mind/analyze", {}).catch(() => ({ error: "couldn't reach AutoFaber" })); b.disabled = false; b.textContent = "Analyze me now";
    if (j.error) toast(j.error, 6000); else toast("Profile updated"); MindV.load();
  },
  async importLocal(quiet) {
    const sessions = chats.map((c) => ({ id: c.id, title: c.title, ts: c.ts, model: c.model, said: c.msgs.filter((m) => m.role === "user").map((m) => m.show || m.text || "").filter(Boolean) })).filter((c) => c.said.length);
    if (!sessions.length) return quiet || toast("No sessions on this device");
    const j = await api("/mind/import", { sessions }); if (!quiet) toast(j.error || "Imported " + j.imported + " sessions", 3000); LS.set("mind-sync", Date.now()); if (!$("v-mind").classList.contains("hidden")) MindV.load();
  },
};
$("m-analyze").onclick = () => MindV.analyze();
$("m-import").onclick = () => MindV.importLocal();
$("m-exp-md").onclick = () => MindV.exportAll("md"); $("m-exp-json").onclick = () => MindV.exportAll("json");
$("m-ask").onclick = () => { location.hash = "studio"; newChat(); send("Analyze me and what I do, from everything you know about me. Be frank: what stands out, what I'm good at, where I'm stuck, and what I should do next."); };
$("m-on").onchange = async () => { await api("/mind/set", { on: $("m-on").checked }); toast($("m-on").checked ? "Memory on" : "Memory off: nothing is noted or shared"); MindV.load(); };
$("m-trust").onchange = async () => { const on = $("m-trust").checked; await api("/mind/set", { trust: on }); toast(on ? "What AutoFaber notices is kept without asking (you can still edit or forget it)" : "AutoFaber asks before keeping what it notices", 3500); };
$("m-add").onclick = async () => { const t = $("m-new").value.trim(); if (!t) return; const j = await api("/mind/remember", { text: t, kind: $("m-kind").value || undefined }); if (j.error) return toast(j.error); $("m-new").value = ""; toast("Remembered, under " + MindV.kl(j.kind)); MindV.load(); };
$("m-new").onkeydown = (e) => { if (e.key === "Enter") $("m-add").click(); };
$("m-tadd").onclick = async () => { const t = $("m-tnew").value.trim(); if (!t) return; const j = await api("/mind/thread", { text: t }); if (j.error) return toast(j.error); $("m-tnew").value = ""; MindV.load(); };
$("m-tnew").onkeydown = (e) => { if (e.key === "Enter") $("m-tadd").click(); };
$("m-notice").onclick = async () => { const b = $("m-notice"); b.disabled = true; b.textContent = "Looking…"; const j = await api("/mind/notice", {}).catch(() => ({ error: "couldn't reach AutoFaber" })); b.disabled = false; b.textContent = "Look over recent chats";
  if (j.error) return toast(j.error, 6000); const n = j.facts.length + j.threads.length + j.finished.length;
  toast(j.none ? "Nothing new since it last looked" : !n ? "It looked: nothing worth keeping this time" : "Found " + [j.facts.length && j.facts.length + " to remember", j.threads.length && j.threads.length + " open thread" + (j.threads.length > 1 ? "s" : ""), j.finished.length && j.finished.length + " finished"].filter(Boolean).join(", ") + (MindV.j && MindV.j.trust ? "" : ": review under You"), 5000); MindV.load(); };
$("m-wipe").onclick = async () => { if (!confirm("Forget everything AutoFaber knows about you: the profile and its history, every memory and thread, and the whole activity log? This can't be undone.")) return; await api("/mind/forget", { all: true }); toast("Forgotten"); MindV.load(); };
$("m-hist").onchange = async () => { const at = $("m-hist").value; if (!at) return MindV.profile(MindV.j); const x = await api("/mind/history", { at: +at }); if (x.error) return toast(x.error);
  $("m-profile").innerHTML = "<p class='dim sm'>An earlier profile, from " + esc(new Date(x.at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })) + ". Your chats use the current one.</p>" + md(x.profile); };
$("m-akind").onchange = () => MindV.j && MindV.time(MindV.j);
let mqT = 0; $("m-q").oninput = () => { clearTimeout(mqT); mqT = setTimeout(MindV.search, 300); };
$("m-q").onkeydown = (e) => { if (e.key === "Escape") { $("m-q").value = ""; MindV.search(); } };
$("v-mind").onclick = async (e) => {
  const t = e.target, tb = t.closest("#mtabs [data-mt]");
  if (tb) { if (MindV.searching) { $("m-q").value = ""; await MindV.search(); } return MindV.show(tb.dataset.mt); }
  const rv = t.closest("[data-rv]"); if (rv) { const [kind, id, keep] = rv.dataset.rv.split(":"); rv.closest(".mi").remove(); await api("/mind/review", { [kind]: +id, keep: keep === "1" }); return MindV.load(); }
  const pin = t.closest("[data-pin]"); if (pin) { const j = await api("/mind/edit", { id: +pin.dataset.pin, pin: !pin.classList.contains("on") }); if (j.error) return toast(j.error); return MindV.load(); }
  const tha = t.closest("[data-thall]"); if (tha) { const ids = [...document.querySelectorAll(".tsugg [data-th$=':dropped']")].map((b) => +b.dataset.th.split(":")[0]); if (!ids.length || !confirm("Drop all " + ids.length + " suggested threads? They stay under Finished and dropped, where you can reopen any of them.")) return;
    tha.disabled = true; for (const id of ids) await api("/mind/thread", { id, status: "dropped" }).catch(() => {}); toast("Dropped " + ids.length); return MindV.load(); }
  const th = t.closest("[data-th]"); if (th) { const [id, status] = th.dataset.th.split(":"); await api("/mind/thread", { id: +id, status }); toast(status === "done" ? "Marked done" : status === "dropped" ? "Dropped" : "Reopened"); return MindV.load(); }
  const chip = t.closest("[data-mf]"); if (chip) { MindV.f = chip.dataset.mf; return MindV.mem(MindV.j); }
  const ed = t.closest("[data-edit]"); if (ed) { if (!ed.querySelector("input")) MindV.edit(ed); return; }
  const turn = t.closest("[data-cid]"); if (turn) { $("m-q").value = ""; MindV.searching = false; return openChat(turn.dataset.cid); }
  const b = t.closest("[data-mem],[data-act]"); if (!b) return; await api("/mind/forget", b.dataset.mem ? { mem: b.dataset.mem } : { act: b.dataset.act }); b.closest(".mi").remove();
};
$("v-mind").addEventListener("change", async (e) => { const s = e.target.closest("[data-mk]"); if (!s) return; await api("/mind/edit", { id: +s.dataset.mk, kind: s.value }); MindV.load(); });
$("v-mind").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-edit],[data-cid]")) { e.preventDefault(); e.target.click(); } });

// ── GENESIS: the mind of the app (owner only) ──
const GenV = {
  async load() {
    if (!$("genp")) return; // an older cached page without the Genesis panel
    const j = await api("/genesis"); if (j.error) return; GenV.j = j;
    const s = j.self, st = j.stats || {}, ago = (t) => { const d = (Date.now() - t) / 60e3; return d < 1 ? "just now" : d < 60 ? Math.round(d) + " min ago" : d < 1440 ? Math.round(d / 60) + " h ago" : Math.round(d / 1440) + " d ago"; };
    const days = Math.max(1, Math.round((Date.now() - s.born) / 864e5)), name = esc(s.name);
    $("g-name").textContent = s.name; gname = s.name; $("g-auto").checked = !!s.auto;
    $("g-sub").textContent = "named by " + s.creator + " · " + new Date(s.born).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) + " · " + (s.reflected ? "last reflected " + ago(s.reflected) + (s.model ? " · " + s.model.split("|").pop().split("/").pop() : "") : "hasn't reflected yet") + (j.due ? " · ready to reflect" : "");
    $("g-facts").innerHTML = [["days alive", days], ["conversations", st.turns || 0], ["remembered", st.remembered || 0], ["good · off", (st.up || 0) + " · " + (st.down || 0)], ["lessons", st.lessons || 0], ["reflections", st.reflections || 0], ["ideas", st.ideas || 0], ["phone alerts", j.push && j.push.devices ? j.push.devices + " device" + (j.push.devices > 1 ? "s" : "") : "off"]].map(([a, b]) => "<div>" + a + "<b>" + esc(b) + "</b></div>").join("") +
      (s.auto ? "<div class='full own-build'><small>" + (s.next ? "Builds on its own time: next around <b>" + esc(new Date(s.next.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + "</b>" + (s.next.at - Date.now() > 20 * 3600e3 ? " tomorrow" : "") + (s.next.why ? " · " + esc(s.next.why) : "") : "Builds on its own time") +
        (s.today ? " · today " + s.today.builds + "/" + s.today.maxBuilds + " missions, " + s.today.calls + "/" + s.today.maxCalls + " calls" : "") + "</small><button class='ghost sm' id='g-buildnow' title='Ask " + esc(s.name) + " to start something of its own now; it still picks what'>Build something now</button></div>" : "") +
      "<div class='full'><small><a href='/vigil-app#system'>" + (j.push && j.push.devices ? "Phone alerts are on" + (j.push.lastSent ? " · last sent " + ago(j.push.lastSent) : "") + " · settings in Vigil ↗" : "Get " + esc(s.name) + "'s alerts on your phone: turn them on in Vigil → System ↗") + "</a></small></div>";
    $("g-lessons").innerHTML = (j.lessons || []).map((l) => "<div class='mi lesson'><p><small>" + (l.src === "anders" ? "<b>" + esc(s.creator) + "</b>" : l.src === "reflection" ? "learned on its own" : esc(l.src)) + " · " + ago(l.ts) + "</small>" + esc(l.text) + "</p><button data-les='" + l.id + "' title='Retire this lesson'>✕</button></div>").join("") || "<p class='dim sm'>No lessons yet.</p>";
    $("g-retired").innerHTML = (j.retired || []).map((l) => "<div class='mi'><p><small>retired " + ago(l.off_ts) + (l.why ? " · " + esc(l.why) : "") + "</small>" + esc(l.text) + "</p><button data-res='" + l.id + "' title='Bring it back'>↺</button></div>").join("") || "<p class='dim sm'>None.</p>";
    $("g-retd").classList.toggle("hidden", !(j.retired || []).length);
    const st8 = (i) => i.status === "building" ? "the swarm is on it (" + (i.by_ === "genesis" ? "started by " + s.name : "started by you") + (i.ps ? " · " + i.ps : "") + ")" : i.status === "built" ? "built: the result is waiting for you" : i.status;
    // grouped by where they are, each a title and two lines (tap to read it all), so a long list stays a list
    const ideaRow = (i) => "<div class='mi idea'><p><small>" + esc(st8(i)) + " · " + ago(i.ts) + "</small><b>" + esc(i.title) + "</b><span class='more' data-more tabindex='0' role='button' title='Tap to read it all'>" + esc(i.detail) + "</span></p><div class='ib'>" + ((i.status === "building" || i.status === "built") && i.pid ? "<button data-iopen='" + esc(i.pid) + "'>" + (i.status === "built" ? "Result" : "Open") + "</button>" : "<button data-ib='" + i.id + "' title='Hand it to the Swarm to build'>Build</button>") + "<button data-idx='" + i.id + "' title='" + (i.status === "built" ? "Clear it from the list (the result stays in the Swarm)" : "Not now") + "'>✕</button></div></div>";
    const groups = [["open", "on its list"], ["building", "being built"], ["built", "built · results waiting for you"]].map(([k, h]) => [k, h, (j.ideas || []).filter((i) => (i.status === k) || (k === "open" && !["building", "built"].includes(i.status)))]).filter((g) => g[2].length);
    $("g-ideas").innerHTML = groups.map(([k, h, is]) => "<div class='ig'><h4>" + h + " <i>" + is.length + "</i>" + (k === "built" && is.length > 1 ? "<button class='ghost sm' data-iclear>Clear all built</button>" : "") + "</h4>" + is.map(ideaRow).join("") + "</div>").join("") || "<p class='dim sm'>No ideas yet. " + name + " proposes them when it reflects.</p>";
    $("g-journal").innerHTML = (j.journal || []).map((e) => "<div class='je " + esc(e.kind) + "'><small>" + esc(e.kind === "milestone" ? "milestone" : e.kind === "watch" ? "on watch · vigil's board" : "reflection") + " · " + new Date(e.ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (e.model ? " · " + esc(String(e.model).split("|").pop().split("/").pop()) : "") + "</small><p>" + esc(e.text) + "</p></div>").join("") || "<p class='dim sm'>Empty.</p>";
  },
  async reflect() {
    const b = $("g-reflect"); b.disabled = true; b.textContent = "Reflecting…";
    const j = await api("/genesis/reflect", {}).catch(() => ({ error: "couldn't reach AutoFaber" })); b.disabled = false; b.textContent = "Reflect now";
    if (j.error) toast(j.error, 6000); else toast("Reflected: " + [j.added.length + " learned", j.retired.length + " retired", j.ideas.length + " ideas"].join(" · "), 4000); GenV.load();
  },
};
if ($("genp")) {
$("g-reflect").onclick = () => GenV.reflect();
$("g-facts").addEventListener("click", async (e) => { if (!e.target.closest("#g-buildnow")) return; const b = e.target.closest("#g-buildnow"); b.disabled = true; b.textContent = "Choosing…";
  const j = await api("/genesis/build-now", {}).catch(() => ({ error: "couldn't reach AutoFaber" })); toast(j.error ? j.error : j.started ? (gname || "AutoFaber") + " started “" + j.started + "” (" + j.size + ", " + j.how + ")" : j.rested ? (gname || "AutoFaber") + " is resting: it has used today's budget" : "Nothing started", 5000); MindV.load(); });
$("g-auto").onchange = async () => { const on = $("g-auto").checked, j = await api("/genesis/auto", { on }).catch(() => ({ error: "couldn't reach AutoFaber" })); if (j.error) { $("g-auto").checked = !on; return toast(j.error + ": autonomy unchanged", 4000); } toast(on ? gname + " builds on its own now: when it chooses, at the size it chooses, within its daily budget" : gname + "'s ideas wait for you", 3500); GenV.load(); };
$("g-check").onclick = async () => {
  const b = $("g-check"), box = $("g-health"); b.disabled = true; b.textContent = "Checking…";
  const j = await api("/genesis/health").catch(() => ({ error: "couldn't reach AutoFaber" })); b.disabled = false; b.textContent = "Check systems";
  if (j.error) return toast(j.error, 5000); box.classList.remove("hidden");
  box.innerHTML = j.checks.map((c) => "<div class='" + (c.wait ? "wait" : c.ok ? "ok" : "no") + "'><b>" + (c.wait ? "◷" : c.ok ? "✓" : "✗") + "</b><span>" + esc(c.name) + "<small>" + esc(c.detail || "") + " · " + c.ms + " ms</small></span></div>").join("");
  toast(j.ok ? "All " + j.checks.length + " checks passed" : j.checks.filter((c) => !c.ok).length + " need attention", 3000); };
$("g-add").onclick = async () => { const t = $("g-new").value.trim(); if (!t) return; const j = await api("/genesis/teach", { text: t }); if (j.error) return toast(j.error, 5000); $("g-new").value = ""; toast(gname + " learned it"); GenV.load(); };
$("g-new").onkeydown = (e) => { if (e.key === "Enter") $("g-add").click(); };
$("genp").closest(".pane").addEventListener("click", async (e) => {
  const mo = e.target.closest("[data-more]"); if (mo) return mo.classList.toggle("open");
  if (e.target.closest("[data-iclear]")) { const built = (GenV.j.ideas || []).filter((i) => i.status === "built"); if (!confirm("Clear all " + built.length + " built ideas from this list? Their results stay in the Swarm.")) return; for (const i of built) await api("/genesis/idea", { id: i.id, act: "dismiss" }); toast("Cleared " + built.length); return GenV.load(); }
  const t = e.target.closest("[data-les],[data-res],[data-ib],[data-idx],[data-iopen]"); if (!t) return;
  if (t.dataset.les) { await api("/genesis/retire", { id: t.dataset.les }); return GenV.load(); }
  if (t.dataset.res) { const j = await api("/genesis/restore", { id: t.dataset.res }); if (j.error) toast(j.error); return GenV.load(); }
  if (t.dataset.idx) { await api("/genesis/idea", { id: t.dataset.idx, act: "dismiss" }); return GenV.load(); }
  if (t.dataset.iopen) { history.replaceState(null, "", "/hive-app?p=" + t.dataset.iopen + "#swarm"); return route(); }
  const i = (GenV.j.ideas || []).find((x) => String(x.id) === t.dataset.ib); if (!i || !confirm("Hand “" + i.title + "” to the Swarm? It plans, builds and reviews it; you decide what goes live.")) return;
  const j = await api("/new", { brief: i.title + "\n\n" + i.detail + "\n\n(" + gname + "'s own idea for itself: something to add to AutoFaber on mentifaber.org. Deliver code and notes Anders can review and add; nothing here deploys itself.)" + (GenV.j.arch ? "\n\n" + GenV.j.arch : "") }); if (j.error) return toast(j.error, 4000);
  try { const mm = JSON.parse(localStorage.getItem("hive-mine") || "{}"); mm[j.id] = j.ctok; localStorage.setItem("hive-mine", JSON.stringify(mm)); } catch (x) {}
  await api("/genesis/idea", { id: i.id, act: "built", pid: j.id }); history.replaceState(null, "", "/hive-app?p=" + j.id + "#swarm"); route();
});
}

// down in the layers the surface thins to one line until you touch it (with a little slack, so it doesn't flicker)
$("scroll").addEventListener("scroll", () => { const t = $("scroll").scrollTop, deep = $("scroll").classList.contains("deep"); if (!deep && t > 140 && chat) $("scroll").classList.add("deep"); else if (deep && t < 24) $("scroll").classList.remove("deep"); }, { passive: true });
// ── start ──
greet(); drawHist(); ground(true); stone(); loadModels().then(() => { const c = new URLSearchParams(location.search).get("c"); if (c) openChat(c); if (owner && !LS.get("mind-sync", 0)) MindV.importLocal(true); }); route(); sync();
})();
