// Foundry · the storefront. In a browser it shows the shelf and hands out APKs; inside the Foundry app
// (android/store) the app gives this page window.MentiStore, and the same buttons install, update, open and remove.
// The app never takes an address or checksum from this page: it installs by id from the catalog it fetches itself.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const B = window.MentiStore || null, inApp = !!B, android = inApp || /Android/i.test(navigator.userAgent);
  const SELF = "org.mentifaber.store";
  const S = { apps: [], installed: {}, info: null, prog: {}, q: "", cat: "", loaded: 0, err: "", waitPerm: "" };
  document.documentElement.classList.toggle("in-app", inApp);

  // ---- the line to the Foundry app ----
  const pend = new Map(); let seq = 0;
  const call = (op, extra = {}) => new Promise((res) => {
    if (!B) return res(null);
    const req = ++seq; pend.set(req, res);
    B.postMessage(JSON.stringify({ op, req, ...extra }));
    setTimeout(() => { if (pend.has(req)) { pend.delete(req); res(null); } }, 8000);
  });
  if (B) B.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "reply") { const f = pend.get(m.req); if (f) { pend.delete(m.req); f(m.data); } return; }
    onEvent(m);
  };

  function onEvent(m) {
    const a = S.apps.find((x) => x.id === m.id), name = a ? a.name : "The app";
    if (m.type === "progress") {
      if (m.phase === "busy") { if (!S.prog[m.id]) S.prog[m.id] = { phase: "download", pct: 0 }; }
      else S.prog[m.id] = { phase: m.phase, pct: m.pct || 0, self: m.self };
      if (m.phase === "install" && m.self) toast("Foundry is updating itself. It will close and reopen on the new version.");
      paintActions();
    } else if (m.type === "done") {
      delete S.prog[m.id];
      if (m.ok) toast(m.msg === "Up to date" ? name + " is up to date." : name + " is installed.");
      else if (m.msg !== "Cancelled") toast(name + ": " + m.msg, true);
      refreshInstalled();
    } else if (m.type === "changed" || m.type === "resume") {
      refreshInstalled(true).then(() => {
        if (m.type === "resume" && S.waitPerm && S.info && S.info.canInstall) { const id = S.waitPerm; S.waitPerm = ""; install(id); }
        if (m.type === "resume" && Date.now() - S.loaded > 5 * 60e3) load();
      });
    } else if (m.type === "permission") {
      S.waitPerm = m.id;
      toast("Turn on “Allow from this source” for Foundry, then come back. The install carries on by itself.");
    }
  }

  async function refreshInstalled(withInfo) {
    if (!inApp) return;
    const [inst, info] = await Promise.all([call("installed", { ids: S.apps.map((a) => a.id) }), withInfo || !S.info ? call("hello") : S.info]);
    if (inst) { S.installed = inst; for (const [id, v] of Object.entries(inst)) if (v && v.working && !S.prog[id]) S.prog[id] = { phase: "install", pct: 100 }; }
    if (info) S.info = info;
    paintActions(); paintCounts();
    if (route().v === "updates" || route().v === "installed") render();
  }

  // ---- what each app's button says ----
  const have = (a) => { const i = S.installed[a.id]; return i && i.versionCode >= 0 ? i : null; };
  const needsUpdate = (a) => { const i = have(a); return !!(i && a.available && a.versionCode > i.versionCode); };
  const ANDROID = { 21: "5.0", 22: "5.1", 23: "6", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1", 28: "9", 29: "10", 30: "11", 31: "12", 32: "12L", 33: "13", 34: "14", 35: "15", 36: "16" };
  const andro = (sdk) => "Android " + (ANDROID[sdk] || "API " + sdk) + "+";

  function state(a) {
    if (!a.available) return { k: "soon" };
    if (!inApp) return { k: "web" };
    const p = S.prog[a.id]; if (p) return { k: "busy", p };
    if (S.info && a.minSdk && S.info.sdk < a.minSdk) return { k: "old" };
    const i = have(a);
    if (!i) return { k: "install" };
    if (a.versionCode > i.versionCode) return { k: "update" };
    return { k: "open" };
  }
  const PHASE = { download: "Downloading", verify: "Checking the signature", install: "Installing", confirm: "Waiting for you to confirm" };

  function actions(a, big) {
    const s = state(a), id = esc(a.id), sm = big ? "" : " sm";
    switch (s.k) {
      case "soon": return `<span class="pill">Coming soon</span>`;
      case "old": return `<span class="pill">Needs ${esc(andro(a.minSdk))}</span>`;
      case "web": return android
        ? `<a class="btn pri${sm}" href="/store.apk" data-get="${id}">${a.id === SELF ? "Download" : "Get"}</a>` + (big && a.id !== SELF ? ` <a class="btn${sm}" href="${esc(a.apk)}" download>APK only</a>` : "")
        : `<span class="pill">Android app</span>`;
      case "busy": {
        const pct = s.p.phase === "download" ? s.p.pct : 100, ind = s.p.phase !== "download";
        return `<div class="prog${ind ? " ind" : ""}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(PHASE[s.p.phase] || "Working")}"><i style="width:${pct}%"></i></div><small class="phase">${esc(PHASE[s.p.phase] || "Working")}${s.p.phase === "download" ? " · " + pct + "%" : "…"}</small>`;
      }
      case "install": return `<button class="btn pri${sm}" data-do="install" data-id="${id}">Install</button>`;
      case "update": return `<button class="btn pri${sm}" data-do="install" data-id="${id}">Update</button>` + (big && a.id !== SELF ? ` <button class="btn${sm}" data-do="uninstall" data-id="${id}">Uninstall</button>` : "");
      case "open": return a.id === SELF ? `<span class="pill ok">Installed · up to date</span>`
        : `<button class="btn pri${sm}" data-do="open" data-id="${id}">Open</button>` + (big ? ` <button class="btn${sm}" data-do="uninstall" data-id="${id}">Uninstall</button>` : "");
    }
    return "";
  }

  function paintActions() {
    for (const el of document.querySelectorAll("[data-act]")) { const a = S.apps.find((x) => x.id === el.dataset.act); if (a) el.innerHTML = actions(a, el.classList.contains("big")); }
    paintCounts();
  }
  function paintCounts() {
    const n = S.apps.filter(needsUpdate).length, c = $("#ucount"); c.hidden = !n; c.textContent = n;
    const store = S.apps.find((a) => a.id === SELF), up = $("#selfup");
    const show = inApp && store && needsUpdate(store) && route().v !== "app";
    up.hidden = !show;
    if (show) up.innerHTML = `<img src="${esc(store.icon)}" alt="" width="28" height="28"><span>A new version of Foundry is ready: <b>${esc(store.versionName)}</b></span><span data-act="${SELF}">${actions(store)}</span>`;
  }

  // ---- views ----
  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const day = (t) => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
  const icon = (a, size) => `<img class="ico" src="${esc(a.icon || "assets/icons/v2/store-192.png")}" alt="" width="${size}" height="${size}" loading="lazy">`;
  const meta = (a) => [a.category, a.available ? a.versionName && "v" + a.versionName : "", a.available && a.size ? mb(a.size) : ""].filter(Boolean).map(esc).join(" · ");

  function row(a) {
    return `<li class="row"><a class="rlink" href="#app/${esc(a.id)}">${icon(a, 56)}<span class="rt"><b>${esc(a.name)}</b><small>${esc(a.tagline || "")}</small><small class="m">${meta(a)}</small></span></a><span class="ract" data-act="${esc(a.id)}">${actions(a)}</span></li>`;
  }

  function home() {
    const q = S.q.trim().toLowerCase();
    const shown = S.apps.filter((a) => (!S.cat || a.category === S.cat) && (!q || (a.name + " " + a.tagline + " " + a.category + " " + (a.description || "")).toLowerCase().includes(q)));
    const cats = [...new Set(S.apps.map((a) => a.category).filter(Boolean))];
    const feat = !q && !S.cat && (S.apps.find((a) => a.available && a.id !== SELF) || S.apps[0]);
    let h = "";
    if (!inApp) h += getStore();
    if (feat) h += `<section class="hero" style="--ac:${esc(feat.accent || "#f0b24a")}"><div class="hglow"></div>${icon(feat, 96)}<div class="ht"><small class="kick">Featured</small><h1>${esc(feat.name)}</h1><p>${esc(feat.tagline || "")}</p><div class="hact"><span data-act="${esc(feat.id)}" class="big">${actions(feat, true)}</span><a class="btn" href="#app/${esc(feat.id)}">Details</a></div></div></section>`;
    if (cats.length > 1) h += `<nav class="chips" aria-label="Categories"><button data-cat="" class="${S.cat ? "" : "on"}">All</button>${cats.map((c) => `<button data-cat="${esc(c)}" class="${S.cat === c ? "on" : ""}">${esc(c)}</button>`).join("")}</nav>`;
    h += `<section class="shelf"><h2>${q ? "Results for “" + esc(S.q.trim()) + "”" : S.cat ? esc(S.cat) : "All apps"} <small>${shown.length} app${shown.length === 1 ? "" : "s"}</small></h2>`;
    h += shown.length ? `<ul class="list">${shown.map(row).join("")}</ul>` : `<p class="empty">Nothing on the shelf matches that.</p>`;
    return h + `</section>`;
  }

  function getStore() {
    const store = S.apps.find((a) => a.id === SELF);
    const v = store && store.available ? `Version ${esc(store.versionName)} · ${mb(store.size)}` : "";
    if (!android) return `<section class="getit"><div><h2>Get Foundry on your Android phone</h2><p>Open <b>mentifaber.org/store</b> on the phone, download Foundry, and every app here installs and updates from it.</p></div><div class="qr" aria-hidden="true">${icon(store || {}, 72)}</div></section>`;
    return `<section class="getit"><div><h2>Install Foundry</h2><ol><li>Download Foundry${v ? ` <small>(${v})</small>` : ""}.</li><li>Open the file. If Android asks, allow your browser to install apps.</li><li>Open Foundry: everything here installs in a tap, and updates arrive on their own.</li></ol></div><a class="btn pri" href="/store.apk">Download Foundry</a></section>`;
  }

  function detail(id) {
    const a = S.apps.find((x) => x.id === id);
    if (!a) return `<p class="empty">That app isn't on the shelf. <a href="#">Back to Foundry</a></p>`;
    const i = have(a), paras = String(a.description || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
    const stats = [
      a.available && ["Version", esc(a.versionName)], i && ["On this phone", esc(i.versionName || "")],
      a.available && ["Size", mb(a.size)], a.minSdk && ["Needs", esc(andro(a.minSdk))], a.built && ["Updated", esc(day(a.built))], ["Category", esc(a.category || "App")],
    ].filter(Boolean);
    let h = `<a class="back" href="#">← All apps</a><section class="dhead" style="--ac:${esc(a.accent || "#f0b24a")}">${icon(a, 104)}<div><h1>${esc(a.name)}</h1><p class="dev">Mentifaber</p><p class="tag">${esc(a.tagline || "")}</p></div></section>`;
    h += `<div class="dact big" data-act="${esc(a.id)}">${actions(a, true)}</div>`;
    if (!inApp && android && a.available && a.id !== SELF) h += `<p class="hint">Get installs Foundry first; from then on ${esc(a.name)} installs and updates from it. APK only downloads this app alone, and you'd update it by hand.</p>`;
    h += `<dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
    if (a.shots && a.shots.length) h += `<div class="shots">${a.shots.map((s) => `<img src="${esc(s)}" alt="${esc(a.name)} screenshot" loading="lazy">`).join("")}</div>`;
    h += `<section class="block"><h2>About this app</h2>${paras}${a.features && a.features.length ? `<ul class="feats">${a.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</section>`;
    if (a.changes && a.changes.length) h += `<section class="block"><h2>What's new</h2><p class="m">${esc(a.versionName ? "Version " + a.versionName : "")}${a.built ? " · " + esc(day(a.built)) : ""}</p><ul class="changes">${a.changes.slice(0, 6).map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>`;
    if (a.available) h += `<section class="block safe"><h2>Safety</h2><p>Signed by Mentifaber. Before it installs, Foundry checks that the download's SHA-256 matches the catalog, that it is ${esc(a.name)} and not some other app, and that it carries Mentifaber's signature.</p><p class="m mono">SHA-256 ${esc(a.sha256)}</p>${a.cert ? `<p class="m mono">Signer ${esc(a.cert)}</p>` : ""}</section>`;
    const perms = (a.permissions || []).map(perm).filter(Boolean);
    if (perms.length) h += `<section class="block"><h2>What it can do</h2><ul class="perms">${[...new Set(perms)].map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>`;
    const links = [a.web && `<a class="btn sm" href="${esc(a.web)}">Use it on the web</a>`, a.page && a.page !== "/store" && `<a class="btn sm" href="${esc(a.page)}">About ${esc(a.name)}</a>`].filter(Boolean);
    if (links.length) h += `<p class="links">${links.join(" ")}</p>`;
    return h;
  }

  const PERMS = { INTERNET: "Use the internet", ACCESS_NETWORK_STATE: "See whether you're online", POST_NOTIFICATIONS: "Send notifications", REQUEST_INSTALL_PACKAGES: "Install apps (with your permission)", REQUEST_DELETE_PACKAGES: "Ask to remove apps", UPDATE_PACKAGES_WITHOUT_USER_ACTION: "Update the apps it installed without asking each time", QUERY_ALL_PACKAGES: "See which apps are installed", RECORD_AUDIO: "Use the microphone", CAMERA: "Use the camera", RECEIVE_BOOT_COMPLETED: "Start when the phone starts", WAKE_LOCK: "Keep the phone awake while working", FOREGROUND_SERVICE: "Keep working in the background", VIBRATE: "Vibrate", ACCESS_FINE_LOCATION: "Use your precise location", ACCESS_COARSE_LOCATION: "Use your approximate location" };
  function perm(p) {
    if (/DYNAMIC_RECEIVER|^com\.google\.android\.c2dm|BIND_GET_INSTALL_REFERRER/.test(p)) return "";
    const k = p.split(".").pop(); return PERMS[k] || k.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  function updates() {
    if (!inApp) return `<p class="empty">Updates arrive through the Foundry app on Android. <a href="#about">How it works</a></p>`;
    const due = S.apps.filter(needsUpdate), others = S.apps.filter((a) => have(a) && !needsUpdate(a));
    let h = `<section class="shelf"><h2>Updates <small>${due.length ? due.length + " ready" : "all up to date"}</small>${due.length > 1 ? ` <button class="btn pri sm" data-do="all">Update all</button>` : ""}</h2>`;
    h += due.length ? `<ul class="list">${due.map(row).join("")}</ul>` : `<p class="empty">Every installed Mentifaber app is on its latest version.</p>`;
    h += `</section>` + settings();
    if (others.length) h += `<section class="shelf"><h2>Up to date</h2><ul class="list">${others.map(row).join("")}</ul></section>`;
    return h;
  }

  function settings() {
    const i = S.info || {};
    return `<section class="block settings"><h2>Updates on this phone</h2>
      <label class="sw"><input type="checkbox" id="auto" ${i.auto ? "checked" : ""}><span><b>Install updates by themselves</b><small>${i.silent ? "Twice a day Foundry installs new versions of the apps it installed, without asking each time." : "Android " + esc(i.sdk ? ANDROID[i.sdk] || i.sdk : "") + " asks before each install, so Foundry will notify you when updates are ready instead."}</small></span></label>
      <div class="setrow"><span><b>Installs from Foundry</b><small>${i.canInstall ? "Allowed" : "Not allowed yet: Android asks once."}</small></span>${i.canInstall ? "" : `<button class="btn sm" data-do="permission">Allow</button>`}</div>
      <div class="setrow"><span><b>Update notifications</b><small>${i.notify ? "On" : "Off"}</small></span><button class="btn sm" data-do="notifications">${i.notify ? "Settings" : "Turn on"}</button></div>
      <p class="m">Foundry ${esc(i.version || "")}</p></section>`;
  }

  function installed() {
    const mine = S.apps.filter((a) => have(a));
    return `<section class="shelf"><h2>Installed <small>${mine.length} app${mine.length === 1 ? "" : "s"}</small></h2>${mine.length ? `<ul class="list">${mine.map(row).join("")}</ul>` : `<p class="empty">No Mentifaber apps on this phone yet. <a href="#">Find one</a></p>`}</section>`;
  }

  function about() {
    return `<section class="block prose"><h1>How Foundry works</h1>
      <p>Foundry is the home of Mentifaber's Android apps: one place to install them, open them, and keep them current.</p>
      <h2>Install</h2><p>Download Foundry on your phone and open it${android ? "" : " (open mentifaber.org/store on the phone)"}. Android asks once whether Foundry may install apps: say yes. From then on every app here installs in a tap.</p>
      <h2>Updates</h2><p>When Mentifaber ships a new version, it's built, signed and put on the shelf automatically, and Foundry sees it within minutes. Open <b>Updates</b> to install it, or let Foundry do it: twice a day it checks, and on Android 12 and later it installs updates to the apps it installed without asking each time. On older Android, it sends a notification and you tap to update. Foundry updates itself the same way.</p>
      <h2>Safety</h2><p>Every app is signed with Mentifaber's key. Before installing anything, Foundry checks the download's SHA-256 against the catalog, that the package is the app it claims to be, and that it's signed with the same key as Foundry itself. Android then refuses any update signed with a different key. Foundry never takes a download address from a web page: it installs only from the catalog it fetched itself.</p>
      <h2>Already have an app?</h2><p>If you installed an app from its APK before, Foundry updates it too. The first update may ask you to confirm, because Android remembers which app installed it; after that it's Foundry's.</p>
      ${inApp ? "" : `<p>${android ? `<a class="btn pri" href="/store.apk">Download Foundry</a>` : ""}</p>`}</section>`;
  }

  // ---- routing and events ----
  const route = () => { const h = location.hash.replace(/^#/, ""); if (h.startsWith("app/")) return { v: "app", id: decodeURIComponent(h.slice(4)) }; return { v: ["updates", "installed", "about"].includes(h) ? h : "home" }; };

  function render() {
    const r = route(), m = $("#main");
    for (const t of document.querySelectorAll("#tabs a")) t.classList.toggle("on", t.dataset.v === r.v);
    if (S.err && !S.apps.length) { m.innerHTML = `<div class="empty"><p>${esc(S.err)}</p><button class="btn pri" data-do="reload">Try again</button></div>`; return; }
    if (!S.loaded) return;
    m.innerHTML = r.v === "app" ? detail(r.id) : r.v === "updates" ? updates() : r.v === "installed" ? installed() : r.v === "about" ? about() : home();
    paintCounts();
    const a = r.v === "app" && S.apps.find((x) => x.id === r.id);
    document.title = a ? a.name + " · Foundry" : "Foundry";
  }

  async function install(id) {
    if (!inApp) return;
    S.prog[id] = { phase: "download", pct: 0 }; paintActions();
    const ok = await call("install", { id });
    if (ok === false && !S.waitPerm) S.waitPerm = id;
    if (ok !== true) { delete S.prog[id]; paintActions(); }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-do],[data-cat]");
    if (!b) return;
    if (b.dataset.cat !== undefined) { S.cat = b.dataset.cat; render(); return; }
    const id = b.dataset.id, d = b.dataset.do;
    if (d === "install") install(id);
    else if (d === "all") { const due = S.apps.filter(needsUpdate).sort((x, y) => (x.id === SELF) - (y.id === SELF)); due.forEach((a) => install(a.id)); }
    else if (d === "open" || d === "uninstall") call(d, { id });
    else if (d === "permission" || d === "notifications") call(d);
    else if (d === "reload") load();
  });
  document.addEventListener("change", async (e) => { if (e.target.id === "auto") { const i = await call("auto", { on: e.target.checked }); if (i) S.info = i; render(); } });
  $("#find").addEventListener("submit", (e) => { e.preventDefault(); $("#q").blur(); });
  $("#q").addEventListener("input", (e) => { S.q = e.target.value; if (route().v !== "home") location.hash = ""; else render(); });
  addEventListener("hashchange", () => { render(); scrollTo(0, 0); });

  let tt;
  function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 5200); }

  async function load() {
    try {
      const r = await fetch("/store/catalog.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      S.apps = (j.apps || []).filter((a) => a && a.id && a.name);
      S.err = ""; S.loaded = Date.now();
    } catch {
      S.err = "Foundry couldn't reach its catalog. Check the connection and try again.";
    }
    render();
    if (inApp) await refreshInstalled(true);
  }
  load();
})();
