// Genesis · Swarm: launch a mission, watch the agents build it, then run what they made (assets/hive/runner.js), read its
// code, fix what breaks, and keep every version.
(() => {
  const $ = (id) => document.getElementById(id), esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const mine = () => { try { return JSON.parse(localStorage.getItem("hive-mine") || "{}"); } catch (e) { return {}; } };
  const remember = (id, ctok) => { try { const m = mine(); m[id] = ctok; localStorage.setItem("hive-mine", JSON.stringify(m)); } catch (e) {} };
  const LSG = (k, d) => { try { const v = localStorage.getItem("hive:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, LSS = (k, v) => { try { localStorage.setItem("hive:" + k, JSON.stringify(v)); } catch (e) {} };
  const api = async (path, body) => { const r = await fetch("/api/hive" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" }); return r.json().catch(() => ({ error: "the server said " + r.status })); };
  const hhmm = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const ago = (ts) => { const s = (Date.now() - ts) / 1000; return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };
  const LIVE = /planning|working|integrating|replanning|paused/;
  let cur = null, timer = null, last = null, owner = false, tab = null;
  const R = { final: "", files: [], entry: null, log: [], errors: [], ran: 0, view: null, fixing: false, auto: 0, size: LSG("swarm-size", 0) }; // view: a version number, or null for the current result

  // ── home: launch, and the missions so far (finished ones can be run straight from the list) ──
  async function home() {
    cur = null; clearInterval(timer); $("home").classList.remove("hidden"); $("proj").classList.add("hidden"); history.replaceState(null, "", "/hive-app#swarm");
    const j = await api("/list").catch(() => ({ projects: [] })); owner = !!j.owner;
    $("swho").innerHTML = owner ? "Signed in as the owner: no daily limit, set the budget, and every key in your vault joins in." : "Anyone can start a project: two a day each, up to 150 model calls a project. Describe what you want built; the swarm builds it, and you can run it right here.";
    $("go").disabled = false; $("caprow").classList.toggle("hidden", !owner);
    const mineNow = mine(), canDel = (p) => owner || mineNow[p.id];
    $("purge").classList.toggle("hidden", !owner || !(j.projects || []).some((p) => /done|stopped|failed/.test(p.status)));
    $("plist").innerHTML = (j.projects || []).length ? j.projects.map((p) => "<div data-id='" + esc(p.id) + "' class='pl'><span class='pt'><b>" + esc(p.title) + "</b>" + (p.by === "genesis" ? "<i class='byg' title='Started by Genesis on its own'>by Genesis</i>" : "") + "<span class='dim'>" + ago(p.ts) + " ago · " + p.calls + " calls</span></span>" +
      (p.has ? "<button class='q sm' data-run title='Run what it made'>Run</button>" : "") + "<span class='st " + esc(p.status) + "'>" + esc(p.status) + "</span>" + (canDel(p) ? "<button class='x' data-del title='Delete this mission' aria-label='Delete'>✕</button>" : "") + "</div>").join("") : "<span class='dim'>none yet</span>";
  }
  const del = async (id, title) => { if (!confirm("Delete “" + (title || "this mission") + "” for good? Its tasks, agents, log and result all go.")) return false; const j = await api("/delete", { id, ctok: mine()[id] }); if (j.error) { alert(j.error); return false; } try { const m = mine(); delete m[id]; localStorage.setItem("hive-mine", JSON.stringify(m)); } catch (e) {} return true; };
  $("plist").onclick = async (e) => { const d = e.target.closest("[data-id]"); if (!d) return; if (e.target.closest("[data-del]")) { e.stopPropagation(); if (await del(d.dataset.id, d.querySelector("b").textContent)) home(); return; } open(d.dataset.id, e.target.closest("[data-run]") ? "run" : null); };
  $("purge").onclick = async () => { if (!confirm("Delete every finished, stopped and failed mission? Running ones stay.")) return; const j = await api("/purge", {}); if (j.error) return alert(j.error); home(); };
  $("pdel").onclick = async () => { if (await del(cur, last && last.project.title)) home(); };
  $("go").onclick = async () => { const brief = $("brief").value.trim(); if (!brief) return; $("go").disabled = true; $("gomsg").textContent = "assembling the swarm…";
    const j = await api("/new", { brief, cap: +$("cap").value || undefined }); $("go").disabled = false; if (j.error) { $("gomsg").textContent = j.error; return; } remember(j.id, j.ctok); $("gomsg").textContent = ""; $("brief").value = ""; open(j.id); };
  $("back").onclick = home;

  // ── one mission ──
  function open(id, want) {
    cur = id; tab = want || null; Object.assign(R, { final: "", files: [], entry: null, view: null, auto: 0 }); $("home").classList.add("hidden"); $("proj").classList.remove("hidden");
    history.replaceState(null, "", "/hive-app?p=" + id + "#swarm"); $("feed").innerHTML = ""; $("vers").innerHTML = ""; last = null; poll(); clearInterval(timer); timer = setInterval(() => { if (!document.hidden) poll(); }, 2500);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cur) poll(); });
  function show(t) { // tabs: what it made (run, code, write-up) once there is a result; how it's being built (swarm) always
    const has = !!R.final; if (!has && t !== "swarm") t = "swarm"; tab = t;
    document.querySelectorAll("#ptabs [data-pt]").forEach((b) => { b.classList.toggle("on", b.dataset.pt === t); b.disabled = !has && b.dataset.pt !== "swarm"; b.setAttribute("aria-selected", b.dataset.pt === t ? "true" : "false"); });
    $("pt-run").classList.toggle("hidden", t !== "run"); $("pt-code").classList.toggle("hidden", t !== "code"); $("finalp").classList.toggle("hidden", t !== "doc"); $("pt-swarm").classList.toggle("hidden", t !== "swarm"); $("pt-agents").classList.toggle("hidden", t !== "swarm");
    if (t === "run" && R.entry && !R.ran) runIt();
    if (t === "swarm" && window.HiveFX && last) HiveFX.map($("map"), last);
  }
  $("ptabs").onclick = (e) => { const b = e.target.closest("[data-pt]"); if (b && !b.disabled) show(b.dataset.pt); };
  async function poll() {
    if (!cur) return; let j; try { j = await api("/state?id=" + cur + "&ctok=" + (mine()[cur] || "")); } catch (e) { return; } if (j.error || !j.project) return;
    const p = j.project; last = j;
    $("squota").classList.toggle("hidden", !p.quota_until && p.status !== "paused");
    if (p.quota_until || p.status === "paused") $("squota").textContent = "⏸ Cloudflare's free AI allowance for today is used up. This project is paused and resumes on its own" + (p.quota_until ? " at " + new Date(p.quota_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " your time" : "") + (p.owner ? ", or bring in your own keys with “Retry & bring in my keys”." : ".");
    $("ptitle").textContent = p.title; $("pst").textContent = p.status; $("pst").className = "st " + p.status;
    $("pcalls").textContent = p.calls + " / " + p.max + " calls"; $("pbar").style.width = Math.min(100, p.calls / p.max * 100) + "%";
    const done = j.tasks.filter((t) => t.status === "done").length; $("pcount").textContent = done + " / " + j.tasks.length + " tasks done";
    $("pring").style.strokeDashoffset = 170 - 170 * (j.tasks.length ? done / j.tasks.length : 0);
    $("pring").closest(".ring").classList.toggle("done", !!j.tasks.length && done === j.tasks.length);
    if (window.HiveFX && tab === "swarm") HiveFX.map($("map"), j);
    $("recruit").classList.toggle("hidden", !p.owner || !LIVE.test(p.status)); $("pdel").classList.toggle("hidden", !p.join); $("stop").classList.toggle("hidden", !p.join || !LIVE.test(p.status)); $("chatrow").classList.toggle("hidden", !p.join || !LIVE.test(p.status));
    $("joinrow").classList.toggle("hidden", !p.join); if (p.join && $("join").value !== p.join) $("join").value = p.join;
    const live = j.agents.filter((a) => a.status !== "offline" && a.status !== "retired").length, busy = j.agents.filter((a) => a.status === "working" || a.status === "reviewing").length;
    $("acount").textContent = live + " online · " + busy + " busy · " + j.agents.length + " total";
    $("agents").innerHTML = j.agents.map((a) => { const t = a.task && j.tasks.find((x) => x.id === a.task); return "<div class='ag " + esc(a.status) + "' title='" + esc(a.src + " · " + a.model + " · reputation " + (a.score || 0)) + "'>" + (a.score ? "<span class='sc'>" + (a.score > 0 ? "+" : "") + a.score + "</span>" : "") + "<b>" + esc(a.name) + "</b>" + (a.status === "offline" && a.err ? "<span class='er'>" + esc(a.err.slice(0, 90)) + "</span>" : "") +
      "<span class='r'>" + esc(a.status === "working" && t ? t.role + " · #" + t.id : a.status === "reviewing" && t ? "reviewing #" + t.id : a.status) + "</span><br><span class='r'>" + esc(a.src) + " · " + a.done + " done</span></div>"; }).join("");
    const cols = [["open", ["open"]], ["in progress", ["claimed"]], ["in review", ["review", "reviewing"]], ["done", ["done"]]], name = (id) => { const a = j.agents.find((x) => x.id === id); return a ? a.name : ""; };
    $("board").innerHTML = cols.map(([h, ss]) => { const ts = j.tasks.filter((t) => ss.includes(t.status)); return "<div class='col'><h3>" + h + " " + ts.length + "</h3>" + ts.map((t) => "<div class='tk' data-t='" + t.id + "'><div class='role'>#" + t.id + " " + esc(t.role) + (t.tries ? " · redo " + t.tries : "") + "</div>" + esc(t.title) + (t.agent ? "<div class='who'>" + esc(name(t.agent)) + "</div>" : "") + "</div>").join("") + "</div>"; }).join("");
    const f = $("feed"), seen = new Set([...f.children].map((d) => d.dataset.k)), add = j.feed.slice().reverse().filter((x) => !seen.has(x.ts + x.who + x.kind));
    for (const x of add) { const d = document.createElement("div"); d.dataset.k = x.ts + x.who + x.kind; d.className = "k-" + x.kind; d.innerHTML = "<time>" + hhmm(x.ts) + "</time><span class='who'>" + esc(x.who) + "</span> <span class='dim'>" + esc(x.kind) + "</span><br>" + esc(x.text); f.prepend(d); }
    while (f.children.length > 200) f.lastChild.remove();
    $("rebuild").classList.toggle("hidden", !(p.join && p.status === "done"));
    versions(p);
    if (p.final && R.view == null && p.final !== R.final) result(p.final);
    if (!tab) show(p.final ? "run" : "swarm"); else if (!p.final && tab !== "swarm") show("swarm"); else show(tab);
    $("dlzip").disabled = !R.final; $("aflabel").classList.toggle("hidden", !p.join); $("mkrun").classList.toggle("hidden", !p.join);
  }

  // ── the result: files, the one that runs, the write-up ──
  function result(final) {
    // a stitched fallback is raw pieces: only a block marked to run counts as the thing to run, not some fragment of it
    R.final = final; R.files = window.HiveRun ? HiveRun.files(final) : []; R.entry = window.HiveRun ? HiveRun.entry(R.files, /_The integrators couldn't finish/.test(final)) : null; R.ran = 0; R.silent = false;
    if ($("final").textContent !== final) { $("final").textContent = final; $("finalmd").innerHTML = window.HiveMD ? HiveMD(final.replace(/```[^\n]*\brun\b[^\n]*\n[\s\S]*?```/gi, "_(the runnable part is in the Run tab)_")) : esc(final); }
    $("files").innerHTML = R.files.length ? R.files.map((f, i) => "<div class='file'><div class='fh'><b>" + esc(f.name) + "</b><span class='dim sm'>" + esc(f.lang) + " · " + f.code.split("\n").length + " lines" + (f === R.entry ? " · runs" : "") + "</span><span class='flex'></span>" +
      (/^(html|py|js)$/.test(f.lang) ? "<button class='q sm' data-frun='" + i + "'>Run this</button>" : "") + "<button class='q sm' data-fcopy='" + i + "'>Copy</button><button class='q sm' data-fdl='" + i + "'>Download</button></div><pre><code>" + esc(f.code) + "</code></pre></div>").join("") : "<p class='dim'>No code in this result: it's a write-up (see Write-up).</p>";
    $("stage").classList.toggle("hidden", !R.entry); $("norun").classList.toggle("hidden", !!R.entry); $("console").classList.toggle("hidden", !R.entry);
    $("stage").classList.toggle("log", !!(R.entry && R.entry.lang !== "html"));
    $("runwhat").textContent = R.entry ? R.entry.name + (R.entry.lang === "py" ? " · Python in your browser" : R.entry.lang === "js" ? " · JavaScript" : "") : "";
    if (tab === "run" && R.entry) runIt();
    else if (!R.entry) autoDemo("nothing in it runs");
  }
  // with auto-fix on, a result that doesn't run (nothing to run, or a run that shows nothing) is turned into a working demo,
  // once per result
  function autoDemo(why) {
    if (!$("autofix").checked || R.fixing || R.view != null || R.demoed === R.final || !(last && last.project.join) || !R.final) return;
    R.demoed = R.final; R.log.push({ kind: "info", text: why + ": asking the swarm to make it runnable (fix automatically is on)" }); con(); fix("demo");
  }
  function versions(p) {
    const vs = p.versions || [], sel = $("vers"); sel.classList.toggle("hidden", !vs.length);
    const want = "<option value=''>Current" + (vs.length ? " (v" + (vs[0].v + 1) + ")" : "") + "</option>" + vs.map((v) => "<option value='" + v.v + "'>v" + v.v + " · " + esc(new Date(v.ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + " · " + esc(v.note || "") + "</option>").join("");
    if (sel.dataset.h !== want) { sel.innerHTML = want; sel.dataset.h = want; sel.value = R.view == null ? "" : String(R.view); }
  }
  $("vers").onchange = async () => { const v = $("vers").value; if (!v) { R.view = null; if (last && last.project.final) result(last.project.final); return; }
    const j = await api("/version?id=" + cur + "&v=" + v + "&ctok=" + (mine()[cur] || "")); if (j.error) return alert(j.error); R.view = +v; result(j.final); };

  // ── running it ──
  function sized() { const w = R.size; $("stage").style.setProperty("--w", w ? w + "px" : "100%"); document.querySelectorAll("#sizes [data-sz]").forEach((b) => b.classList.toggle("on", +b.dataset.sz === w)); }
  $("sizes").onclick = (e) => { const b = e.target.closest("[data-sz]"); if (!b) return; R.size = +b.dataset.sz; LSS("swarm-size", R.size); sized(); };
  function runIt(f) {
    f = f || R.entry; if (!f || !window.HiveRun) return; R.ran = Date.now(); R.log = R.note ? [{ kind: "info", text: R.note }] : []; R.note = null; R.errors = []; R.runFile = f; sized(); con();
    HiveRun.run($("preview"), f, R.files, (kind, text) => {
      if (kind === "shape") return shape(f, text);
      if (kind === "loaded") { R.log.push({ kind: "info", text: "loaded" }); } else { R.log.push({ kind, text }); if (kind === "exception" || kind === "error") R.errors.push(text); } con(); autofix(); });
  }
  // the run settled: did it show anything? A script that only defines functions, or a blank page, isn't a demo
  function shape(f, text) {
    let s = {}; try { s = JSON.parse(text); } catch (e) { return; }
    const said = () => R.log.some((l) => l.kind !== "info" && l.kind !== "warn"), blank = f.lang === "html" ? s.text < 2 && !s.media : s.out === 0 && !s.media && !said();
    if (!blank || R.errors.length) return;
    // tests and timers print late: give a quiet script a moment before calling it blank
    if (f.lang !== "html") { const at = R.ran; return setTimeout(() => { if (R.ran === at && !said() && !R.errors.length && !R.silent) silent(f); }, 3000); }
    silent(f);
  }
  function silent(f) {
    R.silent = true; R.log.push({ kind: "warn", text: f.lang === "html" ? "The page loaded but shows nothing." : "It ran, but did nothing you can see: the code only defines functions, or it's meant for a server." }); con();
    autoDemo("it showed nothing");
  }
  function con() {
    const n = R.errors.length; $("ccount").textContent = n ? n + " error" + (n > 1 ? "s" : "") : R.log.length ? "no errors" : ""; $("ccount").className = "cc" + (n ? " bad" : R.log.length ? " good" : "");
    $("clog").innerHTML = R.log.length ? R.log.slice(-200).map((l) => "<div class='l-" + esc(l.kind) + "'>" + esc(l.text) + "</div>").join("") : "<span class='dim'>Nothing yet.</span>";
    $("clog").scrollTop = 1e9; $("fixit").classList.toggle("hidden", !n || R.view != null || !(last && last.project.join)); $("fixit").disabled = R.fixing;
    $("mkdemo").classList.toggle("hidden", !R.silent || !!n || R.view != null || !(last && last.project.join)); $("mkdemo").disabled = R.fixing;
  }
  $("rerun").onclick = () => runIt(R.runFile || R.entry);
  $("popout").onclick = () => { const f = R.runFile || R.entry; if (f && window.HiveRun) HiveRun.popout(f, R.files); };
  $("autofix").checked = LSG("swarm-autofix", false); $("autofix").onchange = () => LSS("swarm-autofix", $("autofix").checked);
  let afT = 0;
  function autofix() { // errors in the first seconds of a run, with auto-fix on: ask once, twice at most per result
    if (!$("autofix").checked || R.fixing || R.view != null || !R.errors.length || R.auto >= 2 || Date.now() - R.ran > 15000 || !(last && last.project.join)) return;
    clearTimeout(afT); afT = setTimeout(() => { if (R.errors.length && !R.fixing) { R.auto++; fix("fix"); } }, 1800);
  }
  async function fix(mode) {
    if (R.fixing) return; R.fixing = true; const btn = mode === "demo" ? (R.entry ? $("mkdemo") : $("mkrun")) : $("fixit"), was = btn.textContent; btn.disabled = true; btn.textContent = mode === "demo" ? "Making it runnable…" : "Fixing…";
    R.log.push({ kind: "info", text: mode === "demo" ? "asking the swarm to make it runnable…" : "sending " + R.errors.length + " error" + (R.errors.length > 1 ? "s" : "") + " to the swarm…" }); con();
    const f = R.runFile || R.entry, j = await api("/repair", { id: cur, ctok: mine()[cur], mode, lang: f ? (f.lang === "py" ? "python" : f.lang) : "html", code: f ? f.code : "", errors: R.errors });
    R.fixing = false; btn.disabled = false; btn.textContent = was;
    if (j.error) { R.log.push({ kind: "error", text: "fix: " + j.error }); con(); return; }
    R.note = "v" + j.version + " is ready (v" + j.kept + " kept): running it"; R.view = null; tab = "run"; await poll(); // the new result runs once, from poll
    if (R.note) runIt(); // the result text came back unchanged (nothing new to run from poll): run what's there
  }
  $("fixit").onclick = () => fix("fix");
  $("mkrun").onclick = $("mkdemo").onclick = () => fix("demo");

  // ── files: copy, download, run a particular one; everything as a .zip ──
  const save = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  $("files").onclick = (e) => { const b = e.target.closest("[data-fcopy],[data-fdl],[data-frun]"); if (!b) return; const f = R.files[+(b.dataset.fcopy || b.dataset.fdl || b.dataset.frun)]; if (!f) return;
    if (b.dataset.fcopy != null) navigator.clipboard.writeText(f.code).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1300); });
    else if (b.dataset.fdl != null) save(f.name, new Blob([f.code], { type: "text/plain" }));
    else { show("run"); runIt(f); } };
  $("dlzip").onclick = () => { if (!R.final || !window.HiveRun) return; const title = ((last && last.project.title) || "hive").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 60);
    save(title + ".zip", HiveRun.zip([...R.files.map((f) => ({ name: f.name, data: f.code })), { name: R.files.some((f) => f.name === "README.md") ? "WRITE-UP.md" : "README.md", data: R.final }])); };

  // ── steering and the rest ──
  $("board").onclick = async (e) => { const d = e.target.closest("[data-t]"); if (!d || !last) return; const t = last.tasks.find((x) => x.id === +d.dataset.t);
    $("dt").textContent = "#" + t.id + " " + t.role + " · " + t.title; $("dd").textContent = t.detail || ""; $("dnote").textContent = t.note ? "Review: " + t.note : ""; $("dout").textContent = "…"; $("dlg").showModal();
    const o = await api("/output?id=" + cur + "&task=" + t.id); $("dout").textContent = o.output || "(nothing yet)"; };
  $("recruit").onclick = async () => { $("recruit").disabled = true; const j = await api("/recruit", { id: cur }); $("recruit").disabled = false; if (j.error) alert(j.error); poll(); };
  $("rebuild").onclick = async () => { if (!confirm("Assemble the final result again from the approved work?")) return; const j = await api("/rebuild", { id: cur, ctok: mine()[cur] }); if (j.error) alert(j.error); R.final = ""; poll(); };
  $("stop").onclick = async () => { if (confirm("Stop this project?")) { await api("/stop", { id: cur, ctok: mine()[cur] }); poll(); } };
  $("send").onclick = async () => { const text = $("chat").value.trim(); if (!text) return; $("chat").value = ""; await api("/say", { id: cur, text, ctok: mine()[cur] }); poll(); };
  $("chat").addEventListener("keydown", (e) => { if (e.key === "Enter") $("send").click(); });
  $("copy").onclick = () => { $("join").select(); try { navigator.clipboard.writeText($("join").value); } catch (e) { document.execCommand("copy"); } $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy"), 1500); };
  $("finalmd").onclick = (e) => { const b = e.target.closest("[data-copy]"); if (!b) return; navigator.clipboard.writeText(b.closest(".pre").querySelector("code").textContent).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }); };
  $("rawb").onclick = () => { const raw = $("final").classList.toggle("hidden"); $("finalmd").classList.toggle("hidden", !raw); $("rawb").textContent = raw ? "Source" : "Formatted"; };
  window.HiveSwarm = { show() { api("/list").then((j) => { owner = !!j.owner; }).catch(() => {}); const qp = new URLSearchParams(location.search).get("p"); qp ? open(qp) : home(); }, hide() { cur = null; clearInterval(timer); } };
})();
