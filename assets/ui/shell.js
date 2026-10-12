/* Mentifaber 2 · page behaviour. The page explains the app; scrolling to the end turns the explanation into the app
   itself: a framed preview grows into the full screen and "docks", and from then on the app owns the screen (the
   phone's back button, or ← About, returns to the page). Also: install as an app, the top bar, reveals.
   Config: <script type="application/json" id="mf-app">{"id","name","app","h"}</script> */
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const cfgEl = $("#mf-app"), cfg = cfgEl ? JSON.parse(cfgEl.textContent) : {};
  const root = document.documentElement;
  const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // An installed app, or a link meant for the app itself (an invite, a deep link), goes straight in.
  if (cfg.app) {
    const h = location.hash, deep = (h && h.length > 1 && !/^#(app|about|top)$/.test(h)) || /[?&](?!utm_)[^=]+=/.test(location.search);
    if (standalone || deep) { location.replace(cfg.app + location.search + h); return; }
  }

  // ── top bar: solid once you leave the top, hides while reading downward ──
  const bar = $(".mf-bar");
  let lastY = scrollY;
  const onBar = () => { if (!bar) return; const y = scrollY; bar.classList.toggle("solid", y > 20); bar.classList.toggle("away", y > 280 && y > lastY + 4); if (y < lastY - 4) bar.classList.remove("away"); lastY = y; };

  // ── reveals and the card spotlight ──
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" }) : null;
  $$(".reveal").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  document.addEventListener("pointermove", (e) => { const c = e.target.closest && e.target.closest(".card"); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); }, { passive: true });

  // ── light or dark, remembered (applied before paint by a line in each page's head) ──
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const t = root.dataset.theme === "light" ? "dark" : "light"; root.dataset.theme = t;
    try { localStorage.setItem("mf:theme", t); } catch (err) {}
    const m = $('meta[name="theme-color"]'); if (m) m.content = t === "light" ? "#f6f3ec" : "#05060a";
  });

  // ── install as an app ──
  let deferred = null;
  const installBtns = () => $$("[data-install]");
  const showInstall = (on) => installBtns().forEach((b) => (b.hidden = !on));
  showInstall(!standalone && ios);
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; showInstall(true); });
  addEventListener("appinstalled", () => { deferred = null; showInstall(false); toast((cfg.name || "App") + " is installed"); });
  const sheet = (html) => {
    let s = $("#mf-sheet"); if (!s) { s = document.createElement("div"); s.id = "mf-sheet"; s.className = "sheet"; s.setAttribute("role", "dialog"); s.innerHTML = '<div class="pane"></div>'; document.body.appendChild(s); s.addEventListener("click", (e) => { if (e.target === s || e.target.closest("[data-close]")) s.classList.remove("open"); }); }
    $(".pane", s).innerHTML = html; requestAnimationFrame(() => s.classList.add("open"));
  };
  async function install() {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); if (r && r.outcome === "accepted") showInstall(false); deferred = null; return; }
    if (ios) return sheet('<h3>Add ' + esc(cfg.name || "it") + ' to your Home Screen</h3><ol><li>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> in Safari\'s toolbar.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. It opens full screen, like any app.</li></ol><div class="row"><button class="btn sm" data-close>Got it</button></div>');
    sheet('<h3>Install ' + esc(cfg.name || "this app") + '</h3><p>Use your browser\'s menu: <b>Install app</b> or <b>Add to Home screen</b> (Chrome, Edge, Samsung Internet, Brave). Firefox on desktop can\'t install web apps; it runs fine in a tab.</p><div class="row"><button class="btn sm" data-close>OK</button></div>');
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-install]"); if (b) { e.preventDefault(); install(); } });

  // ── the morph ──
  const morph = $(".morph"), stage = morph && $(".stage", morph), frame = morph && $(".frame", morph), glow = morph && $(".glow", morph), enter = morph && $(".enter", morph);
  let iframe = null, docked = false, p = 0, prevY = scrollY, calmUntil = 0;
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function load() {
    if (iframe || !frame || !cfg.app) return;
    iframe = document.createElement("iframe");
    iframe.src = cfg.app; iframe.title = (cfg.name || "App") + " (live)";
    iframe.allow = "fullscreen; autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation; screen-wake-lock; web-share; xr-spatial-tracking; gyroscope; accelerometer; magnetometer; serial; usb; bluetooth";
    iframe.addEventListener("load", () => { frame.classList.add("loaded"); wire(); });
    frame.appendChild(iframe);
  }
  // inside the app: links that leave it navigate the whole tab, and a reach to the top edge brings the dock back
  function wire() {
    let w; try { w = iframe.contentWindow; w.document; } catch (e) { return; }
    const appPath = new URL(cfg.app, location.href).pathname.replace(/\.html$/, "");
    w.document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]"); if (!a || a.target === "_blank" || e.defaultPrevented) return;
      const u = new URL(a.href, w.location.href); if (u.origin !== location.origin) return;
      if (u.pathname.replace(/\.html$/, "") === appPath) return;
      e.preventDefault(); location.href = u.href;
    }, true);
    w.addEventListener("pointermove", (e) => { if (e.clientY < 36) untuck(); }, { passive: true });
    w.addEventListener("touchstart", (e) => { if (e.touches[0] && e.touches[0].clientY < 36) untuck(); }, { passive: true });
  }
  function layout() {
    if (!morph || docked) return;
    const r = morph.getBoundingClientRect(), vh = innerHeight, vw = innerWidth, total = Math.max(1, r.height - vh);
    p = reduce ? 0 : Math.min(1, Math.max(0, -r.top / total));
    if (r.top < vh * 2.2) load();
    if (reduce) return;
    const e = ease(p), s0 = Math.min(1080, vw * .9) / vw, h0 = Math.min(vh * .6, 640), ci0 = Math.max(0, (vh - h0 / s0) / 2);
    const s = s0 + (1 - s0) * e, ci = ci0 * (1 - e), rad = (26 * (1 - e)) / s, ty = (1 - e) * Math.min(vh * .1, 90);
    frame.style.transform = "translate3d(0," + ty.toFixed(1) + "px,0) scale(" + s.toFixed(4) + ")";
    frame.style.clipPath = "inset(" + ci.toFixed(1) + "px 0 " + ci.toFixed(1) + "px 0 round " + rad.toFixed(1) + "px)";
    stage.style.setProperty("--p", p.toFixed(3));
    const cw = vw * s, ch = (vh - 2 * ci) * s;
    if (glow) { glow.style.width = cw + "px"; glow.style.height = ch + "px"; glow.style.transform = "translate(-50%, calc(-50% + " + ty + "px))"; glow.style.opacity = String(1 - e); }
    if (enter) { enter.style.top = (vh / 2 + ty + ch / 2 - 74) + "px"; enter.style.opacity = String(Math.max(0, 1 - e * 3)); }
    const down = scrollY > prevY; prevY = scrollY;
    if (p >= .995 && down && Date.now() > calmUntil) dock(true); // only while heading down: coming back up never re-docks
  }
  function dock(push) {
    if (docked || !frame) return; load(); docked = true; root.classList.add("docked"); untuck();
    if (push && location.hash !== "#app") history.pushState({ mfDock: 1 }, "", "#app");
  }
  function undock(fromPop) {
    if (!docked) return; docked = false; root.classList.remove("docked");
    calmUntil = Date.now() + 700;
    if (!fromPop && location.hash === "#app") history.back();
    const r = morph.getBoundingClientRect(), total = r.height - innerHeight;
    scrollTo({ top: scrollY + r.top + total * .62, behavior: "instant" });
    prevY = scrollY; layout();
  }
  function launch() { // glide to the end of the runway; the morph docks when it gets there
    if (!morph) return;
    if (reduce) return dock(true);
    const r = morph.getBoundingClientRect(), target = scrollY + r.bottom - innerHeight + 2;
    load(); calmUntil = 0; if (Math.abs(target - scrollY) < 40) return dock(true);
    prevY = scrollY - 1; scrollTo({ top: target, behavior: "smooth" });
  }
  addEventListener("popstate", () => { if (docked && location.hash !== "#app") undock(true); else if (!docked && location.hash === "#app") dock(false); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-launch]")) { e.preventDefault(); launch(); } });
  if (frame) frame.addEventListener("click", () => !docked && launch());

  // the dock: ← About · the app · open as its own page · install
  let tuckT = 0;
  const dockEl = document.createElement("div"); dockEl.className = "dock"; dockEl.style.setProperty("--h", cfg.h || 38);
  if (cfg.app) {
    dockEl.innerHTML = '<button data-back aria-label="Back to the page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span class="lbl">About</span></button>' +
      '<span class="name">' + (($(".hero .tile") || {}).outerHTML || "").replace('class="tile', 'class="tile sm') + esc(cfg.name || "") + '</span>' +
      '<a href="' + esc(cfg.app) + '" aria-label="Open as its own page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg><span class="lbl">Full page</span></a>' +
      '<button data-install hidden aria-label="Install"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span class="lbl">Install</span></button>';
    document.body.appendChild(dockEl);
    dockEl.querySelector("[data-back]").addEventListener("click", () => undock(false));
    dockEl.addEventListener("pointerenter", untuck); dockEl.addEventListener("touchstart", untuck, { passive: true });
    showInstall(!standalone && (ios || !!deferred));
  }
  function untuck() { dockEl.classList.remove("tuck"); clearTimeout(tuckT); tuckT = setTimeout(() => docked && dockEl.classList.add("tuck"), 2600); }

  // ── the suite: every app on the home screen, one at a time ──
  // A browser installs an app only when the person taps Install for it, so the suite can't do it silently. It queues the
  // apps you pick and walks through them: on a phone each app's page opens here with an Install button, you tap and
  // confirm, and the next one comes up by itself; on a computer (where Chrome moves an installed page into its own
  // window) each opens in a new tab and this page keeps the list. The queue lives in localStorage under mf:suite.
  const SK = "mf:suite", SD = "mf:suite-installed";
  const sGet = (k = SK) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const sSet = (v, k = SK) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const markInstalled = (id) => { const d = sGet(SD) || {}; d[id] = Date.now(); sSet(d, SD); };
  const chainMode = ios || matchMedia("(pointer: coarse)").matches || /android|mobile/i.test(navigator.userAgent);
  const canPrompt = "onbeforeinstallprompt" in window;
  let suiteList = null;
  const loadSuite = async () => suiteList || (suiteList = await fetch("assets/suite.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => []));
  addEventListener("appinstalled", () => { if (cfg.id) markInstalled(cfg.id); });
  const platformNote = () => ios ? "Safari doesn't let a website press Install for you, so each app shows the two taps to make (Share, then Add to Home Screen) and a Next button."
    : !canPrompt ? "This browser installs from its own menu (Add to Home screen). Each app shows the steps and a Next button. Chrome, Edge, Samsung Internet and Brave can do it in one tap."
    : chainMode ? "Each app opens here with an Install button. Tap it, confirm, and the next one comes up by itself."
    : "Each app opens in a new tab with an Install button. Once it's installed, come back here and the next one is ready.";

  async function openSuite() {
    if (standalone) return sheet('<div class="suite"><h3>Install the suite</h3><p class="sub">You\'re inside the installed Mentifaber app, and apps can only be added to the home screen from the browser. Open <b>' + esc(location.host) + '</b> in Chrome, Safari or Edge and tap <b>Install the suite</b> there.</p><div class="row"><button class="btn sm pri" data-scopy>Copy the link</button><button class="btn sm" data-close>OK</button></div></div>'), ($("[data-scopy]") || {}).onclick = () => { try { navigator.clipboard.writeText(location.origin + "/#suite"); toast("Link copied"); } catch (e) {} };
    const list = await loadSuite(), st = sGet(), have = sGet(SD) || {};
    if (!list.length) return sheet('<h3>Install the suite</h3><p>The app list couldn\'t load. Try again when you\'re online.</p><div class="row"><button class="btn sm" data-close>OK</button></div>');
    const running = st && !st.fin && st.i < st.items.length, cats = [];
    list.forEach((a) => { let g = cats.find((c) => c[0] === a.c); if (!g) cats.push((g = [a.c, []])); g[1].push(a); });
    sheet('<div class="suite"><h3>Install the suite</h3><p class="sub">Every Mentifaber app as its own icon on your home screen. ' + esc(platformNote()) + '</p>' +
      '<div class="launcher"><img src="assets/icons/v2/mentifaber-192.png" alt="" width="44" height="44"><span><b>Mentifaber</b><small>the launcher: everything in one place, with shortcuts</small></span>' + (standalone ? '<span class="ok">✓ open now</span>' : '<button class="btn sm" data-install-home>Install</button>') + '</div>' +
      (running ? '<div class="resume"><span>A suite run is under way: <b>' + st.i + ' of ' + st.items.length + '</b> done.</span><button class="btn sm pri" data-sresume>Resume</button><button class="btn sm" data-sreset>Start over</button></div>' : "") +
      (st && st.fin ? '<p class="last">Last run: <b>' + st.done.length + '</b> installed, ' + (st.already || []).length + ' already there, ' + st.skipped.length + ' skipped.</p>' : "") +
      '<div class="tools"><span><b data-scount>0</b> selected</span><button data-sall>All</button><button data-snone>None</button><button data-snew>Not yet installed</button></div>' +
      '<div class="list">' + cats.map(([c, as]) => '<div class="cat">' + esc(c) + "</div>" + as.map((a) => '<label class="si"><input type="checkbox" value="' + esc(a.id) + '"' + (have[a.id] ? "" : " checked") + '><img src="' + esc(a.ic) + '" alt="" width="32" height="32" loading="lazy"><span>' + esc(a.n) + (a.lock ? ' <i title="private: sign-in needed to use it">🔒</i>' : "") + "</span>" + (have[a.id] ? '<small class="ok">✓ installed</small>' : "") + "</label>").join("")).join("") + "</div>" +
      '<div class="row"><button class="btn pri" data-sstart>Add them one by one</button><button class="btn sm" data-close>Close</button></div></div>');
    const pane = $("#mf-sheet .pane"), boxes = () => $$(".si input", pane);
    const count = () => { const n = boxes().filter((b) => b.checked).length; $("[data-scount]", pane).textContent = n; const go = $("[data-sstart]", pane); go.disabled = !n; go.textContent = n ? "Add " + n + " app" + (n > 1 ? "s" : "") + ", one by one" : "Pick some apps"; };
    pane.addEventListener("change", count); count();
    pane.onclick = (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-sall]")) { boxes().forEach((b) => (b.checked = true)); count(); }
      else if (t.matches("[data-snone]")) { boxes().forEach((b) => (b.checked = false)); count(); }
      else if (t.matches("[data-snew]")) { boxes().forEach((b) => (b.checked = !have[b.value])); count(); }
      else if (t.matches("[data-install-home]")) install();
      else if (t.matches("[data-sreset]")) { sSet(null); openSuite(); }
      else if (t.matches("[data-sresume]")) { const s2 = sGet(); s2.stopped = false; s2.mode = chainMode ? "chain" : "tabs"; sSet(s2); go(s2); }
      else if (t.matches("[data-sstart]")) {
        const pick = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
        const s2 = { items: list.filter((a) => pick.has(a.id)).map((a) => ({ id: a.id, n: a.n, p: a.p, ic: a.ic })), i: 0, done: [], skipped: [], mode: chainMode ? "chain" : "tabs", t: Date.now() };
        sSet(s2); go(s2);
      }
    };
  }
  function go(st) { // start or resume a run
    if (st.mode === "chain") { location.href = st.items[st.i].p; return; }
    controller();
  }
  function controller() { // desktop: this page keeps the list; each app installs from its own tab
    const st = sGet(); if (!st) return;
    if (st.fin || st.i >= st.items.length) return finished(st);
    const a = st.items[st.i], pct = Math.round((100 * st.i) / st.items.length);
    sheet('<div class="suite"><h3>Installing the suite</h3><div class="bar"><i style="width:' + pct + '%"></i></div><p class="sub"><b>' + (st.i + 1) + " of " + st.items.length + '</b> · ' + st.done.length + ' installed, ' + st.skipped.length + ' skipped</p>' +
      '<div class="launcher"><img src="' + esc(a.ic) + '" alt="" width="44" height="44"><span><b>' + esc(a.n) + '</b><small>opens in a new tab with an Install button; this list waits here</small></span></div>' +
      '<div class="row"><button class="btn pri" data-sopen>Open ' + esc(a.n) + '</button><button class="btn sm" data-sskip>Skip</button><button class="btn sm" data-sstop>Stop</button></div></div>');
    const pane = $("#mf-sheet .pane");
    pane.onclick = (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-sopen]")) { window.open(a.p, "_blank"); t.textContent = "Waiting for " + a.n + "…"; }
      else if (t.matches("[data-sskip]")) { const s2 = sGet(); step(s2, false); controller(); }
      else if (t.matches("[data-sstop]")) { const s2 = sGet(); s2.stopped = true; sSet(s2); $("#mf-sheet").classList.remove("open"); toast("Stopped. Resume from Install the suite."); }
    };
  }
  function finished(st) {
    st.fin = st.fin || Date.now(); sSet(st);
    sheet('<div class="suite"><h3>The suite is installed</h3><p class="sub"><b>' + st.done.length + '</b> app' + (st.done.length === 1 ? "" : "s") + ' installed' + ((st.already || []).length ? ", " + st.already.length + " already there" : "") + (st.skipped.length ? ", " + st.skipped.length + " skipped" : "") + '. They\'re on your home screen' + (chainMode ? "" : " and in your apps list") + '; each opens full screen, like any app.</p>' +
      (st.skipped.length ? '<p class="last">Skipped: ' + st.skipped.map((id) => esc((st.items.find((x) => x.id === id) || { n: id }).n)).join(", ") + '. Run the suite again and pick "Not yet installed" to try them.</p>' : "") +
      '<div class="row"><button class="btn sm pri" data-close>Done</button></div></div>');
  }
  function step(st, ok) { // the current app is finished: installed (true), skipped (false) or already there ("already")
    const a = st.items[st.i]; if (!a) return st;
    st.already = st.already || [];
    (ok === "already" ? st.already : ok ? st.done : st.skipped).push(a.id); if (ok) markInstalled(a.id);
    st.i++; if (st.i >= st.items.length) st.fin = Date.now();
    sSet(st); return st;
  }
  // on an app's page: the step for this app
  function suiteStep() {
    const st = sGet(); if (!st || st.stopped || st.fin || !cfg.id || standalone) return;
    const a = st.items[st.i]; if (!a || a.id !== cfg.id) return;
    const el = document.createElement("div"); el.className = "suitebar"; el.style.setProperty("--h", cfg.h || 38); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Suite installer");
    el.innerHTML = '<div class="sb-top"><span class="sb-k">Suite · ' + (st.i + 1) + " of " + st.items.length + '</span><button class="sb-x" aria-label="Stop the suite" data-sbstop>✕</button></div>' +
      '<div class="sb-main"><img src="' + esc(a.ic) + '" alt="" width="40" height="40"><span><b>' + esc(a.n) + '</b><small class="sb-msg"></small></span></div><div class="sb-row"></div>';
    document.body.appendChild(el);
    const msg = $(".sb-msg", el), row = $(".sb-row", el); let countdown = 0;
    const btns = (html) => { row.innerHTML = html; };
    const next = (ok) => {
      clearInterval(countdown); const s2 = step(sGet(), ok);
      if (s2.mode === "chain") { msg.textContent = ok === "already" ? "Already there ✓" : ok ? "Installed ✓" : "Skipped"; setTimeout(() => { location.href = s2.fin ? "./#suite" : s2.items[s2.i].p; }, ok ? 900 : 200); }
      else { msg.textContent = (ok === "already" ? "Already there ✓ " : ok ? "Installed ✓ " : "Skipped. ") + (s2.fin ? "That was the last one." : "The suite tab has the next one ready."); btns('<button class="btn sm" data-sbclose>Close this tab</button>'); try { if (!matchMedia("(display-mode: standalone)").matches) setTimeout(() => window.close(), 1600); } catch (e) {} }
    };
    const ready = () => { msg.textContent = "Tap Install, then confirm."; btns('<button class="btn sm pri" data-sbgo>Install</button><button class="btn sm" data-sbskip>Skip</button>'); };
    const manual = (how) => { msg.innerHTML = how; btns('<button class="btn sm pri" data-sbdone>Done, next →</button><button class="btn sm" data-sbskip>Skip</button>'); };
    if (ios) manual("Tap <b>Share</b> ⬆︎, then <b>Add to Home Screen</b>, then <b>Add</b>.");
    else if (!canPrompt) manual("Open the browser menu ⋮ and choose <b>Add to Home screen</b> or <b>Install</b>.");
    else if (deferred) ready();
    else {
      msg.textContent = "Waiting for the browser's install offer…"; btns('<button class="btn sm" data-sbskip>Skip</button>');
      addEventListener("beforeinstallprompt", () => { clearTimeout(waitT); clearInterval(countdown); ready(); }, { once: true });
      const waitT = setTimeout(() => { if (deferred) return ready();
        let n = 5; const tickC = () => { msg.textContent = "No install offer: it's probably installed already. Moving on in " + n + "…"; if (n-- <= 0) next("already"); };
        btns('<button class="btn sm pri" data-sbnext>Next →</button><button class="btn sm" data-sbstay>Stay</button>'); tickC(); countdown = setInterval(tickC, 1000); }, 3500);
    }
    el.addEventListener("click", async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-sbgo]")) {
        if (!deferred) { msg.textContent = "The install offer expired; reloading to get a fresh one…"; return setTimeout(() => location.reload(), 600); }
        const d = deferred; deferred = null; d.prompt(); const r = await d.userChoice.catch(() => null);
        if (r && r.outcome === "accepted") next(true); else { msg.textContent = "Not installed."; btns('<button class="btn sm pri" data-sbretry>Try again</button><button class="btn sm" data-sbskip>Skip</button>'); }
      }
      else if (t.matches("[data-sbretry]")) location.reload();
      else if (t.matches("[data-sbdone]")) next(true);
      else if (t.matches("[data-sbskip]")) next(false);
      else if (t.matches("[data-sbnext]")) next("already");
      else if (t.matches("[data-sbstay]")) { clearInterval(countdown); msg.textContent = "Staying. Install from the browser menu if you like, then:"; btns('<button class="btn sm pri" data-sbdone>Done, next →</button><button class="btn sm" data-sbskip>Skip</button>'); }
      else if (t.matches("[data-sbclose]")) window.close();
      else if (t.matches("[data-sbstop]")) { const s2 = sGet(); if (s2) { s2.stopped = true; sSet(s2); } el.remove(); toast("Suite stopped. Resume it from the home page."); }
    });
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-suite]")) { e.preventDefault(); const st = sGet(); if (st && !st.fin && !st.stopped && st.mode === "tabs") controller(); else openSuite(); } });
  addEventListener("storage", (e) => { if (e.key === SK && $("#mf-sheet.open .suite") && !cfg.id) { const st = sGet(); if (st && st.mode === "tabs" && !st.stopped) controller(); } }); // a tab finished its app: show the next
  suiteStep();
  if (!cfg.id && location.hash === "#suite") { history.replaceState(null, "", location.pathname + location.search); const st = sGet(); setTimeout(() => (st && st.fin ? finished(st) : openSuite()), 300); }

  // ── tiny toast ──
  function toast(t) { const el = document.createElement("div"); el.textContent = t; el.style.cssText = "position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;padding:10px 16px;border-radius:999px;background:rgba(10,12,20,.92);color:#eef1fb;border:1px solid rgba(255,255,255,.15);font:600 14px/1.2 system-ui"; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
  function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

  // ── frame loop: only while something is moving ──
  let ticking = false;
  const tick = () => { ticking = false; onBar(); layout(); };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }, { passive: true });
  addEventListener("resize", () => requestAnimationFrame(tick));
  tick();
  if (location.hash === "#app") { history.replaceState({ mfDock: 1 }, "", "#app"); requestAnimationFrame(() => dock(false)); }
  window.MF = { launch, dock: () => dock(true), undock: () => undock(false), install };
})();
