/* FaberOS 0.1 · the shell. Reads the app manifest (assets/os/apps.json, built from the one project registry), puts each
   app in its own window, and lets an app use only the browser features its manifest declares: the sensitive ones
   (camera, microphone, location, motion sensors, reading the clipboard) only after you say yes here, and your browser
   still asks again before anything is used. Everything FaberOS remembers (open windows, where they sit, the dock, your
   answers) stays in this browser under "fos:" and is never sent anywhere. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("fos:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("fos:" + k, JSON.stringify(v)); } catch (e) {} },
    wipe() { try { Object.keys(localStorage).filter((k) => k.startsWith("fos:")).forEach((k) => localStorage.removeItem(k)); } catch (e) {} },
  };
  const os = $("#os"), desk = $("#desk"), wins = $("#windows"), phone = matchMedia("(max-width: 760px)");
  const SENSITIVE = { camera: "your camera", microphone: "your microphone", geolocation: "your location", "clipboard-read": "what you've copied", gyroscope: "motion sensors", accelerometer: "motion sensors", magnetometer: "motion sensors", "xr-spatial-tracking": "VR and AR tracking" };
  const BASICS = ["fullscreen", "autoplay", "clipboard-write"];
  const STATUS = { live: "Web", invite: "Invite", soon: "Coming soon", android: "Android", music: "Music" };
  const PINS = ["hive", "orbit", "mentiplayer", "cartograph", "ballast", "conflict-atlas", "foundry"];
  let M = { apps: [], cats: [] }, byId = {}, z = 10, front = null;
  const open = new Map(); // id → { el, app }
  let pins = LS.get("pins", PINS), grants = LS.get("grants", {}), geo = LS.get("geo", {});

  // the built-in parts of FaberOS: drawn here, not loaded in a frame
  const SYS = {
    about: { id: "about", name: "About FaberOS", hue: 38, builtin: true, glyph: '<path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><path d="M12 11v5M12 8v.01"/>' },
    settings: { id: "settings", name: "Settings", hue: 38, builtin: true, glyph: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>' },
  };

  const tile = (a) => '<span class="tile" style="--h:' + (a.hue == null ? 38 : a.hue) + '" aria-hidden="true">' + (a.icon ? '<img src="' + esc(a.icon) + '" alt="" loading="lazy">' : '<svg viewBox="0 0 24 24">' + (a.glyph || SYS.about.glyph) + "</svg>") + "</span>";
  const app = (id) => SYS[id] || byId[id];
  const runs = (a) => !!(a && (a.builtin || a.entry || a.page) && a.status !== "soon");
  const target = (a) => a.entry || (a.page ? (/\.html$|\/$|^https?:/.test(a.page) ? a.page : a.page + ".html") : null);
  const needs = (a) => (a.permissions || []).filter((p) => SENSITIVE[p]);
  const allowed = (a) => { const p = a.permissions || BASICS; return grants[a.id] === "all" ? p : p.filter((x) => !SENSITIVE[x]); };
  const label = (ps) => [...new Set(ps.map((p) => SENSITIVE[p]))].join(", ");
  const toast = (t) => { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 3200); };
  const saveOpen = () => LS.set("open", [...open.keys()].filter((id) => !String(id).startsWith("url:")).sort((a, b) => (+open.get(a).el.style.zIndex) - (+open.get(b).el.style.zIndex)));

  // ── asking before an app gets something sensitive ──
  const ask = (a) => new Promise((done) => {
    const c = $("#consent"), back = document.activeElement, ps = needs(a);
    $("#c-h").textContent = a.name + " would like to use";
    $("#c-p").textContent = "Its code uses these, so its window may ask for them. Without them, " + a.name + " still opens; the parts that need them won't work.";
    $("#c-list").innerHTML = [...new Set(ps.map((p) => SENSITIVE[p]))].map((t) => "<li>" + esc(t) + "</li>").join("");
    c.hidden = false; $("#c-yes").focus();
    const end = (v) => { c.hidden = true; $("#c-yes").onclick = $("#c-no").onclick = null; c.onkeydown = null; if (back && back.focus) back.focus(); done(v); };
    $("#c-yes").onclick = () => end("all"); $("#c-no").onclick = () => end("basic");
    c.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); end(null); } if (e.key === "Tab") { const f = $$("button", c); const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } };
  });

  // ── windows ──
  const deskBox = () => wins.getBoundingClientRect();
  const place = (id) => {
    const b = deskBox(), g = geo[id], n = open.size % 6;
    const w = Math.min(g ? g.w : 1000, b.width - 20), h = Math.min(g ? g.h : 680, b.height - 20);
    const x = Math.max(0, Math.min(g ? g.x : 30 + n * 28, b.width - Math.min(w, 120))), y = Math.max(0, Math.min(g ? g.y : 16 + n * 24, b.height - 40));
    return { x, y, w, h };
  };
  const focus = (id) => {
    const o = open.get(id); if (!o) return;
    o.el.classList.remove("min"); o.el.style.zIndex = ++z; front = id;
    $$(".win", wins).forEach((w) => w.classList.toggle("focus", w === o.el));
    $("#bar-title").textContent = o.app.name; document.title = o.app.name + " · FaberOS";
    drawDock(); saveOpen();
  };
  const showDesk = () => { open.forEach((o) => o.el.classList.add("min")); front = null; $$(".win", wins).forEach((w) => w.classList.remove("focus")); $("#bar-title").textContent = "Desktop"; document.title = "FaberOS · Mentifaber"; drawDock(); };
  const topmost = () => [...open.entries()].filter(([, o]) => !o.el.classList.contains("min")).sort((a, b) => b[1].el.style.zIndex - a[1].el.style.zIndex)[0];
  const close = (id) => {
    const o = open.get(id); if (!o) return; o.el.remove(); open.delete(id);
    const t = topmost(); if (t) focus(t[0]); else showDesk(); saveOpen();
  };
  const minimize = (id) => { const o = open.get(id); if (!o) return; o.el.classList.add("min"); o.el.classList.remove("focus"); const t = topmost(); if (t) focus(t[0]); else showDesk(); };

  async function launch(id, opts = {}) {
    let a = app(id) || opts.app; if (!a) return toast("FaberOS doesn't know that app");
    if (a.status === "soon") { toast(a.name + " isn't open yet: its page says what's coming"); a = { ...a, id: a.id + ":page", entry: null, permissions: [] }; }
    closeLauncher();
    if (open.has(a.id)) { const o = open.get(a.id); if (opts.src) o.el.querySelector("iframe").src = opts.src; return focus(a.id); }
    if (!a.builtin && needs(a).length && !grants[a.id]) { if (opts.quiet) return; const g = await ask(a); if (!g) return; grants[a.id] = g; LS.set("grants", grants); }
    const p = place(a.id), el = document.createElement("section");
    el.className = "win"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", a.name); el.dataset.id = a.id;
    Object.assign(el.style, { left: p.x + "px", top: p.y + "px", width: p.w + "px", height: p.h + "px" });
    const granted = a.builtin ? [] : allowed(a).filter((x) => SENSITIVE[x]), url = a.builtin ? null : opts.src || target(a);
    el.innerHTML = '<div class="win-bar">' + tile(a) + "<b>" + esc(a.name) + "</b>" + (granted.length ? '<span class="perm" title="This window may ask for: ' + esc(label(granted)) + '">' + esc(label(granted)) + "</span>" : "") +
      (url ? '<a class="wb" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(a.name) + ' in its own tab" title="Open in its own tab"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg></a>' : "") +
      '<button class="wb" data-w="min" aria-label="Minimize" title="Minimize"><svg viewBox="0 0 24 24"><path d="M5 17h14"/></svg></button>' +
      '<button class="wb max" data-w="max" aria-label="Maximize" title="Maximize"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button>' +
      '<button class="wb close" data-w="close" aria-label="Close ' + esc(a.name) + '" title="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      (a.builtin ? '<div class="inner"></div>' : '<iframe title="' + esc(a.name) + '" loading="eager"></iframe><div class="shield"></div>') + '<div class="grip" aria-hidden="true"></div>';
    if (a.builtin) RENDER[a.id]($(".inner", el));
    else { const f = $("iframe", el); f.allow = allowed(a).join("; "); f.src = url; }
    wins.appendChild(el); open.set(a.id, { el, app: a });
    wire(el, a.id); focus(a.id);
  }

  function wire(el, id) {
    el.addEventListener("pointerdown", () => { if (front !== id) focus(id); }, true);
    $(".win-bar", el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-w]"); if (!b) return;
      if (b.dataset.w === "close") close(id); else if (b.dataset.w === "min") minimize(id); else { el.classList.toggle("max"); }
    });
    $(".win-bar", el).addEventListener("dblclick", (e) => { if (!e.target.closest(".wb")) el.classList.toggle("max"); });
    const drag = (handle, how) => handle.addEventListener("pointerdown", (e) => {
      if (phone.matches || e.button !== 0 || e.target.closest(".wb") || el.classList.contains("max")) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId); os.classList.add("dragging");
      const s = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }, b = deskBox();
      const move = (m) => { const dx = m.clientX - s.x, dy = m.clientY - s.y;
        if (how === "move") { el.style.left = Math.max(-s.w + 100, Math.min(b.width - 100, s.l + dx)) + "px"; el.style.top = Math.max(0, Math.min(b.height - 36, s.t + dy)) + "px"; }
        else { el.style.width = Math.max(300, s.w + dx) + "px"; el.style.height = Math.max(200, s.h + dy) + "px"; } };
      const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); os.classList.remove("dragging");
        geo[id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; LS.set("geo", geo); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
    });
    drag($(".win-bar", el), "move"); drag($(".grip", el), "size");
  }
  // a click inside an app's frame never reaches this page; the page losing focus to that frame says which window it was
  addEventListener("blur", () => setTimeout(() => { const f = document.activeElement; if (f && f.tagName === "IFRAME") { const w = f.closest(".win"); if (w && w.dataset.id !== front) focus(w.dataset.id); } }, 0));

  // ── the dock and the desktop ──
  function drawDock() {
    const ids = [...new Set([...pins.filter((id) => app(id)), ...open.keys()])];
    $("#dock-apps").innerHTML = ids.map((id) => { const a = app(id) || open.get(id).app;
      return '<button data-app="' + esc(id) + '" class="' + (open.has(id) ? "open" : "") + (front === id ? " front" : "") + '" aria-label="' + esc(a.name) + (open.has(id) ? " (open)" : "") + '" title="' + esc(a.name) + '">' + tile(a) + "</button>"; }).join("");
  }
  $("#dock-apps").onclick = (e) => { const b = e.target.closest("[data-app]"); if (!b) return; const id = b.dataset.app;
    if (open.has(id) && front === id && !phone.matches) minimize(id); else if (open.has(id)) focus(id); else launch(id); };
  $("#home-btn").onclick = showDesk;
  function drawIcons() {
    const ids = [...pins.filter((id) => app(id)), "about", "settings"];
    $("#icons").innerHTML = ids.map((id) => { const a = app(id); return '<button class="ic" data-app="' + esc(id) + '">' + tile(a) + "<span>" + esc(a.name) + "</span></button>"; }).join("") +
      '<button class="ic" data-all>' + tile({ hue: 38, glyph: '<path d="M5 5h4v4H5zM15 5h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z"/>' }) + "<span>All " + M.apps.length + " apps</span></button>";
  }
  $("#icons").onclick = (e) => { const b = e.target.closest(".ic"); if (!b) return; if ("all" in b.dataset) openLauncher(); else launch(b.dataset.app); };
  // a widget opens the app it comes from, in a window, instead of leaving FaberOS
  $("#widgets").addEventListener("click", (e) => {
    const a = e.target.closest("a[href]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const u = new URL(a.href, location.href); if (u.origin !== location.origin) return;
    const path = u.pathname.replace(/^\//, ""), hit = M.apps.find((x) => x.entry && (path === x.entry || path === x.entry.replace(/\.html$/, ""))) || M.apps.find((x) => x.page && (path === x.page || path === x.page + ".html"));
    e.preventDefault();
    if (hit) launch(hit.id, u.search ? { src: hit.entry ? hit.entry + u.search : null } : {});
    else launch("url:" + path, { app: { id: "url:" + path, name: (a.dataset.label || path), entry: path + u.search, hue: 38, permissions: BASICS, status: "live" } });
  });

  // ── the launcher ──
  let lSel = 0, lBack = null;
  const chipOf = (a) => { const out = []; if (a.status && !a.builtin) out.push('<span class="chip ' + esc(a.status) + '">' + esc(STATUS[a.status] || a.status) + "</span>"); if (a.platforms && a.platforms.android && a.status !== "android") out.push('<span class="chip android">Android</span>'); return out.join(""); };
  function drawLauncher() {
    const q = $("#l-q").value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), hit = (a) => { const t = (a.name + " " + a.desc + " " + a.cat + " " + (a.tags || "")).toLowerCase(); return words.every((w) => t.includes(w.replace(/s$/, ""))); }; // every word, singular or plural
    const rows = (list) => '<div class="l-grid">' + list.map((a) => '<button class="la" data-app="' + esc(a.id) + '"' + (runs(a) ? "" : ' aria-disabled="true"') + ">" + tile(a) + "<b><span>" + esc(a.name) + "</span>" + chipOf(a) + "</b><small>" + esc(a.desc) + "</small></button>").join("") + "</div>";
    let html = "";
    if (open.size && !q) html += "<h3>Open now</h3>" + rows([...open.values()].map((o) => o.app));
    for (const c of M.cats) { const list = M.apps.filter((a) => a.cat === c.id && hit(a)); if (list.length) html += "<h3>" + esc(c.name) + "</h3>" + rows(list); }
    if (!q) html += "<h3>FaberOS</h3>" + rows([SYS.about, SYS.settings].map((a) => ({ ...a, status: "live", desc: a.id === "about" ? "The four layers, what FaberOS is, and what comes next." : "Permissions, the dock, the wallpaper, and what FaberOS keeps." })));
    $("#l-body").innerHTML = html || '<p class="l-empty">Nothing by that name. Try a word from what it does: "satellites", "budget", "radio".</p>';
    lSel = 0; mark();
  }
  const mark = () => { const all = $$(".la", $("#l-body")); all.forEach((x, i) => x.classList.toggle("sel", i === lSel && !!$("#l-q").value.trim())); };
  function openLauncher() { lBack = document.activeElement; $("#launcher").hidden = false; $("#l-q").value = ""; drawLauncher(); $("#l-q").focus(); }
  function closeLauncher() { if ($("#launcher").hidden) return; $("#launcher").hidden = true; if (lBack && lBack.focus && document.contains(lBack)) lBack.focus(); lBack = null; }
  $("#all-btn").onclick = openLauncher; $("#l-x").onclick = closeLauncher;
  $("#launcher").addEventListener("click", (e) => { if (e.target.id === "launcher") return closeLauncher(); const b = e.target.closest(".la"); if (b) launch(b.dataset.app); });
  $("#l-q").addEventListener("input", drawLauncher);
  $("#launcher").addEventListener("keydown", (e) => {
    const all = $$(".la", $("#l-body"));
    if (e.key === "Escape") { e.preventDefault(); closeLauncher(); }
    else if (e.target.id === "l-q" && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); lSel = Math.max(0, Math.min(all.length - 1, lSel + (e.key === "ArrowDown" ? 1 : -1))); mark(); const s = all[lSel]; if (s) s.scrollIntoView({ block: "nearest" }); }
    else if (e.target.id === "l-q" && e.key === "Enter") { e.preventDefault(); const s = all[lSel]; if (s) launch(s.dataset.app); }
    else if (e.key === "Tab") { const f = [$("#l-q"), $("#l-x"), ...all]; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });

  // ── the bar ──
  const menu = $("#menu"), mb = $("#menu-btn");
  const menuOpen = (on) => { menu.hidden = !on; mb.setAttribute("aria-expanded", String(on)); if (on) menu.firstElementChild.focus(); };
  mb.onclick = (e) => { e.stopPropagation(); menuOpen(menu.hidden); };
  menu.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) { menuOpen(false); launch(b.dataset.open); } });
  menu.addEventListener("keydown", (e) => { const it = $$("[role=menuitem]", menu), i = it.indexOf(document.activeElement);
    if (e.key === "Escape") { menuOpen(false); mb.focus(); } else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); it[(i + (e.key === "ArrowDown" ? 1 : -1) + it.length) % it.length].focus(); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menuOpen(false); });
  $("#ask").onsubmit = (e) => { e.preventDefault(); const q = $("#ask-in").value.trim(); if (!q) return launch("hive");
    launch("hive", { src: "hive-app.html?ask=" + encodeURIComponent(q.slice(0, 2000)) }); $("#ask-in").value = ""; };
  const tick = () => { const d = new Date();
    $("#clock").textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + "  " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); $("#clock").dateTime = d.toISOString();
    $("#big-time").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); $("#big-date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }); };
  tick(); setInterval(tick, 15e3);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#launcher").hidden ? openLauncher() : closeLauncher(); }
  });

  // ── About and Settings ──
  const RENDER = {
    about(el) {
      const live = M.apps.filter((a) => a.status === "live").length, perms = M.apps.filter((a) => needs(a).length).length;
      el.innerHTML = "<h2>FaberOS " + esc(M.version || "0.1") + "</h2><p>Mentifaber's operating environment, in the browser: every app in its own window, live widgets on the desktop, and one place to see what each app may use. Nothing to install, nothing to sign in to.</p>" +
        '<h3>Four layers</h3><div class="layers">' +
        '<div><b>Mentifaber</b><span>The workshop: every project, its page and its story.</span></div>' +
        '<div><b>AutoFaber</b><span>The intelligence: the mind that answers, remembers and builds. Ask it from the bar at the top.</span></div>' +
        '<div class="here"><b>FaberOS</b><span>The operating environment, and where you are now: apps, widgets, windows and permissions.</span></div>' +
        '<div><b>Foundry</b><span>Distribution: installs and updates for the Android and iPhone apps, and later, apps by other people.</span></div></div>' +
        "<h3>What it runs</h3><p>" + M.apps.length + " apps from one registry, " + live + " of them open to everyone. Each one comes with a manifest (format <code>" + esc(M.format) + "</code>): its name, where it runs, its version, and the browser features it may use. " + perms + " of them use something sensitive (camera, microphone, location or motion sensors) and ask you first.</p>" +
        '<h3>Where it\'s going</h3><ul class="road">' +
        '<li class="done">App manifests from one registry, windows, widgets, a permission per app ✓</li>' +
        "<li>AutoFaber as a system service: ask from anywhere, and let it open and arrange apps for you</li>" +
        "<li>Notifications and a shared file shelf between apps</li>" +
        "<li>Foundry for everyone: developer registration, signed packages, declared permissions, versions with rollback, review, ratings, security scanning, and install, update and uninstall from here</li></ul>" +
        '<p style="margin-top:14px"><button class="btn" data-go="settings">Settings and permissions</button> <button class="btn" data-go="privacy">Privacy</button></p>';
      el.onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) launch(b.dataset.go); };
    },
    settings(el) {
      const ps = M.apps.filter((a) => needs(a).length);
      const state = (a) => grants[a.id] === "all" ? "Allowed" : grants[a.id] === "basic" ? "Not allowed" : "Asks first";
      el.innerHTML = "<h2>Settings</h2><p>FaberOS keeps its settings in this browser only; nothing here is sent anywhere. The site's own data is on <a href=\"privacy\" data-go=\"privacy\">the privacy page</a>.</p>" +
        "<h3>Permissions</h3><p>The apps whose code uses something sensitive. A change takes effect the next time the app opens.</p>" +
        ps.map((a) => '<div class="prow">' + tile(a) + "<div><b>" + esc(a.name) + "</b><small>May ask for " + esc(label(needs(a))) + "</small></div>" +
          '<button class="btn" data-perm="' + esc(a.id) + '" aria-label="' + esc(a.name) + ": " + state(a) + '. Change">' + state(a) + "</button></div>").join("") +
        "<h3>Dock</h3><p>The apps on the dock and the desktop.</p>" +
        M.apps.filter(runs).map((a) => '<div class="prow">' + tile(a) + "<div><b>" + esc(a.name) + '</b></div><button class="btn" data-pin="' + esc(a.id) + '" aria-pressed="' + pins.includes(a.id) + '">' + (pins.includes(a.id) ? "On the dock" : "Add") + "</button></div>").join("") +
        '<h3>Wallpaper</h3><div class="walls">' + [["forge", "Forge"], ["night", "Night"], ["plan", "The plan"]].map(([k, n]) => '<button data-wall="' + k + '" aria-pressed="' + (os.dataset.wall === k) + '">' + n + "</button>").join("") + "</div>" +
        '<h3>This device</h3><p><button class="btn" data-reset>Forget everything FaberOS keeps here</button></p>';
      el.onclick = (e) => {
        const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); return launch(g.dataset.go); }
        const p = e.target.closest("[data-perm]");
        if (p) { const id = p.dataset.perm; grants[id] = grants[id] === "all" ? "basic" : "all"; LS.set("grants", grants); if (open.has(id)) toast("Close and reopen " + app(id).name + " for this to apply"); return RENDER.settings(el); }
        const pn = e.target.closest("[data-pin]");
        if (pn) { const id = pn.dataset.pin; pins = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id]; LS.set("pins", pins); drawDock(); drawIcons(); return RENDER.settings(el); }
        const w = e.target.closest("[data-wall]"); if (w) { os.dataset.wall = w.dataset.wall; LS.set("wall", w.dataset.wall); return RENDER.settings(el); }
        if (e.target.closest("[data-reset]") && confirm("Forget the open windows, their places, the dock, the wallpaper and your permission answers on this device?")) { LS.wipe(); location.reload(); }
      };
    },
  };

  // ── start ──
  os.dataset.wall = LS.get("wall", "forge");
  fetch("assets/os/apps.json").then((r) => r.json()).then(async (m) => {
    M = m; byId = Object.fromEntries(m.apps.map((a) => [a.id, a]));
    drawIcons(); drawDock();
    const want = new URLSearchParams(location.search).get("open");
    for (const id of LS.get("open", [])) if (app(id) && id !== want) await launch(id, { quiet: true }); // apps that still need an answer wait to be opened again
    if (want && app(want)) launch(want);
    if (!LS.get("seen", false)) { LS.set("seen", true); if (!want) launch("about"); }
  }).catch(() => { $("#icons").innerHTML = '<p style="color:var(--dim)">FaberOS couldn\'t load its app list. <a href="./">The workshop</a> has every app.</p>'; });
  phone.addEventListener("change", () => { if (front) focus(front); });
})();
