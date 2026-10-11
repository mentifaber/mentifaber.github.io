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
