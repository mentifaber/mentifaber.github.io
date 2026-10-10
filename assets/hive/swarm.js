// Hive · Swarm: watch and steer a swarm of agents building a project.
(() => {
  const $ = (id) => document.getElementById(id), esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mine = () => { try { return JSON.parse(localStorage.getItem("hive-mine") || "{}"); } catch (e) { return {}; } };
  const remember = (id, ctok) => { try { const m = mine(); m[id] = ctok; localStorage.setItem("hive-mine", JSON.stringify(m)); } catch (e) {} };
  const api = async (path, body) => { const r = await fetch("/api/hive" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" }); return r.json(); };
  let cur = null, timer = null, last = null, owner = false;
  const ago = (ts) => { const s = (Date.now() - ts) / 1000; return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h"; };

  async function home() {
    cur = null; clearInterval(timer); $("home").classList.remove("hidden"); $("proj").classList.add("hidden"); history.replaceState(null, "", "/hive#swarm");
    const j = await api("/list").catch(() => ({ projects: [] })); owner = !!j.owner;
    $("swho").innerHTML = owner ? "Signed in as the owner: no daily limit, set the budget, and every key in your vault joins in." : "Anyone can start a project: two a day each, up to 150 model calls a project. Describe what you want built; the swarm does the rest.";
    $("go").disabled = false; $("caprow").classList.toggle("hidden", !owner);
    $("plist").innerHTML = (j.projects || []).length ? j.projects.map((p) => "<div data-id='" + p.id + "'><span>" + esc(p.title) + " <span class='dim'>· " + ago(p.ts) + " ago · " + p.calls + " calls</span></span><span class='st " + p.status + "'>" + p.status + "</span></div>").join("") : "<span class='dim'>none yet</span>";
  }
  $("plist").onclick = (e) => { const d = e.target.closest("[data-id]"); if (d) open(d.dataset.id); };
  $("go").onclick = async () => { const brief = $("brief").value.trim(); if (!brief) return; $("go").disabled = true; $("gomsg").textContent = "assembling the swarm…";
    const j = await api("/new", { brief, cap: +$("cap").value || undefined }); $("go").disabled = false; if (j.error) { $("gomsg").textContent = j.error; return; } remember(j.id, j.ctok); $("gomsg").textContent = ""; $("brief").value = ""; open(j.id); };
  $("back").onclick = home;

  function open(id) { cur = id; $("home").classList.add("hidden"); $("proj").classList.remove("hidden"); history.replaceState(null, "", "/hive?p=" + id + "#swarm"); $("feed").innerHTML = ""; last = null; poll(); clearInterval(timer); timer = setInterval(poll, 2000); }
  async function poll() {
    if (!cur) return; let j; try { j = await api("/state?id=" + cur + "&ctok=" + (mine()[cur] || "")); } catch (e) { return; } if (j.error) return;
    const p = j.project; last = j;
    $("squota").classList.toggle("hidden", !p.quota_until && p.status !== "paused");
    if (p.quota_until || p.status === "paused") $("squota").textContent = "⏸ Cloudflare's free AI allowance for today is used up. This project is paused and resumes on its own" + (p.quota_until ? " at " + new Date(p.quota_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " your time" : "") + ". Agents from other providers keep working.";
    $("ptitle").textContent = p.title; $("pst").textContent = p.status; $("pst").className = "st " + p.status;
    $("pcalls").textContent = p.calls + " / " + p.max + " calls"; $("pbar").style.width = Math.min(100, p.calls / p.max * 100) + "%";
    const done = j.tasks.filter((t) => t.status === "done").length; $("pcount").textContent = done + " / " + j.tasks.length + " tasks done";
    $("recruit").classList.toggle("hidden", !owner || !/planning|working|integrating|replanning|paused/.test(p.status)); $("stop").classList.toggle("hidden", !p.join || !/planning|working|integrating|replanning|paused/.test(p.status)); $("chatrow").classList.toggle("hidden", !p.join); $("joinrow").classList.toggle("hidden", !p.join); if (p.join && $("join").value !== p.join) $("join").value = p.join;
    const live = j.agents.filter((a) => a.status !== "offline" && a.status !== "retired").length, busy = j.agents.filter((a) => a.status === "working" || a.status === "reviewing").length;
    $("acount").textContent = live + " online · " + busy + " busy · " + j.agents.length + " total";
    $("agents").innerHTML = j.agents.map((a) => { const t = a.task && j.tasks.find((x) => x.id === a.task); return "<div class='ag " + a.status + "' title='" + esc(a.src + " · " + a.model + " · reputation " + (a.score || 0)) + "'>" + (a.score ? "<span class='sc'>" + (a.score > 0 ? "+" : "") + a.score + "</span>" : "") + "<b>" + esc(a.name) + "</b>" + (a.status === "offline" && a.err ? "<span class='er'>" + esc(a.err.slice(0, 90)) + "</span>" : "") + "<span class='r'>" + esc(a.status === "working" && t ? t.role + " · #" + t.id : a.status === "reviewing" && t ? "reviewing #" + t.id : a.status) + "</span><br><span class='r'>" + esc(a.src) + " · " + a.done + " done</span></div>"; }).join("");
    const cols = [["OPEN", ["open"]], ["IN PROGRESS", ["claimed"]], ["REVIEW", ["review", "reviewing"]], ["DONE", ["done"]]];
    const name = (id) => { const a = j.agents.find((x) => x.id === id); return a ? a.name : ""; };
    $("board").innerHTML = cols.map(([h, ss]) => { const ts = j.tasks.filter((t) => ss.includes(t.status)); return "<div class='col'><h3>" + h + " " + ts.length + "</h3>" + ts.map((t) => "<div class='tk' data-t='" + t.id + "'><div class='role'>#" + t.id + " " + esc(t.role) + (t.tries ? " · redo " + t.tries : "") + "</div>" + esc(t.title) + (t.agent ? "<div class='who'>" + esc(name(t.agent)) + "</div>" : "") + "</div>").join("") + "</div>"; }).join("");
    const f = $("feed"), seen = new Set([...f.children].map((d) => d.dataset.k)), add = j.feed.slice().reverse().filter((x) => !seen.has(x.ts + x.who + x.kind));
    for (const x of add) { const d = document.createElement("div"); d.dataset.k = x.ts + x.who + x.kind; d.className = "k-" + x.kind; d.innerHTML = "<span class='who'>" + esc(x.who) + "</span> <span class='dim'>" + esc(x.kind) + "</span><br>" + esc(x.text); f.prepend(d); }
    while (f.children.length > 200) f.lastChild.remove();
    $("rebuild").classList.toggle("hidden", !(p.join && p.status === "done"));
    if (p.final) { $("finalp").classList.remove("hidden"); $("final").textContent = p.final; const m = p.final.match(/```html\s*([\s\S]*?)```/i) || (/^\s*<!doctype html/i.test(p.final) ? [0, p.final] : null);
      if (m) { $("preview").classList.remove("hidden"); if ($("preview").dataset.src !== m[1]) { $("preview").srcdoc = m[1]; $("preview").dataset.src = m[1]; } } else $("preview").classList.add("hidden"); }
    else $("finalp").classList.add("hidden");
  }
  $("board").onclick = async (e) => { const d = e.target.closest("[data-t]"); if (!d || !last) return; const t = last.tasks.find((x) => x.id === +d.dataset.t);
    $("dt").textContent = "#" + t.id + " " + t.role + " · " + t.title; $("dd").textContent = t.detail || ""; $("dnote").textContent = t.note ? "Review: " + t.note : ""; $("dout").textContent = "…"; $("dlg").showModal();
    const o = await api("/output?id=" + cur + "&task=" + t.id); $("dout").textContent = o.output || "(nothing yet)"; };
  $("recruit").onclick = async () => { $("recruit").disabled = true; const j = await api("/recruit", { id: cur }); $("recruit").disabled = false; if (j.error) alert(j.error); poll(); };
  $("rebuild").onclick = async () => { if (!confirm("Assemble the final result again from the approved work?")) return; const j = await api("/rebuild", { id: cur, ctok: mine()[cur] }); if (j.error) alert(j.error); poll(); };
  $("stop").onclick = async () => { if (confirm("Stop this project?")) { await api("/stop", { id: cur, ctok: mine()[cur] }); poll(); } };
  $("send").onclick = async () => { const text = $("chat").value.trim(); if (!text) return; $("chat").value = ""; await api("/say", { id: cur, text, ctok: mine()[cur] }); poll(); };
  $("chat").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
  $("copy").onclick = () => { $("join").select(); try { navigator.clipboard.writeText($("join").value); } catch (e) { document.execCommand("copy"); } $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy"), 1500); };
  $("dl").onclick = () => { const p = last && last.project; if (!p || !p.final) return; const m = p.final.match(/```html\s*([\s\S]*?)```/i), html = m ? m[1] : null;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html || p.final], { type: html ? "text/html" : "text/markdown" })); a.download = (p.title || "hive").replace(/[^\w-]+/g, "-").toLowerCase() + (html ? ".html" : ".md"); a.click(); };
  window.HiveSwarm = { show() { api("/list").then((j) => { owner = !!j.owner; }).catch(() => {}); const qp = new URLSearchParams(location.search).get("p"); qp ? open(qp) : home(); }, hide() { cur = null; clearInterval(timer); } };
})();
