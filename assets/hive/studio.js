// Hive · Studio: one conversation with any model, plus web search, page reading, images, video, voice and pictures.
// Conversations stay on this device; keys stay on the server.
(() => {
"use strict";
const $ = (id) => document.getElementById(id), esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LS = { get(k, d) { try { const v = localStorage.getItem("hive:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("hive:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
const api = async (path, body, signal) => { const r = await fetch("/api/hive" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal } : { cache: "no-store", signal }); const j = await r.json().catch(() => ({ error: "the server said " + r.status })); if (!r.ok && !j.error) j.error = "the server said " + r.status; return j; };
const toast = (t, ms) => { const e = $("toast"); e.textContent = t; e.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add("hidden"), ms || 2600); };
const ICON = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 5" opacity=".6"/><path d="M20 6l12 7v14l-12 7-12-7V13z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 13l6 3.5v7L20 27l-6-3.5v-7z" fill="currentColor"/></svg>';
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "#"); // only real web links leave the page
const SV = { swarm: '<svg viewBox="0 0 24 24"><path d="M8 3l4 2.3v4.6L8 12.2 4 9.9V5.3zM16 3l4 2.3v4.6l-4 2.3-4-2.3V5.3zM12 11.8l4 2.3v4.6L12 21l-4-2.3v-4.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>', copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>', say: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>', redo: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', dl: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' };

// ── theme ──
const applyTheme = () => { document.documentElement.dataset.theme = LS.get("theme", "dark") === "light" ? "light" : "dark"; }; // dark by default: it's a command deck
applyTheme(); $("theme").onclick = () => { const t = LS.get("theme", "dark") === "light" ? "dark" : "light"; LS.set("theme", t); applyTheme(); toast(t === "light" ? "Daylight mode" : "Night mode"); };

// ── views ──
let owner = false;
function route() {
  const v = (location.hash.slice(1) || (new URLSearchParams(location.search).get("p") ? "swarm" : "studio")).split("?")[0];
  const view = ["studio", "swarm", "keys"].includes(v) ? v : "studio";
  for (const s of ["studio", "swarm", "keys"]) $("v-" + s).classList.toggle("hidden", s !== view);
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === view));
  document.body.classList.remove("side");
  if (view === "swarm") window.HiveSwarm.show(); else window.HiveSwarm.hide();
  if (view === "keys") Keys.load();
  if (view === "studio") setTimeout(() => $("inp").focus({ preventScroll: true }), 50);
}
addEventListener("hashchange", route);
$("menu").onclick = () => document.body.classList.add("side"); document.querySelectorAll("[data-menu]").forEach((b) => (b.onclick = () => document.body.classList.add("side")));
$("scrim").onclick = $("sideX").onclick = () => document.body.classList.remove("side");

// ── models ──
async function loadModels() {
  const j = await api("/models").catch(() => ({ models: [] })); owner = !!j.owner; models = j.models || [];
  if (j.resting) { const t = new Date(j.resting).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); models.forEach((m) => { if (m.id.startsWith("workers-ai|")) m.group = "Cloudflare Workers AI (free) · resting until " + t; }); }
  const sel = $("model"), groups = {}; for (const m of models) (groups[m.group] = groups[m.group] || []).push(m);
  sel.innerHTML = Object.entries(groups).map(([g, ms]) => "<optgroup label='" + esc(g) + "'>" + ms.map((m) => "<option value='" + esc(m.id) + "'>" + esc(m.name) + "</option>").join("") + "</optgroup>").join("") || "<option value=''>No models available</option>";
  const want = (chat && chat.model) || LS.get("model", ""); if (models.some((m) => m.id === want)) sel.value = want; else { const d = models.find((m) => /gpt-oss-120b/.test(m.id)) || models[0]; if (d) sel.value = d.id; }
  if (j.resting && j.standIn && sel.value.startsWith("workers-ai|")) { sel.value = j.standIn; toast("Cloudflare's free allowance is resting, so Hive switched to " + nameOf(j.standIn), 5000); }
  $("mtot").textContent = models.length + " models"; showPick();
  const pg = {}; for (const m of models) { const k = m.group.split(" · resting")[0]; (pg[k] = pg[k] || { label: k.replace(/\s*\(.*?\)/g, "").replace(/ ••.*$/, "").replace(/^.*· /, ""), n: 0, free: m.id.startsWith("workers-ai|") }).n++; }
  const gl = Object.values(pg); $("esub").textContent = "> " + models.length + " models · " + gl.length + " provider" + (gl.length === 1 ? "" : "s") + " linked · council ready";
  $("t-models").textContent = models.length + " / " + gl.length + " prov"; $("t-free").textContent = j.resting ? "resting" : "online"; $("led-free").className = "led " + (j.resting ? "warn" : "ok");
  if (window.HiveFX) HiveFX.core($("core"), gl); tele();
  $("who").textContent = owner ? (j.search ? "owner · " + j.search + " search key" + (j.search > 1 ? "s" : "") : "owner") : "";
  $("quota").textContent = owner ? "" : "Visitors get the free models and a daily allowance.";
}
let models = [];
// live telemetry in the header and the side panel
let lastMs = 0; window.tele = () => tele();
function tele() {
  const modes = [on("web") && "SEARCH", on("council") && "COUNCIL", on("draw") && "IMAGINE"].filter(Boolean);
  $("tele").innerHTML = "MODE <b>" + (modes.join("+") || "DIRECT") + "</b>" + (lastMs ? " LAT <b>" + (lastMs / 1000).toFixed(1) + "s</b>" : "") + " SESSION <b>" + (chat ? chat.msgs.length : 0) + "</b>";
}
const link = () => { const ok = navigator.onLine !== false; $("t-link").textContent = ok ? "online" : "offline"; $("led-link").className = "led " + (ok ? "ok" : "bad"); };
addEventListener("online", link); addEventListener("offline", link); link();
// the picker: thousands of models, searchable
const nameOf = (id) => { const m = models.find((x) => x.id === id); return m ? m.name : "Choose a model"; };
const showPick = () => { $("mname").textContent = nameOf($("model").value); };
function drawPick() {
  const q = $("mq").value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), hit = models.filter((m) => words.every((w) => (m.name + " " + m.group + " " + m.id).toLowerCase().includes(w)));
  const groups = {}; for (const m of hit) (groups[m.group] = groups[m.group] || []).push(m); let shown = 0;
  $("mlist").innerHTML = Object.entries(groups).map(([g, ms]) => "<h6>" + esc(g) + " · " + ms.length + "</h6>" + ms.slice(0, q ? 200 : 60).map((m) => (shown++, "<button role='option' data-m='" + esc(m.id) + "' class='" + (m.id === $("model").value ? "on" : "") + "'>" + esc(m.name) + (m.vision ? "<span class='tg'>sees</span>" : "") + "</button>")).join("")).join("") || "<p class='dim sm' style='padding:10px'>No model matches.</p>";
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
function drawHist() {
  $("hist").innerHTML = chats.map((c) => "<div data-c='" + c.id + "' class='" + (chat && chat.id === c.id ? "on" : "") + "'><span>" + esc(c.title || "New chat") + "</span><button data-del title='Delete'>✕</button></div>").join("") || "<p class='dim sm' style='padding:0 10px'>Your chats appear here.</p>";
}
$("hist").onclick = (e) => { const d = e.target.closest("[data-c]"); if (!d) return; if (e.target.closest("[data-del]")) { chats = chats.filter((c) => c.id !== d.dataset.c); if (chat && chat.id === d.dataset.c) newChat(); save(); return; } openChat(d.dataset.c); };
function newChat() { chat = null; $("log").innerHTML = ""; $("empty").classList.remove("hidden"); greet(); drawHist(); if (location.hash !== "#studio") location.hash = "studio"; else route(); }
function openChat(id) { chat = chats.find((c) => c.id === id); if (!chat) return newChat(); if (chat.model && models.some((m) => m.id === chat.model)) $("model").value = chat.model; $("empty").classList.add("hidden"); $("log").innerHTML = ""; chat.msgs.forEach((m, i) => drawMsg(m, i)); drawHist(); if (location.hash !== "#studio") location.hash = "studio"; else route(); scrollEnd(true); }
$("newchat").onclick = newChat;
function greet() {
  const ideas = [["COUNCIL", "Five models debate, one merges", "What's the best way to learn a new programming language fast? Disagree with each other if you need to.", false, false, false, true], ["RECON", "Live web, cited sources", "What are the most important AI developments this week?", true], ["IMAGINE", "Render an image from words", "A glowing honeycomb city at night, bees as tiny airships, cinematic", false, true], ["BUILD", "Code a working thing", "Write a tiny snake game in one HTML file."], ["SWARM", "Agents build a whole project", null, false, false, false, false, true], ["VOICE LINK", "Talk, hands-free", null, false, false, true]];
  $("starters").innerHTML = ideas.map((x, i) => "<button data-i='" + i + "'><b>" + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></button>").join("");
  $("starters").onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; const x = ideas[+b.dataset.i]; if (x[7]) { location.hash = "swarm"; return; } if (x[5]) return Voice.start(); setTog("web", !!x[3]); setTog("draw", !!x[4]); setTog("council", !!x[6]); $("inp").value = x[2]; send(); }; }

// ── markdown (small, safe: everything is escaped first) ──
function md(src, sources) {
  const blocks = [], code = [];
  let s = String(src || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (_, lang, body) => { code.push([lang, body.replace(/\n$/, "")]); return "\u0000C" + (code.length - 1) + "\u0000"; });
  s = esc(s);
  const inline = (t) => t.replace(/`([^`\n]+)`/g, (_, c) => "<code>" + c + "</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>").replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, u) => "<a href='" + u + "' target='_blank' rel='noopener noreferrer'>" + a + "</a>")
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => p + "<a href='" + u + "' target='_blank' rel='noopener'>" + u + "</a>")
    .replace(/\[(\d{1,2})\]/g, (m, n) => { const x = sources && sources[n - 1]; return x ? "<a class='cite' href='" + esc(safeUrl(x.url)) + "' target='_blank' rel='noopener' title='" + esc(x.title) + "'>" + n + "</a>" : m; });
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
  return out.replace(/\u0000C(\d+)\u0000/g, (_, n) => { const [lang, body] = code[n]; return "<div class='pre'><header><span>" + esc(lang || "code") + "</span><span>" + (/^html?$/i.test(lang) ? "<button data-run='" + n + "'>Preview</button>" : "") + "<button data-copy='" + n + "'>Copy</button></span></header><pre><code>" + esc(body) + "</code></pre></div>"; });
}
const codeOf = (el, n) => { const m = chat && chat.msgs[+el.closest(".m").dataset.i]; const all = []; String(m && m.text || "").replace(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(```|$)/g, (_, l, b) => all.push(b.replace(/\n$/, ""))); return all[n] || ""; };

// ── drawing messages ──
function drawMsg(m, i) {
  const d = document.createElement("div"); d.className = "m " + (m.role === "user" ? "user" : "ai"); d.dataset.i = i;
  if (m.role === "user") d.innerHTML = "<div>" + (m.thumbs && m.thumbs.length ? "<div class='thumbs'>" + m.thumbs.map((t) => "<img src='" + esc(t) + "' alt=''>").join("") + "</div>" : "") + (m.files && m.files.length ? "<div class='tools' style='justify-content:flex-end'>" + m.files.map((f) => "<span>📄 " + esc(f) + "</span>").join("") + "</div>" : "") + (m.show || m.text ? "<div class='b'>" + esc(m.show || m.text) + "</div>" : "") + "</div>";
  else {
    const who = "<div class='who-line'>HIVE // <b>" + esc(String(m.model || $("model").value || "").split("|").pop().split("/").pop()) + "</b>" + (m.council ? " · COUNCIL" : "") + (m.streaming ? " · STREAMING" : "") + "</div>";
    const body = m.pending && !m.text ? who + (m.council ? "<div class='const'><svg><line x1='26' y1='16' x2='92' y2='62'/><line x1='156' y1='20' x2='92' y2='62'/><line x1='16' y1='96' x2='92' y2='62'/><line x1='162' y1='98' x2='92' y2='62'/><line x1='94' y1='8' x2='92' y2='62'/></svg><i class='lead'></i><i></i><i></i><i></i><i></i><i></i></div>" : "<div class='dots'><i></i><i></i><i></i></div>") + (m.status ? "<div class='tools'><span>" + esc(m.status) + "</span></div>" : "")
      : m.pending ? who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + md(m.text, m.sources).replace(/(<\/[a-z0-9]+>)?$/, "<span class='caret'></span>$1")
      : m.error ? "<p class='err'>" + esc(m.error) + "</p>"
      : who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + (m.image ? "<img class='gen' src='" + esc(m.image) + "' alt='" + esc(m.text) + "'><p class='dim' style='font-size:14px;margin-top:6px'>" + esc(m.text) + "</p>" : md(m.text, m.sources)) +
        (m.drafts && m.drafts.length ? "<details class='drafts'><summary>⬡ " + m.drafts.filter((x) => x.text).length + " COUNCIL DRAFTS" + (m.drafts.some((x) => x.error) ? " · " + m.drafts.filter((x) => x.error).length + " couldn't answer (tap to see why)" : "") + "</summary><div class='grid-d'>" + m.drafts.map((x) => "<div class='d" + (x.error ? " err" : "") + "'><h5>" + esc(x.model.split("|").pop().split("/").pop()) + " · " + (x.ms / 1000).toFixed(1) + "s</h5><div class='b'>" + (x.error ? esc(x.error) : md(x.text)) + "</div></div>").join("") + "</div></details>" : "") +
        (m.sources && m.sources.length ? "<div class='srcs'>" + m.sources.map((s, k) => "<a href='" + esc(safeUrl(s.url)) + "' target='_blank' rel='noopener noreferrer'><b>" + (k + 1) + "</b><span>" + esc(s.title) + "</span></a>").join("") + "</div>" : "");
    d.innerHTML = "<div class='av" + (m.pending ? " think" : "") + "'>" + ICON + "</div><div style='flex:1;min-width:0'><div class='b'>" + body + "</div>" + (m.pending ? "" : "<div class='acts'>" + (m.image ? "<button data-act='dl' title='Download'>" + SV.dl + "</button>" : "<button data-act='copy' title='Copy'>" + SV.copy + "</button><button data-act='say' title='Read aloud'>" + SV.say + "</button>") + "<button data-act='redo' title='Try again'>" + SV.redo + "</button>" + (m.image ? "" : "<button data-act='swarm' title='Hand this to the swarm to build'>" + SV.swarm + "</button>") + (m.model ? "<span class='meta'>" + esc(m.model.split("|").pop().split("/").pop()) + (m.ms ? " · " + (m.ms / 1000).toFixed(1) + "s" : "") + "</span>" : "") + "</div>") + "</div>";
  }
  const old = $("log").querySelector(".m[data-i='" + i + "']"); if (old) old.replaceWith(d); else $("log").appendChild(d);
  return d;
}
const scrollEnd = (now) => { const s = $("scroll"); if (now || s.scrollHeight - s.scrollTop - s.clientHeight < 240) s.scrollTop = s.scrollHeight; };
$("log").onclick = async (e) => {
  const c = e.target.closest("[data-copy]"), r = e.target.closest("[data-run]"), a = e.target.closest("[data-act]");
  if (c) { navigator.clipboard.writeText(codeOf(c, +c.dataset.copy)).then(() => { c.textContent = "Copied"; setTimeout(() => (c.textContent = "Copy"), 1400); }); return; }
  if (r) { const w = window.open("", "_blank"); if (w) { w.document.open(); w.document.write(codeOf(r, +r.dataset.run)); w.document.close(); } return; }
  if (!a || !chat) return; const i = +a.closest(".m").dataset.i, m = chat.msgs[i];
  if (a.dataset.act === "copy") { navigator.clipboard.writeText(m.text || ""); toast("Copied"); }
  if (a.dataset.act === "say") Voice.say(plain(m.text));
  if (a.dataset.act === "dl") { const x = document.createElement("a"); x.href = m.image; x.download = "hive-" + Date.now() + ".jpg"; x.click(); }
  if (a.dataset.act === "swarm") { const u = chat.msgs[i - 1], brief = ((u && u.text) || "") + "\n\nWhat we worked out so far:\n" + String(m.text || "").slice(0, 4000);
    if (!confirm("Release the swarm on this? It splits the work into tasks and builds it.")) return; const j = await api("/new", { brief }); if (j.error) return toast(j.error, 4000);
    try { const mm = JSON.parse(localStorage.getItem("hive-mine") || "{}"); mm[j.id] = j.ctok; localStorage.setItem("hive-mine", JSON.stringify(mm)); } catch (x) {} history.replaceState(null, "", "/hive?p=" + j.id + "#swarm"); route(); return; }
  if (a.dataset.act === "redo") { const u = chat.msgs[i - 1]; if (!u || u.role !== "user") return; chat.msgs.splice(i); [...$("log").children].forEach((n) => +n.dataset.i >= i && n.remove()); run(u.mode === "image"); }
};
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
inp.addEventListener("input", () => { grow(); sync(); });
inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !(matchMedia("(pointer:coarse)").matches)) { e.preventDefault(); send(); } });
const setTog = (id, v) => { $(id).setAttribute("aria-pressed", v ? "true" : "false"); if (id === "draw") inp.placeholder = v ? "Describe an image to render…" : "Transmit…  ( / for commands )"; if (window.tele) tele(); };
$("web").onclick = () => { setTog("web", $("web").getAttribute("aria-pressed") !== "true"); if ($("web").getAttribute("aria-pressed") === "true") setTog("draw", false); };
$("council").onclick = () => { setTog("council", $("council").getAttribute("aria-pressed") !== "true"); if (on("council")) setTog("draw", false); };
$("draw").onclick = () => { setTog("draw", $("draw").getAttribute("aria-pressed") !== "true"); if ($("draw").getAttribute("aria-pressed") === "true") setTog("web", false); };
const on = (id) => $(id).getAttribute("aria-pressed") === "true";
["web", "council", "draw"].forEach((id) => $(id).addEventListener("click", () => setTimeout(tele)));
let busy = null; // AbortController while a reply is coming
$("sendb").onclick = () => (busy ? busy.abort() : send());

function send(text, opts) {
  opts = opts || {}; text = (text != null ? text : inp.value).trim(); if (busy || (!text && !att.length)) return;
  const sl = /^\/(\w+)\s*([\s\S]*)$/.exec(text); // slash commands: /search /council /imagine /swarm /model /new
  if (sl) { const [, c, rest] = sl;
    if (c === "new") { inp.value = ""; return newChat(); }
    if (c === "model") { const q = rest.toLowerCase(), m = models.find((x) => x.name.toLowerCase() === q) || models.find((x) => (x.name + " " + x.group).toLowerCase().includes(q)); inp.value = ""; grow(); if (!m) return toast("No model matches “" + rest + "”"); $("model").value = m.id; $("model").onchange(); return toast("Model: " + m.name); }
    if (c === "swarm") { inp.value = ""; grow(); if (!rest) { location.hash = "swarm"; return; } return api("/new", { brief: rest }).then((j) => { if (j.error) return toast(j.error, 4000); try { const mm = JSON.parse(localStorage.getItem("hive-mine") || "{}"); mm[j.id] = j.ctok; localStorage.setItem("hive-mine", JSON.stringify(mm)); } catch (x) {} history.replaceState(null, "", "/hive?p=" + j.id + "#swarm"); route(); }); }
    const map = { search: "web", web: "web", council: "council", imagine: "draw", draw: "draw" };
    if (map[c] && rest) { setTog("web", c === "search" || c === "web" ? true : on("web") && map[c] !== "draw"); setTog("council", map[c] === "council"); setTog("draw", map[c] === "draw"); text = rest; }
  }
  if (!$("model").value && !on("draw")) return toast("No model is available right now");
  if (!chat) { chat = { id: Math.random().toString(36).slice(2, 10), title: (text || att.map((a) => a.name).join(", ")).slice(0, 60), model: $("model").value, msgs: [], ts: Date.now() }; chats.unshift(chat); $("empty").classList.add("hidden"); }
  const files = att.filter((a) => a.kind === "file"), imgs = att.filter((a) => a.kind === "image"), vid = att.find((a) => a.kind === "video");
  const full = text + files.map((f) => "\n\n" + f.name + ":\n```\n" + f.text.slice(0, 100000) + "\n```").join("");
  const u = { role: "user", text: full, show: text, files: files.map((f) => f.name), thumbs: [...imgs, ...(vid ? [vid] : [])].map((a) => a.thumb), mode: on("draw") ? "image" : "chat", web: on("web"), council: on("council") && !on("draw"), voice: !!opts.voice };
  u._images = vid ? vid.frames.map((f) => f.data) : imgs.map((a) => a.data); u._frames = vid ? vid.frames.map((f) => f.t) : null;
  chat.msgs.push(u); drawMsg(u, chat.msgs.length - 1); chat.ts = Date.now();
  inp.value = ""; att = []; drawAtt(); grow(); save(); scrollEnd(true);
  return run(u.mode === "image", opts);
}
async function run(image, opts) {
  opts = opts || {}; const u = chat.msgs[chat.msgs.length - 1], i = chat.msgs.length, m = { role: "assistant", pending: true, status: image ? "painting…" : u.council ? "the council is drafting…" : u.web ? "searching the web…" : (u._images && u._images.length) ? (u._frames ? "watching the video…" : "looking…") : /https?:\/\//.test(u.text) ? "reading the page…" : "" };
  chat.msgs.push(m); drawMsg(m, i); scrollEnd(true); busy = new AbortController(); $("sendb").classList.add("stop"); $("sendb").disabled = false; $("sendb").innerHTML = "<svg viewBox='0 0 24 24'><rect x='7' y='7' width='10' height='10' rx='2' fill='currentColor'/></svg>";
  const t0 = Date.now(); let j; m.council = !!u.council; m.model = $("model").value;
  const body = { lang: navigator.language || "en", model: $("model").value, web: u.web, swarm: !!u.council, voice: !!opts.voice || u.voice, frames: u._frames || undefined, system: LS.get("sys", "") || undefined,
    messages: chat.msgs.slice(0, -1).filter((x) => !x.error && !x.image).map((x, k, arr) => ({ role: x.role, text: x.text, images: k === arr.length - 1 ? x._images || [] : [] })) };
  try {
    if (image) j = await api("/imagine", { prompt: u.text }, busy.signal);
    else if (u.council) j = await api("/chat", body, busy.signal);
    else j = await stream(body, m, i, busy.signal);
  } catch (e) { j = { error: e.name === "AbortError" ? (m.text ? null : "Stopped.") : "Couldn't reach the Hive. Check your connection.", text: m.text }; if (j.error === null) { delete j.error; j.tools = m.tools; j.sources = m.sources; } }
  busy = null; $("sendb").classList.remove("stop"); $("sendb").innerHTML = "<svg viewBox='0 0 24 24'><path d='M12 19V5M5.5 11.5 12 5l6.5 6.5' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>"; sync();
  delete m.pending; delete m.status;
  delete m.streaming;
  if (j.error) m.error = j.error; else if (image) { m.image = j.image; m.text = u.text; m.model = "flux-1-schnell"; } else Object.assign(m, { text: j.text, sources: j.sources, tools: j.tools, drafts: j.drafts, model: j.model || $("model").value });
  m.ms = Date.now() - t0; lastMs = m.ms; tele();
  if (chat.msgs[i] === m) { drawMsg(m, i); scrollEnd(); } delete u._images; save();
  return m;
}
// streamed replies: server-sent events meta → delta… → done; the message redraws at most once a frame
async function stream(body, m, i, signal) {
  const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, stream: true }), signal });
  if (!/event-stream/.test(r.headers.get("content-type") || "")) { const j = await r.json().catch(() => ({ error: "the server said " + r.status })); if (!r.ok && !j.error) j.error = "the server said " + r.status; return j; }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = { text: "" }, raf = 0;
  m.text = ""; m.streaming = true;
  const paint = () => { raf = 0; if (chat && chat.msgs[i] === m) { drawMsg(m, i); scrollEnd(); } };
  for (;;) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let k; while ((k = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, k); buf = buf.slice(k + 2); const ev = (/^event: (.*)$/m.exec(chunk) || [])[1], data = (/^data: (.*)$/m.exec(chunk) || [])[1]; if (!ev || !data) continue; let d; try { d = JSON.parse(data); } catch (e) { continue; }
      if (ev === "meta") { m.tools = d.tools; m.sources = d.sources; if (d.model) m.model = d.model; out.sources = d.sources; out.tools = d.tools; out.model = d.model; }
      else if (ev === "delta") { m.text += d.t; out.text = m.text; if (!raf) raf = requestAnimationFrame(paint); }
      else if (ev === "done") { out.tools = d.tools || out.tools; out.model = d.model || out.model; }
      else if (ev === "error") { if (!m.text) return { error: d.error }; out.text = m.text + "\n\n_(" + d.error + ")_"; }
    }
  }
  return out;
}
// ── command palette (⌘K) ──
const CMDS = () => [
  ["New session", "⇧⌘O", () => newChat()], ["Studio", "view", () => (location.hash = "studio")], ["Swarm", "view", () => (location.hash = "swarm")], ["Uplinks · keys", "view", () => (location.hash = "keys")],
  ["Toggle search", "mode", () => $("web").click()], ["Toggle council", "mode", () => $("council").click()], ["Toggle imagine", "mode", () => $("draw").click()],
  ["Voice link", "voice", () => Voice.start()], ["Export session", "md", () => $("export").click()], ["Directives", "settings", () => $("settings").click()], ["Cycle theme", "theme", () => $("theme").click()],
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
$("cmdk-btn").onclick = $("cmdk-top").onclick = openCmd;
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); } });
window.HiveMD = md;
$("export").onclick = () => { if (!chat) return toast("Nothing to export yet"); const t = "# " + chat.title + "\n\n" + chat.msgs.map((m) => (m.role === "user" ? "**You:** " : "**Hive:** ") + (m.image ? "![image](generated)" : m.text || m.error || "") + (m.sources && m.sources.length ? "\n\n" + m.sources.map((s, k) => "[" + (k + 1) + "] " + s.url).join("\n") : "")).join("\n\n---\n\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/markdown" })); a.download = chat.title.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 50) + ".md"; a.click(); };
$("settings").onclick = () => { $("sys").value = LS.get("sys", ""); $("sdlg").showModal(); };
$("ssave").onclick = () => { LS.set("sys", $("sys").value.trim()); $("sdlg").close(); toast("Saved"); };
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
// Records until stop() — or, with vad, until the speaker has been quiet a moment. Reports level for the orb.
async function record(opt) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream), chunks = [], ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
  const data = new Uint8Array(an.fftSize); let spoke = false, quiet = 0, raf = 0, t0 = performance.now(), done;
  const finished = new Promise((ok) => (done = ok));
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ac.close(); done(spoke || !opt.vad ? new Blob(chunks, { type: rec.mimeType }) : null); };
  const tick = () => { an.getByteTimeDomainData(data); let s = 0; for (const v of data) s += (v - 128) ** 2; const lv = Math.min(1, Math.sqrt(s / data.length) / 30); opt.level && opt.level(lv);
    if (opt.vad) { if (lv > .18) { spoke = true; quiet = 0; } else if (spoke) quiet += 16; if ((spoke && quiet > 1300) || performance.now() - t0 > 60000 || (!spoke && performance.now() - t0 > 15000)) return rec.state === "recording" && rec.stop(); }
    raf = requestAnimationFrame(tick); };
  rec.start(); tick();
  return { stop: () => rec.state === "recording" && rec.stop(), finished };
}
async function stt(blob) { const j = await api("/stt", { audio: await toWav(blob), lang: (navigator.language || "en").slice(0, 2) }); if (j.error) throw new Error(j.error); return j.text; }

// dictation: live browser recognition when there is one, otherwise record → Whisper
let dict = null;
$("mic").onclick = async () => {
  if (dict) return dict.stop();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, base = inp.value ? inp.value.replace(/\s*$/, " ") : "";
  $("mic").classList.add("rec");
  if (SR) { const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US"; r.onresult = (e) => { inp.value = base + [...e.results].map((x) => x[0].transcript).join(""); grow(); sync(); }; r.onend = () => { dict = null; $("mic").classList.remove("rec"); inp.focus(); }; r.onerror = (e) => e.error !== "no-speech" && toast("Mic: " + e.error); dict = { stop: () => r.stop() }; r.start(); return; }
  try { const h = await record({}); dict = h; const blob = await h.finished; dict = null; $("mic").classList.remove("rec"); toast("Transcribing…"); inp.value = base + (await stt(blob)); grow(); sync(); inp.focus(); }
  catch (e) { dict = null; $("mic").classList.remove("rec"); toast(e.message || "No microphone"); }
};

// voice conversation: listen → transcribe → answer → speak → listen again
const Voice = (window.HiveVoice = {
  on: false, h: null, audio: null,
  set(state, text) { $("vstate").textContent = state; if (text != null) $("vtext").textContent = text; $("orb").className = "orb " + (/Thinking/.test(state) ? "think" : /Speaking/.test(state) ? "talk" : ""); },
  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast("This browser can't record audio");
    if (location.hash !== "#studio") location.hash = "studio";
    Voice.on = true; Voice.paused = false; $("voiceo").classList.remove("hidden"); $("vmute").textContent = "Pause"; Voice.loop();
  },
  async loop() {
    while (Voice.on && !Voice.paused) {
      Voice.set("Listening…", "");
      let blob; try { Voice.h = await record({ vad: true, level: (lv) => $("orb").style.setProperty("--lv", lv) }); blob = await Voice.h.finished; } catch (e) { Voice.set("No microphone", e.message); return; }
      Voice.h = null; $("orb").style.setProperty("--lv", 0); if (!Voice.on || Voice.paused) return; if (!blob) continue;
      Voice.set("Thinking…"); let text; try { text = await stt(blob); } catch (e) { Voice.set("Couldn't hear that", e.message); await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!text || text.length < 2) continue; $("vtext").textContent = "“" + text + "”";
      const m = await send(text, { voice: true }); if (!Voice.on) return;
      if (!m || m.error) { Voice.set("Something went wrong", m && m.error); await new Promise((r) => setTimeout(r, 2000)); continue; }
      Voice.set("Speaking…", plain(m.text).slice(0, 280)); await Voice.say(plain(m.text));
    }
  },
  say(text) {
    Voice.hush(); if (!text) return Promise.resolve();
    if (LS.get("natural", false)) return api("/tts", { text: text.slice(0, 1800) }).then((j) => new Promise((ok) => { if (j.error) { toast(j.error); return ok(); } const a = (Voice.audio = new Audio(j.audio)); a.onended = a.onerror = ok; a.play().catch(ok); }));
    if (!window.speechSynthesis) return Promise.resolve();
    return new Promise((ok) => { const u = new SpeechSynthesisUtterance(text.slice(0, 3000)); const vs = speechSynthesis.getVoices(), pick = vs.find((v) => /natural|neural|premium|enhanced|samantha|google us english/i.test(v.name) && /^en/.test(v.lang)) || vs.find((v) => /^en/.test(v.lang)); if (pick) u.voice = pick; u.rate = 1.03; u.onend = u.onerror = ok; speechSynthesis.speak(u); });
  },
  hush() { try { speechSynthesis.cancel(); } catch (e) {} if (Voice.audio) { Voice.audio.pause(); Voice.audio = null; } },
  end() { Voice.on = false; Voice.hush(); if (Voice.h) Voice.h.stop(); $("voiceo").classList.add("hidden"); },
});
$("voice").onclick = () => Voice.start(); $("vend").onclick = () => Voice.end();
$("vmute").onclick = () => { Voice.paused = !Voice.paused; $("vmute").textContent = Voice.paused ? "Resume" : "Pause"; if (Voice.paused) { Voice.hush(); if (Voice.h) Voice.h.stop(); Voice.set("Paused", ""); } else Voice.loop(); };
const natBtn = () => { const n = LS.get("natural", false); $("vnat").textContent = "Natural voice: " + (n ? "on" : "off"); $("vnat").setAttribute("aria-pressed", n); };
$("vnat").onclick = () => { LS.set("natural", !LS.get("natural", false)); natBtn(); }; natBtn();
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Voice.on) Voice.end(); });

// ── key vault ──
const Keys = {
  presets: {},
  async load() {
    const j = await api("/keys"); $("k-locked").classList.toggle("hidden", !j.error); $("k-open").classList.toggle("hidden", !!j.error); if (j.error) return;
    Keys.presets = j.presets; const sel = $("k-prov");
    if (!sel.options.length) { const g = { compat: "Models", anthropic: "Models", search: "Web search" }, by = {}; for (const [k, p] of Object.entries(j.presets)) (by[g[p.kind]] = by[g[p.kind]] || []).push("<option value='" + k + "'>" + esc(p.name) + "</option>"); sel.innerHTML = Object.entries(by).map(([n, o]) => "<optgroup label='" + n + "'>" + o.join("") + "</optgroup>").join(""); sel.onchange(); }
    Keys.draw(j.keys);
  },
  draw(keys) {
    Keys.keys = keys; $("kcount").textContent = keys.length + " key" + (keys.length === 1 ? "" : "s");
    $("k-list").innerHTML = keys.length ? keys.map((k) => "<div class='key" + (k.live ? "" : " off") + "' data-k='" + k.id + "'><div class='badge'>" + esc(k.name[0]) + "</div><div class='nm'>" + esc(k.label || k.name) + " <span class='dim' style='font-weight:400'>" + (k.label ? esc(k.name) + " · " : "") + "••••" + esc(k.tail) + "</span></div>" +
      "<div class='bt'><button class='sw' role='switch' aria-checked='" + k.live + "' data-kact='live' title='On / off'></button><button class='ghost sm' data-kact='test'>Test</button><button class='ghost sm' data-kact='del'>Remove</button></div>" +
      "<div class='meta" + (k.err ? " err" : "") + "'>" + (k.err ? "⚠ " + esc(k.err) : k.kind === "search" ? "powers web search" : k.models + " models") + " · used " + k.used + "×" + (k.base ? " · " + esc(k.base) : "") + "</div>" +
      (k.pull ? "<div class='row mt' style='grid-column:2/-1'><input data-pullname placeholder='pull a model, e.g. qwen3:8b, llama3.2, gpt-oss:20b' style='flex:1'><button class='ghost sm' data-kact='pull'>Pull</button></div>" : "") + (k.kind !== "search" && k.list.length ? "<details><summary>" + k.models + " models · swarm uses " + esc(k.pick === "*" ? "up to 40" : k.pick || "its strongest few") + "</summary><div class='row mt'><input data-pick placeholder='models for the swarm, comma separated, or * for up to 40' value='" + esc(k.pick) + "'><button class='ghost sm' data-kact='pick'>Save</button></div><div class='mods'>" + k.list.map((m) => "<code>" + esc(m) + "</code>").join("") + "</div></details>" : "") + "</div>").join("")
      : "<div class='card'><p class='dim' style='margin:0'>No keys yet. The free Workers AI models work without any.</p></div>";
  },
};
$("k-prov").onchange = () => { const p = Keys.presets[$("k-prov").value] || {}; $("k-baseL").classList.toggle("hidden", !p.editBase); $("k-base").placeholder = p.base || "https://your-server.example/v1"; $("k-key").placeholder = p.keyless ? "optional (your own server may not need one)" : "paste it here"; $("k-pickL").classList.toggle("hidden", p.kind === "search"); };
const addKey = async (force) => {
  $("k-add").disabled = true; $("k-msg").textContent = "checking with the provider…"; $("k-force").classList.add("hidden");
  const j = await api("/keys/add", { provider: $("k-prov").value, label: $("k-label").value, base: $("k-base").value, key: $("k-key").value, pick: $("k-pick").value, force }); $("k-add").disabled = false;
  if (j.error) { $("k-msg").textContent = j.error; $("k-force").classList.toggle("hidden", !j.canForce); return; }
  $("k-msg").textContent = "Added " + (j.key.kind === "search" ? "a search key" : j.key.models + " models") + "."; $("k-key").value = $("k-label").value = $("k-pick").value = ""; Keys.load(); loadModels();
};
$("k-add").onclick = () => addKey(false); $("k-force").onclick = () => addKey(true);
$("k-list").onclick = async (e) => {
  const b = e.target.closest("[data-kact]"); if (!b) return; const card = b.closest("[data-k]"), kid = card.dataset.k, k = Keys.keys.find((x) => x.id === kid), act = b.dataset.kact;
  if (act === "del" && !confirm("Remove this key from the vault? It's deleted for good.")) return;
  b.disabled = true; const j = act === "del" ? await api("/keys/del", { kid }) : act === "test" ? await api("/keys/test", { kid }) : act === "pull" ? (toast("Pulling… this can take a while", 25000), await api("/keys/pull", { kid, model: card.querySelector("[data-pullname]").value })) : act === "live" ? await api("/keys/set", { kid, live: !k.live }) : await api("/keys/set", { kid, pick: card.querySelector("[data-pick]").value }); b.disabled = false;
  if (act === "pull") toast(j.error || "Ollama: " + j.status, 5000); else if (act === "test") toast(j.ok ? "Works: " + (j.key.kind === "search" ? "search answered" : j.key.models + " models") : "Failed: " + j.error, 4000); else if (j.error) toast(j.error);
  Keys.load(); loadModels();
};

// ── start ──
greet(); drawHist(); loadModels().then(() => { const c = new URLSearchParams(location.search).get("c"); if (c) openChat(c); }); route(); sync();
})();
