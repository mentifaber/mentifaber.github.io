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
  const view = ["studio", "swarm", "keys", "mind"].includes(v) ? v : "studio";
  for (const s of ["studio", "swarm", "keys", "mind"]) $("v-" + s).classList.toggle("hidden", s !== view);
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === view));
  document.body.classList.remove("side");
  if (view === "swarm") window.HiveSwarm.show(); else window.HiveSwarm.hide();
  if (view === "keys") Keys.load();
  if (view === "mind") MindV.load();
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
  const pg = {}; for (const m of models) { const k = m.group.split(" · resting")[0]; (pg[k] = pg[k] || { label: (() => { let x = k.replace(/\s*\(.*?\)/g, "").replace(/ ••.*$/, ""); if (x.includes(" · ")) x = x.split(" · ").pop(); x = x.replace(/^Cloudflare /, ""); return x.charAt(0).toUpperCase() + x.slice(1); })(), n: 0, free: m.id.startsWith("workers-ai|") }).n++; }
  const gl = Object.values(pg); $("esub").textContent = "> " + models.length + " models · " + gl.length + " provider" + (gl.length === 1 ? "" : "s") + (innerWidth > 600 ? " linked · council ready" : "");
  $("t-models").textContent = models.length + " / " + gl.length + " prov"; $("t-free").textContent = j.resting ? "resting" : "online"; $("led-free").className = "led " + (j.resting ? "warn" : "ok");
  if (window.HiveFX) HiveFX.core($("core"), gl); tele();
  $("who").textContent = owner ? (j.search ? "owner · " + j.search + " search key" + (j.search > 1 ? "s" : "") : "owner") : "";
  $("quota").textContent = owner ? "" : "Visitors get the free models and a daily allowance.";
}
let models = [];
// live telemetry in the header and the side panel
let lastMs = 0, lastTtft = 0, lastCps = 0; window.tele = () => tele();
function tele() {
  const modes = [on("web") && "SEARCH", on("council") && "COUNCIL", on("draw") && "IMAGINE"].filter(Boolean);
  $("tele").innerHTML = "MODE <b>" + (modes.join("+") || "DIRECT") + "</b>" + (lastTtft ? " FIRST WORD <b>" + (lastTtft / 1000).toFixed(2) + "s</b>" : lastMs ? " LAT <b>" + (lastMs / 1000).toFixed(1) + "s</b>" : "") + (lastCps ? " RATE <b>" + lastCps + " ch/s</b>" : "") + " SESSION <b>" + (chat ? chat.msgs.length : 0) + "</b>";
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
  const q = ($("hsearch").value || "").trim().toLowerCase(), list = q ? chats.filter((c) => (c.title + " " + c.msgs.map((m) => m.text || "").join(" ")).toLowerCase().includes(q)) : chats;
  $("hist").innerHTML = list.map((c) => "<div data-c='" + c.id + "' class='" + (chat && chat.id === c.id ? "on" : "") + "'><span>" + esc(c.title || "New chat") + "</span><button data-del title='Delete'>✕</button></div>").join("") || "<p class='dim sm' style='padding:0 10px'>Your chats appear here.</p>";
}
$("hist").onclick = (e) => { const d = e.target.closest("[data-c]"); if (!d) return; if (e.target.closest("[data-del]")) { chats = chats.filter((c) => c.id !== d.dataset.c); if (chat && chat.id === d.dataset.c) newChat(); save(); return; } openChat(d.dataset.c); };
function newChat() { chat = null; $("log").innerHTML = ""; $("empty").classList.remove("hidden"); greet(); drawHist(); if (location.hash !== "#studio") location.hash = "studio"; else route(); }
function openChat(id) { chat = chats.find((c) => c.id === id); if (!chat) return newChat(); if (chat.model && models.some((m) => m.id === chat.model)) $("model").value = chat.model; $("empty").classList.add("hidden"); $("log").innerHTML = ""; chat.msgs.forEach((m, i) => drawMsg(m, i)); drawHist(); if (location.hash !== "#studio") location.hash = "studio"; else route(); scrollEnd(true); }
$("newchat").onclick = newChat; $("hsearch").oninput = drawHist;
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
  if (m.role === "user") d.innerHTML = "<div>" + (m.thumbs && m.thumbs.length ? "<div class='thumbs'>" + m.thumbs.map((t) => "<img src='" + esc(t) + "' alt=''>").join("") + "</div>" : "") + (m.files && m.files.length ? "<div class='tools' style='justify-content:flex-end'>" + m.files.map((f) => "<span>📄 " + esc(f) + "</span>").join("") + "</div>" : "") + (m.show || m.text ? "<div class='b'>" + esc(m.show || m.text) + "</div>" : "") + "<div class='uacts'><button data-uact='edit' title='Edit and resend' aria-label='Edit and resend'>✎</button><button data-uact='copy' title='Copy' aria-label='Copy'>⧉</button></div></div>";
  else {
    const who = "<div class='who-line'>HIVE // <b>" + esc(String(m.model || $("model").value || "").split("|").pop().split("/").pop()) + "</b>" + (m.council ? " · COUNCIL" : "") + (m.streaming ? " · STREAMING" : "") + "</div>";
    const body = m.pending && !m.text ? who + (m.council ? "<div class='const'><svg><line x1='26' y1='16' x2='92' y2='62'/><line x1='156' y1='20' x2='92' y2='62'/><line x1='16' y1='96' x2='92' y2='62'/><line x1='162' y1='98' x2='92' y2='62'/><line x1='94' y1='8' x2='92' y2='62'/></svg><i class='lead'></i><i></i><i></i><i></i><i></i><i></i></div>" : "<div class='dots'><i></i><i></i><i></i></div>") + (m.status ? "<div class='tools'><span>" + esc(m.status) + "</span></div>" : "")
      : m.pending ? who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + md(m.text, m.sources).replace(/(<\/[a-z0-9]+>)?$/, "<span class='caret'></span>$1")
      : m.error ? "<p class='err'>" + esc(m.error) + "</p>"
      : who + (m.tools && m.tools.length ? "<div class='tools'>" + m.tools.map((t) => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") + (m.image ? "<img class='gen' src='" + esc(m.image) + "' alt='" + esc(m.text) + "'><p class='dim' style='font-size:14px;margin-top:6px'>" + esc(m.text) + "</p>" : md(m.text, m.sources)) +
        (m.drafts && m.drafts.length ? "<details class='drafts'><summary>⬡ " + m.drafts.filter((x) => x.text).length + " COUNCIL DRAFTS" + (m.drafts.some((x) => x.error) ? " · " + m.drafts.filter((x) => x.error).length + " couldn't answer (tap to see why)" : "") + "</summary><div class='grid-d'>" + m.drafts.map((x) => "<div class='d" + (x.error ? " err" : "") + "'><h5>" + esc(x.model.split("|").pop().split("/").pop()) + " · " + (x.ms / 1000).toFixed(1) + "s</h5><div class='b'>" + (x.error ? esc(x.error) : md(x.text)) + "</div></div>").join("") + "</div></details>" : "") +
        (m.sources && m.sources.length ? "<div class='srcs'>" + m.sources.map((s, k) => "<a href='" + esc(safeUrl(s.url)) + "' target='_blank' rel='noopener noreferrer'><b>" + (k + 1) + "</b><span>" + esc(s.title) + "</span></a>").join("") + "</div>" : "");
    d.innerHTML = "<div class='av" + (m.pending ? " think" : "") + "'>" + ICON + "</div><div style='flex:1;min-width:0'><div class='b'>" + body + "</div>" + (m.pending ? "" : "<div class='acts'>" + (m.image ? "<button data-act='dl' title='Download'>" + SV.dl + "</button>" : "<button data-act='copy' title='Copy'>" + SV.copy + "</button><button data-act='say' title='Read aloud'>" + SV.say + "</button>") + "<button data-act='redo' title='Try again'>" + SV.redo + "</button>" + (m.image ? "" : "<button data-act='swarm' title='Hand this to the swarm to build'>" + SV.swarm + "</button>") + (m.model ? "<span class='meta'>" + esc(m.model.split("|").pop().split("/").pop()) + (m.ttft ? " · first word " + (m.ttft / 1000).toFixed(2) + "s" : "") + (m.ms ? " · " + (m.ms / 1000).toFixed(1) + "s" : "") + "</span>" : "") + "</div>") + "</div>";
  }
  const old = $("log").querySelector(".m[data-i='" + i + "']"); if (old) old.replaceWith(d); else $("log").appendChild(d);
  return d;
}
const scrollEnd = (now) => { const s = $("scroll"); if (now || s.scrollHeight - s.scrollTop - s.clientHeight < 240) s.scrollTop = s.scrollHeight; };
$("log").onclick = async (e) => {
  const c = e.target.closest("[data-copy]"), r = e.target.closest("[data-run]"), a = e.target.closest("[data-act]");
  if (c) { navigator.clipboard.writeText(codeOf(c, +c.dataset.copy)).then(() => { c.textContent = "Copied"; setTimeout(() => (c.textContent = "Copy"), 1400); }); return; }
  if (r) { const w = window.open("", "_blank"); if (w) { w.document.open(); w.document.write(codeOf(r, +r.dataset.run)); w.document.close(); } return; }
  const ua = e.target.closest("[data-uact]");
  if (ua && chat) { const k = +ua.closest(".m").dataset.i, um = chat.msgs[k]; if (ua.dataset.uact === "copy") { navigator.clipboard.writeText(um.show || um.text || ""); return toast("Copied"); }
    if (busy) return toast("Wait for the reply to finish"); inp.value = um.show || um.text || ""; grow(); sync(); chat.msgs.splice(k); [...$("log").children].forEach((n) => +n.dataset.i >= k && n.remove()); save(); inp.focus(); return toast("Edit and send again"); }
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
inp.addEventListener("keydown", (e) => { if (e.key !== "Enter" || e.shiftKey || e.isComposing) return; const mod = e.metaKey || e.ctrlKey; if (mod || (S("enter") && !matchMedia("(pointer:coarse)").matches)) { e.preventDefault(); send(); } });
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
    if (c === "me" || c === "mind") { inp.value = ""; grow(); location.hash = "mind"; return; }
    if (c === "remember" && rest) { inp.value = ""; grow(); return api("/mind/remember", { text: rest }).then((j) => toast(j.error || "Remembered", 2500)); }
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
  u._images = opts.images || (vid ? vid.frames.map((f) => f.data) : imgs.map((a) => a.data)); u._frames = vid ? vid.frames.map((f) => f.t) : null;
  if (opts.images) { u.thumbs = opts.images.slice(); u.live = true; }
  chat.msgs.push(u); drawMsg(u, chat.msgs.length - 1); chat.ts = Date.now();
  inp.value = ""; att = []; drawAtt(); grow(); save(); scrollEnd(true);
  return run(u.mode === "image", opts);
}
async function run(image, opts) {
  opts = opts || {}; const u = chat.msgs[chat.msgs.length - 1], i = chat.msgs.length, m = { role: "assistant", pending: true, status: image ? "painting…" : u.council ? "the council is drafting…" : u.web ? "searching the web…" : (u._images && u._images.length) ? (u._frames ? "watching the video…" : "looking…") : /https?:\/\//.test(u.text) ? "reading the page…" : "" };
  chat.msgs.push(m); drawMsg(m, i); scrollEnd(true); busy = new AbortController(); $("sendb").classList.add("stop"); $("sendb").disabled = false; $("sendb").innerHTML = "<svg viewBox='0 0 24 24'><rect x='7' y='7' width='10' height='10' rx='2' fill='currentColor'/></svg>";
  const t0 = Date.now(); let j; m.council = !!u.council; m.model = opts.model || $("model").value;
  const body = { lang: navigator.language || "en", model: opts.model || $("model").value, live: !!(opts.live || u.live) || undefined, web: u.web, swarm: !!u.council, voice: !!opts.voice || u.voice, frames: u._frames || undefined, system: LS.get("sys", "") || undefined,
    messages: chat.msgs.slice(0, -1).filter((x) => !x.error && !x.image).map((x, k, arr) => ({ role: x.role, text: x.text, images: k === arr.length - 1 ? x._images || [] : [] })) };
  try {
    if (image) j = await api("/imagine", { prompt: u.text }, busy.signal);
    else if (u.council) j = await api("/chat", body, busy.signal);
    else j = await stream(body, m, i, busy.signal);
  } catch (e) { j = { error: e.name === "AbortError" ? (m.text ? null : "Stopped.") : "Couldn't reach the Hive. Check your connection.", text: m.text }; if (j.error === null) { delete j.error; j.tools = m.tools; j.sources = m.sources; } }
  busy = null; $("sendb").classList.remove("stop"); $("sendb").innerHTML = "<svg viewBox='0 0 24 24'><path d='M12 19V5M5.5 11.5 12 5l6.5 6.5' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>"; sync();
  delete m.pending; delete m.status;
  delete m.streaming;
  if (j.error) m.error = j.error; else if (image) { m.image = j.image; m.text = u.text; m.model = "flux-1-schnell"; } else Object.assign(m, { text: j.text, sources: j.sources, tools: j.tools, drafts: j.drafts, model: j.model || opts.model || $("model").value });
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
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", out = { text: "" }, raf = 0; const tStart = Date.now() - (performance.now() - tReq);
  m.text = ""; m.streaming = true;
  const paint = () => { raf = 0; if (chat && chat.msgs[i] === m) { drawMsg(m, i); scrollEnd(); } };
  for (;;) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let k; while ((k = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, k); buf = buf.slice(k + 2); const ev = (/^event: (.*)$/m.exec(chunk) || [])[1], data = (/^data: (.*)$/m.exec(chunk) || [])[1]; if (!ev || !data) continue; let d; try { d = JSON.parse(data); } catch (e) { continue; }
      if (ev === "meta") { m.tools = d.tools; m.sources = d.sources; if (d.model) m.model = d.model; out.sources = d.sources; out.tools = d.tools; out.model = d.model; }
      else if (ev === "delta") { if (!m.ttft) { m.ttft = Date.now() - tStart; } m.text += d.t; out.text = m.text; if (!raf) raf = requestAnimationFrame(paint); if (body.voice && Voice.live) { Voice.feed(m.text); if (Voice.playing) Voice.set("Speaking…", plain(m.text).slice(-280)); } }
      else if (ev === "done") { out.tools = d.tools || out.tools; out.model = d.model || out.model; }
      else if (ev === "error") { if (!m.text) return { error: d.error }; out.text = m.text + "\n\n_(" + d.error + ")_"; }
    }
  }
  return out;
}
// ── command palette (⌘K) ──
const CMDS = () => [
  ["New session", "⇧⌘O", () => newChat()], ["Studio", "view", () => (location.hash = "studio")], ["Swarm", "view", () => (location.hash = "swarm")], ["Uplinks · keys", "view", () => (location.hash = "keys")], ["Mind · what Hive knows about you", "view", () => (location.hash = "mind")], ["Analyze me", "mind", () => { location.hash = "mind"; MindV.analyze(); }],
  ["Toggle search", "mode", () => $("web").click()], ["Toggle council", "mode", () => $("council").click()], ["Toggle imagine", "mode", () => $("draw").click()],
  ["Voice link", "voice", () => Voice.start()], ["Export session", "md", () => $("export").click()], ["Settings", "voice · theme · data", () => openSettings()], ["Cycle theme", "theme", () => $("theme").click()],
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
const SET = { rate: 1, sil: 800, hands: "1", barge: false, recog: "cloud", vmodel: "", motion: true, enter: true };
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
    Voice.on = true; Voice.paused = false; $("voiceo").classList.remove("hidden"); Voice.ui(); viz.start(); Voice.loop();
  },
  ui() {
    const ptt = S("hands") === "0"; $("vptt").classList.toggle("hidden", !ptt); $("vmute").classList.toggle("hidden", ptt);
    $("vmute").setAttribute("aria-pressed", Voice.paused ? "true" : "false"); $("vmutel").textContent = Voice.paused ? "PAUSED" : "LIVE";
    $("vmodel").textContent = (voiceModel() || $("model").value || "").split("|").pop().split("/").pop() || "VOICE LINK";
    $("vhint").textContent = ptt ? "hold the button while you talk" : S("barge") ? "talk over it to interrupt" : "tap the core to interrupt";
    $("vscreen").classList.toggle("hidden", !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || matchMedia("(pointer:coarse)").matches);
  },
  async listen() { // one turn of the user speaking → text (or null)
    if (S("recog") === "device" && (window.SpeechRecognition || window.webkitSpeechRecognition) && !navigator.brave) return Voice.listenDevice();
    if (S("hands") === "0") { Voice.set("Hold to talk", ""); await new Promise((ok) => (Voice.pttGo = ok)); if (!Voice.on) return null; }
    Voice.set("Listening…", "");
    let blob; try { Voice.h = await record({ vad: S("hands") !== "0", stream: Voice.mic, an: Voice.micAn, silence: S("sil"), level: (lv) => (Voice.lv = lv) }); if (S("hands") === "0") Voice.pttStop = () => Voice.h && Voice.h.stop(); blob = await Voice.h.finished; }
    catch (e) { Voice.set("Microphone error", e.message); return null; }
    Voice.h = null; if (!Voice.on || Voice.paused || !blob) return null;
    Voice.set("Transcribing…"); const t0 = performance.now();
    try { const text = await stt(blob); Voice.sttMs = performance.now() - t0; return text; } catch (e) { Voice.set("Couldn't hear that", e.message); await sleep(1200); return null; }
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
      if (!m || m.error) { Voice.set("Something went wrong", m && m.error); await sleep(1800); continue; }
      Voice.feed(m.text || "", true); if (Voice.q.length || Voice.playing) Voice.set("Speaking…");
      if (S("barge") && S("hands") !== "0") Voice.watchBarge();
      await Voice.drained();
    }
  },
  watchBarge() { // talking over the reply cuts it off and starts the next turn
    let loud = 0; const d = new Uint8Array(Voice.micAn.fftSize);
    const t = setInterval(() => { if (!Voice.playing) return clearInterval(t); Voice.micAn.getByteTimeDomainData(d); let s = 0; for (const v of d) s += (v - 128) ** 2; const lv = Math.sqrt(s / d.length) / 30; loud = lv > .32 ? loud + 50 : 0; if (loud >= 350) { clearInterval(t); Voice.hush(); } }, 50);
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
    return api("/tts", { text, voice: Voice.pick() }).then((j) => (j.error ? { device: text, g, err: j.error } : { url: j.audio, g, used: j.used })).catch(() => ({ device: text, g })); },
  queue(text) { text = plain(text); if (!text) return; Voice.q.push(Voice.clip(text)); if (!Voice.playing) Voice.play(); },
  async play() {
    Voice.playing = true; if (Voice.on) Voice.set("Speaking…");
    while (Voice.q.length) { const c = await Voice.q.shift(); if (c.g !== Voice.gen) continue;
      if (Voice.t0 && !Voice.first) { Voice.first = performance.now() - Voice.t0; $("vlat").textContent = "VOICE IN " + (Voice.first / 1000).toFixed(1) + "s" + (Voice.sttMs ? " · HEARD " + (Voice.sttMs / 1000).toFixed(1) + "s" : "") + (c.used ? " · " + c.used.toUpperCase() : ""); }
      await new Promise((ok) => { if (c.url) { const a = (Voice.audio = new Audio(c.url)); a.playbackRate = +S("rate") || 1; try { if (Voice.ac && Voice.outAn) Voice.ac.createMediaElementSource(a).connect(Voice.outAn); } catch (e) {} a.onended = a.onerror = ok; a.play().catch(ok); } else Voice.device(c.device).then(ok); }); }
    Voice.playing = false; (Voice.idle || []).splice(0).forEach((f) => f());
  },
  device(text) { if (!window.speechSynthesis) return Promise.resolve(); return new Promise((ok) => { const u = new SpeechSynthesisUtterance(text.slice(0, 3000)); const vs = speechSynthesis.getVoices(), pick = vs.find((v) => /natural|neural|premium|enhanced|samantha|google us english/i.test(v.name) && /^en/.test(v.lang)) || vs.find((v) => /^en/.test(v.lang)); if (pick) u.voice = pick; u.rate = 1.03 * (+S("rate") || 1); u.onend = u.onerror = ok; speechSynthesis.speak(u); }); },
  drained() { return Voice.playing || Voice.q.length ? new Promise((ok) => (Voice.idle = Voice.idle || []).push(ok)) : Promise.resolve(); },
  // a growing reply: the first short sentence goes out at once, then fuller chunks
  feed(text, final) {
    const rest = text.slice(Voice.spoken), re = /[\s\S]*?[.!?…:;](?=\s|$)|[\s\S]*?\n/g, need = Voice.spoken ? 70 : 18; let m, cut = 0, chunk = "";
    while ((m = re.exec(rest)) && m[0]) { chunk += m[0]; cut = re.lastIndex; if (chunk.trim().length >= need) { Voice.queue(chunk); Voice.spoken += cut; return Voice.feed(text, final); } }
    if (final && rest.trim()) { Voice.queue(rest); Voice.spoken = text.length; }
  },
  say(text) { Voice.hush(); Voice.spoken = 0; Voice.feed(String(text || ""), true); return Voice.drained(); },
  hush() { Voice.gen++; Voice.q = []; try { speechSynthesis.cancel(); } catch (e) {} if (Voice.audio) { Voice.audio.pause(); Voice.audio = null; } Voice.playing = false; (Voice.idle || []).splice(0).forEach((f) => f()); },
  end() { Voice.on = false; Voice.hush(); if (Voice.h) Voice.h.stop(); if (Voice.pttGo) Voice.pttGo(); Voice.stopVideo(); if (Voice.mic) Voice.mic.getTracks().forEach((t) => t.stop()); Voice.mic = null; viz.stop(); $("voiceo").classList.add("hidden"); },
});
const voiceModel = () => { const v = S("vmodel"); if (!v) return ""; if (v !== "fast") return models.some((m) => m.id === v) ? v : "";
  const fast = /(groq|cerebras|sambanova)/i, good = /gpt-oss-120b|llama-3\.3-70b|llama-4|qwen3|kimi|gpt-oss-20b/i; // fastest inference hosts, decent models
  const f = models.find((m) => fast.test(m.group) && good.test(m.id)) || models.find((m) => fast.test(m.group)) || models.find((m) => /llama-3\.1-8b-instruct-fast|gpt-oss-20b/.test(m.id)); return f ? f.id : ""; };

// ── the live visual: a hexagon core in a ring of frequency bars, cyan while you talk, violet while it speaks ──
const viz = { raf: 0, start() { cancelAnimationFrame(viz.raf); const c = $("viz"), g = c.getContext("2d"), fd = new Uint8Array(128); let t0 = performance.now(), sm = 0;
  const draw = (t) => { if (!Voice.on) return; viz.raf = requestAnimationFrame(draw); if (document.hidden) return;
    const d = Math.min(2, devicePixelRatio || 1), W = (c.width = c.clientWidth * d), H = (c.height = c.clientHeight * d), cx = W / 2, cy = H * .4, R = Math.min(W, H) * .16, time = (t - t0) / 1000, st = getComputedStyle(document.documentElement);
    const cyc = st.getPropertyValue("--cy").trim(), vic = st.getPropertyValue("--vi").trim(), hnc = st.getPropertyValue("--hn").trim(), col = Voice.mode === "talk" ? vic : Voice.mode === "think" ? hnc : cyc;
    const an = Voice.mode === "talk" ? Voice.outAn : Voice.micAn; let lv = 0; if (an && (Voice.mode === "talk" || Voice.mode === "listen")) { an.getByteFrequencyData(fd); for (let i = 0; i < 64; i++) lv += fd[i]; lv /= 64 * 255; } else fd.fill(0);
    if (Voice.mode === "listen" && Voice.lv) lv = Math.max(lv, Voice.lv * .6); sm += (lv - sm) * .25;
    const glow = g.createRadialGradient(cx, cy, R * .2, cx, cy, R * 3.2); glow.addColorStop(0, col + "55"); glow.addColorStop(1, "transparent"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const bars = 72; for (let i = 0; i < bars; i++) { const a = (i / bars) * Math.PI * 2 + time * .15, v = (fd[i % 64] || 0) / 255, len = R * (.12 + v * 1.1 + (Voice.mode === "think" ? .25 * (1 + Math.sin(time * 6 + i * .5)) / 2 : 0));
      g.strokeStyle = col; g.globalAlpha = .35 + v * .65; g.lineWidth = 2.2 * d; g.lineCap = "round"; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 1.25); g.lineTo(cx + Math.cos(a) * (R * 1.25 + len), cy + Math.sin(a) * (R * 1.25 + len)); g.stroke(); }
    g.globalAlpha = 1; g.setLineDash([3 * d, 9 * d]); g.lineDashOffset = -time * 20; g.strokeStyle = col + "88"; g.lineWidth = d; g.beginPath(); g.arc(cx, cy, R * 2.55, 0, 7); g.stroke(); g.setLineDash([]);
    const hx = (r, rot) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k - Math.PI / 2 + rot; g[k ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); };
    const r0 = R * (.78 + sm * .6 + (Voice.mode === "think" ? Math.sin(time * 4) * .05 : 0)), grd = g.createLinearGradient(cx - r0, cy - r0, cx + r0, cy + r0); grd.addColorStop(0, cyc); grd.addColorStop(1, vic);
    g.shadowColor = col; g.shadowBlur = 40 * d; hx(r0, 0); g.fillStyle = grd; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.2 * d; hx(r0 * 1.18, time * .2); g.stroke(); hx(r0 * .55, -time * .4); g.strokeStyle = "rgba(255,255,255,.5)"; g.stroke();
  }; viz.raf = requestAnimationFrame(draw); }, stop() { cancelAnimationFrame(viz.raf); } };

$("voice").onclick = () => Voice.start(); $("vend").onclick = $("vx").onclick = () => Voice.end();
$("vmute").onclick = () => { Voice.paused = !Voice.paused; Voice.ui(); if (Voice.paused) { Voice.hush(); if (Voice.h) Voice.h.stop(); Voice.set("Paused", ""); } else Voice.loop(); };
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
  $("sys").value = LS.get("sys", ""); if (!$("sdlg").open) $("sdlg").showModal();
}
$("s-theme").onchange = () => { LS.set("theme", $("s-theme").value); applyTheme(); };
$("s-motion").onchange = () => { setS("motion", $("s-motion").checked); motion(); };
$("s-enter").onchange = () => setS("enter", $("s-enter").checked);
$("s-rate").oninput = () => { setS("rate", +$("s-rate").value); $("s-rate-v").textContent = (+$("s-rate").value).toFixed(2) + "×"; if (Voice.audio) Voice.audio.playbackRate = +$("s-rate").value; };
$("s-hands").onchange = () => { setS("hands", $("s-hands").value); if (Voice.on) { Voice.ui(); if (Voice.h) Voice.h.stop(); } };
$("s-sil").oninput = () => { setS("sil", +$("s-sil").value); $("s-sil-v").textContent = ($("s-sil").value / 1000).toFixed(1) + " s"; };
$("s-barge").onchange = () => { setS("barge", $("s-barge").checked); if (Voice.on) Voice.ui(); };
$("s-recog").onchange = () => setS("recog", $("s-recog").value);
$("s-vmodel").onchange = () => { setS("vmodel", $("s-vmodel").value); if (Voice.on) Voice.ui(); };
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
    Keys.draw(j.keys);
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
    const el = $("agentp"); if (!st || st.error === "the agent isn't deployed") { el.innerHTML = "<div class='ah'><h3>MENTIFABER AGENT 1.0<small>not deployed on this site yet</small></h3></div>"; return; }
    const led = { online: "ok", waking: "warn", asleep: "", empty: "" }[st.state] || "", seed = st.seed;
    el.innerHTML = "<div class='ah'><i class='led " + led + "'></i><h3>MENTIFABER AGENT 1.0<small>" + (st.model ? esc(st.model.label) + " · " + gb(st.model.size) + " in R2" : "no model in R2 yet") + "</small></h3><span class='st " + (st.state === "online" ? "working" : st.state === "waking" ? "paused" : "") + "'>" + esc(st.state === "empty" ? "no model" : st.state) + "</span></div>" +
      (seed ? "<div class='prog'><div class='bar'><i style='width:" + (100 * seed.done / seed.size).toFixed(1) + "%'></i></div><p>" + (seed.error ? "⚠ " + esc(seed.error) : "copying " + esc(seed.label) + " into your R2 · " + gb(seed.done) + " of " + gb(seed.size)) + "</p></div>" : "") +
      "<div class='facts'><div>RUNS ON<b>your domain</b></div><div>STORED IN<b>R2 · mentifaber-models</b></div><div>CONTAINER<b>4 vCPU · 12 GiB</b></div><div>SLEEPS AFTER<b>20 idle min</b></div></div>" +
      "<div class='ab'>" + (st.model ? (st.state === "asleep" ? "<button class='pri' data-ag='wake'>Wake</button>" : st.state !== "empty" ? "<button class='ghost' data-ag='sleep'>Sleep now</button>" : "") : "") +
      (!seed || seed.error ? "<button class='" + (st.model ? "ghost" : "pri") + "' data-ag='seed' data-m='14b'>Load Qwen3 14B · 9.0 GB (largest that fits)</button><button class='ghost' data-ag='seed' data-m='8b'>Load Qwen3 8B · 5.0 GB (faster)</button>" : "") + "</div>" +
      (!seed || seed.error ? "<div class='own'><input id='ag-url' placeholder='or your own model: https://…/model.gguf (up to 11 GB)'><button class='ghost' data-ag='seed-url'>Load</button></div>" : "") +
      (st.error ? "<p class='dim sm' style='color:var(--bad)'>" + esc(st.error) + "</p>" : "") +
      "<p class='dim sm'>It appears as the first model in the Studio picker, joins your councils and swarms, works in voice, and any page can use it: <code>&lt;script src=\"/assets/agent.js\"&gt;</code> then <code>MentifaberAgent.chat(…)</code>.</p>";
    clearTimeout(Agent.timer); if ((seed && !seed.error) || st.state === "waking") Agent.timer = setTimeout(() => !$("v-keys").classList.contains("hidden") && Agent.draw(), 3000);
  },
};
$("agentp").onclick = async (e) => {
  const b = e.target.closest("[data-ag]"); if (!b) return; const a = b.dataset.ag; b.disabled = true;
  const post = (p, body) => fetch("/api/agent/" + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  const j = a === "seed" ? await post("seed", { model: b.dataset.m }) : a === "seed-url" ? await post("seed", { url: $("ag-url").value.trim() }) : await post(a);
  if (j.error) toast(j.error, 5000); else if (a === "wake") toast("Waking: the model loads from R2 in a minute or two", 5000); else if (a.startsWith("seed")) toast("Copying the model into your R2…", 4000);
  Agent.draw(); loadModels();
};

// ── MIND: what Hive knows about the owner ──
const MindV = {
  async load() {
    const j = await api("/mind"); $("m-locked").classList.toggle("hidden", !j.error); $("m-open").classList.toggle("hidden", !!j.error); if (j.error) return; MindV.j = j;
    const st = j.stats || {}, k = st.kinds || {}, ago = (t) => { const d = (Date.now() - t) / 60e3; return d < 1 ? "just now" : d < 60 ? Math.round(d) + " min ago" : d < 1440 ? Math.round(d / 60) + " h ago" : Math.round(d / 1440) + " d ago"; };
    $("m-on").checked = !!j.on; $("m-led").className = "led " + (j.on ? "ok" : "");
    $("m-sub").textContent = j.on ? (j.at ? "profile from " + ago(j.at) + (j.model ? " · " + j.model.split("|").pop().split("/").pop() : "") + (j.fresh ? " · " + j.fresh + " new since" : "") : "no profile yet: analyze to build one") : "memory is off: nothing is noted or shared";
    $("m-at").textContent = st.total ? st.total + " notes" : "";
    const off = -new Date().getTimezoneOffset() / 60, hrs = Array(24).fill(0); (st.hoursUTC || []).forEach((n, h) => { hrs[(((h + off) % 24) + 24) % 24 | 0] += n; });
    const top = hrs.indexOf(Math.max(...hrs)), fmt = (h) => (h % 12 || 12) + (h < 12 ? "am" : "pm");
    const f = [["LAST 90 DAYS", (st.last90 || 0) + " actions"], ["ACTIVE DAYS", st.activeDays || 0], ["CHAT · VOICE", (k.chat || 0) + " · " + (k.voice || 0)], ["COUNCILS · PICTURES", (k.council || 0) + " · " + (k.image || 0)], ["SWARM PROJECTS", Object.values(st.projects || {}).reduce((a, b) => a + b, 0)], ["PEAK HOUR", Math.max(...hrs) ? fmt(top) : "—"], ["FAVOURITE MODEL", (st.models && st.models[0] && st.models[0][0]) || "—"], ["MEMORIES", st.memories || 0]];
    $("m-facts").innerHTML = f.map(([a, b]) => "<div>" + a + "<b title='" + esc(b) + "'>" + esc(b) + "</b></div>").join("");
    const mx = Math.max(1, ...hrs); $("m-hours").innerHTML = hrs.map((n, h) => "<i style='height:" + Math.max(3, (100 * n) / mx) + "%' title='" + fmt(h) + ": " + n + "'></i>").join("") + [0, 6, 12, 18].map((h) => "<span style='left:" + (h / 24) * 100 + "%'>" + fmt(h) + "</span>").join("");
    $("m-profile").innerHTML = j.profile ? md(j.profile) : "<p class='dim'>No analysis yet. Hit <b>Analyze me now</b>: the strongest model you have reads your activity, projects and memories and writes you up, frankly. It refreshes on its own as you keep using Hive.</p>";
    $("m-mem").innerHTML = (j.memories || []).map((m) => "<div class='mi'><p><small>" + (m.src === "analysis" ? "from analysis" : "you") + " · " + ago(m.ts) + "</small>" + esc(m.text) + "</p><button data-mem='" + m.id + "' title='Forget this'>✕</button></div>").join("") || "<p class='dim sm'>Nothing yet.</p>";
    $("m-act").innerHTML = (j.recent || []).map((a) => "<div class='mi'><p><small>" + esc(a.kind) + " · " + ago(a.ts) + "</small>" + esc(String(a.text).slice(0, 400)) + "</p><button data-act='" + a.id + "' title='Forget this'>✕</button></div>").join("") || "<p class='dim sm'>Nothing yet. Use Hive and it shows up here.</p>";
  },
  async analyze() {
    const b = $("m-analyze"); b.disabled = true; b.textContent = "Analyzing…"; $("m-profile").innerHTML = "<p class='dim'>Reading everything you've done in Hive… this takes up to a minute.</p>";
    const j = await api("/mind/analyze", {}).catch(() => ({ error: "couldn't reach the Hive" })); b.disabled = false; b.textContent = "Analyze me now";
    if (j.error) toast(j.error, 6000); else toast("Profile updated"); MindV.load();
  },
  async importLocal(quiet) {
    const sessions = chats.map((c) => ({ id: c.id, title: c.title, ts: c.ts, model: c.model, said: c.msgs.filter((m) => m.role === "user").map((m) => m.show || m.text || "").filter(Boolean) })).filter((c) => c.said.length);
    if (!sessions.length) return quiet || toast("No sessions on this device");
    const j = await api("/mind/import", { sessions }); if (!quiet) toast(j.error || "Imported " + j.imported + " sessions", 3000); LS.set("mind-sync", Date.now()); MindV.load();
  },
};
$("m-analyze").onclick = () => MindV.analyze();
$("m-import").onclick = () => MindV.importLocal();
$("m-ask").onclick = () => { location.hash = "studio"; newChat(); send("Analyze me and what I do, from everything you know about me. Be frank: what stands out, what I'm good at, where I'm stuck, and what I should do next."); };
$("m-on").onchange = async () => { await api("/mind/set", { on: $("m-on").checked }); toast($("m-on").checked ? "Memory on" : "Memory off: nothing is noted or shared"); MindV.load(); };
$("m-add").onclick = async () => { const t = $("m-new").value.trim(); if (!t) return; const j = await api("/mind/remember", { text: t }); if (j.error) return toast(j.error); $("m-new").value = ""; MindV.load(); };
$("m-new").onkeydown = (e) => { if (e.key === "Enter") $("m-add").click(); };
$("m-wipe").onclick = async () => { if (!confirm("Forget everything Hive knows about you: the profile, every memory and the whole activity log? This can't be undone.")) return; await api("/mind/forget", { all: true }); toast("Forgotten"); MindV.load(); };
$("v-mind").onclick = async (e) => { const b = e.target.closest("[data-mem],[data-act]"); if (!b) return; await api("/mind/forget", b.dataset.mem ? { mem: b.dataset.mem } : { act: b.dataset.act }); b.closest(".mi").remove(); };

// ── start ──
greet(); drawHist(); loadModels().then(() => { const c = new URLSearchParams(location.search).get("c"); if (c) openChat(c); if (owner && !LS.get("mind-sync", 0)) MindV.importLocal(true); }); route(); sync();
})();
