// The Nest Registry on mentifaber.org: the page was made as a Claude artifact and asks window.claude for its database, who
// is looking, photo storage and file saving. This answers those same calls from the site's own backend (/api/nest, see
// src/nest.js), so the page itself barely changes. Changes appear for everyone within a few seconds (it polls, cheaply:
// the server says "nothing new" until something is: every 30 seconds while the page is on screen, never while it's hidden,
// and slower still if the server can't be reached, so the site stays within its free plan's daily requests). Before
// anything loads, a guest joins with the invite link and a name.
(() => {
  "use strict";
  const API = "/api/nest";
  let state = null, ver = "", resolveReady; const ready = new Promise((r) => (resolveReady = r));
  const listeners = [];
  const fail = (code, msg) => Object.assign(new Error(msg), { code });
  async function call(path, opt = {}) {
    const r = await fetch(API + path, { credentials: "same-origin", ...opt, headers: { "content-type": "application/json", ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail({ 401: "unauthenticated", 403: "invalid_argument", 413: "quota_exceeded", 429: "resource_exhausted" }[r.status] || "unavailable", j.error || "the server said " + r.status);
    return j;
  }
  const copy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const docsOf = (col) => Object.keys(state.docs).filter((p) => p.startsWith(col + "/")).sort().map((p) => ({ id: p.slice(col.length + 1), data: () => copy(state.docs[p]) }));
  const snap = (l) => (l.col ? { docs: docsOf(l.key), metadata: { fromCache: false } } : { exists: l.key in state.docs, data: () => copy(state.docs[l.key]), metadata: { fromCache: false } });
  const sig = (l) => (l.col ? JSON.stringify(docsOf(l.key).map((d) => [d.id, state.docs[l.key + "/" + d.id]])) : JSON.stringify(state.docs[l.key] ?? null));
  function fire() { for (const l of listeners) { const s = sig(l); if (s !== l.last) { l.last = s; try { l.cb(snap(l)); } catch (e) { console.warn(e); } } } }
  async function pull() { const j = await call("/state?v=" + encodeURIComponent(ver)); if (j.same) return; state = j; ver = j.v; fire(); dispatchEvent(new Event("nest:state")); }
  const EVERY = +window.NEST_POLL_MS || 30e3; let timer = 0, failing = 0; // (tests shorten it)
  async function poll() {
    clearTimeout(timer); if (document.hidden) return; // a hidden page asks nothing; it catches up when it's back on screen
    try { await pull(); if (failing) { failing = 0; down(false); } } catch (e) { if (!failing++) { down(true); for (const l of listeners) if (l.err) try { l.err(e); } catch (x) {} } }
    timer = setTimeout(poll, failing ? Math.min(5 * 60e3, EVERY * 2 ** Math.min(failing, 4)) : EVERY);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state) poll(); });
  // when the server can't be reached: one calm line at the top, and slower retries, instead of errors on every tap
  function down(on) {
    let b = document.getElementById("nest-down");
    if (!on) { if (b) b.remove(); return; }
    if (b) return; b = document.createElement("div"); b.id = "nest-down"; b.setAttribute("role", "status");
    b.setAttribute("style", "position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top,0px));translate:-50% 0;z-index:90;max-width:calc(100vw - 24px);padding:10px 14px;border-radius:12px;background:var(--rose-soft,#fde4ec);color:var(--ink,#1d2d55);font:14px/1.4 var(--f-body,system-ui);box-shadow:0 6px 24px rgb(0 0 0 / .18)");
    b.textContent = "The registry can't be reached right now. It keeps trying by itself; nothing you've saved is lost."; document.body.append(b);
  }
  const listen = (col, key, cb, err) => { const l = { col, key, cb, err, last: null }; listeners.push(l); if (state) { l.last = sig(l); cb(snap(l)); } return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; };
  const write = async (path, data) => { await call("/doc", { method: "POST", body: JSON.stringify({ path, data }) }); await pull().catch(() => {}); };

  const db = {
    collection: (name) => ({ onSnapshot: (cb, err) => listen(true, name, cb, err), async get() { await pull(); return snap({ col: true, key: name }); } }),
    doc: (path) => ({
      onSnapshot: (cb, err) => listen(false, path, cb, err),
      set: (data) => write(path, data),
      delete: () => write(path, null),
      acquire: (o) => call("/lock", { method: "POST", body: JSON.stringify({ path, ttlMs: o && o.ttlMs }) }),
    }),
  };
  const HUES = [24, 200, 280, 140, 340, 46, 180, 310];
  const avatar = (name) => { const n = String(name || "?").trim(), ch = (n[0] || "?").toUpperCase(), hue = HUES[[...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
    return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="hsl(${hue} 55% 48%)"/><text x="20" y="26.5" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff">${ch.replace(/[<&>"]/g, "")}</text></svg>`); };
  const prof = (id) => { const p = state.profiles[id]; return p ? { id, name: p.name, avatarUrl: avatar(p.name) } : null; };
  const user = {
    me: async () => ({ id: state.me.id, name: state.me.name, avatarUrl: avatar(state.me.name) }),
    isOwner: async () => !!state.me.owner,
    can: async () => true,
    profiles: async (ids) => Object.fromEntries(ids.map((id) => [id, prof(id)]).filter((x) => x[1])),
  };
  const assets = {
    async upload(blob) {
      const r = await fetch(API + "/blob", { method: "POST", credentials: "same-origin", headers: { "content-type": blob.type || "image/jpeg" }, body: blob });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw fail("unavailable", j.error || "upload failed"); return { id: j.id };
    },
  };
  const downloads = {
    async save({ filename, data }) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv" : "application/octet-stream" })); a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); },
  };
  const parts = { db, user, assets, downloads };
  window.claude = { use: async (name) => { await ready; if (!parts[name]) throw fail("unavailable", "no " + name); return parts[name]; } };

  // the invite link, for the parents' Sharing panel
  window.nestSite = {
    link: () => (state && state.invite ? location.origin + "/nest?k=" + state.invite : ""),
    parentLink: () => (state && state.pinvite ? location.origin + "/nest?k=" + state.pinvite : ""),
    owner: () => !!(state && state.me.owner),
    find: async (item, look) => { const r = await call("/find", { method: "POST", body: JSON.stringify({ item, look }) }); await pull(); return r; },
    findAll: async () => { const r = await call("/findall", { method: "POST", body: "{}" }); await pull(); return r; },
    finds: () => (state && state.finds) || {},
    queued: () => (state && state.findq) || [],
    paused: () => (state && state.findpause) || null,
    lastBackup: () => (state && state.backup) || "",
    exportUrl: () => API + "/export",
    grab: (url) => call("/grab", { method: "POST", body: JSON.stringify({ url }) }),
    async newLink(which) { await call("/invite", { method: "POST", body: JSON.stringify({ which: which || "guest" }) }); ver = ""; await pull(); return which === "parent" ? window.nestSite.parentLink() : window.nestSite.link(); },
  };

  // ── the way in: the invite link and a name ──
  function gate(kind, key) {
    const css = "position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:rgb(13 17 34 / .72);backdrop-filter:blur(4px)";
    const box = document.createElement("div"); box.setAttribute("style", css); box.id = "nest-gate";
    const card = document.createElement("form"); card.setAttribute("style", "background:var(--surface,#fff);color:var(--ink,#1d2742);border-radius:18px;padding:24px;width:min(420px,100%);display:grid;gap:12px;box-shadow:0 24px 80px rgb(0 0 0 / .35);font:15px/1.5 var(--f-body,system-ui)");
    const h = document.createElement("h2"); h.setAttribute("style", "margin:0;font:600 24px/1.15 var(--f-display,system-ui)");
    const p = document.createElement("p"); p.setAttribute("style", "margin:0;color:var(--ink-soft,#56617d)");
    card.append(h, p); box.append(card);
    if (kind === "private") { h.textContent = "This registry is private"; p.textContent = "Open the invite link the parents sent you. It lets you in on this device."; document.body.append(box); return; }
    h.textContent = kind === "owner" ? "Your name on the registry" : "Welcome! Who's visiting?"; p.textContent = kind === "owner" ? "Guests see this beside the things you add and in thank-you lists." : "Your name lets the parents see who's giving what. You'll stay signed in on this device.";
    const inp = document.createElement("input"); inp.className = "input"; inp.maxLength = 60; inp.required = true; inp.autocomplete = "name"; inp.placeholder = kind === "owner" ? "e.g. Anders" : "e.g. Aunt Maria";
    try { inp.value = localStorage.getItem("nest.from") || ""; } catch (e) {}
    const msg = document.createElement("small"); msg.setAttribute("style", "color:var(--rose,#c2475b);min-height:1em");
    const go = document.createElement("button"); go.className = "btn primary"; go.type = "submit"; go.textContent = kind === "owner" ? "Save" : "Open the registry";
    card.append(inp, msg, go);
    card.onsubmit = async (e) => {
      e.preventDefault(); const name = inp.value.trim(); if (!name) return inp.focus(); go.disabled = true; msg.textContent = "";
      try { await call("/join", { method: "POST", body: JSON.stringify({ key, name }) }); try { localStorage.setItem("nest.from", name); } catch (x) {}
        if (key) { const u = new URL(location.href); u.searchParams.delete("k"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
        box.remove(); await start(); }
      catch (x) { msg.textContent = x.message; go.disabled = false; }
    };
    document.body.append(box); setTimeout(() => inp.focus(), 30);
  }
  async function start() {
    const key = new URL(location.href).searchParams.get("k") || "";
    try { await pull(); }
    catch (e) { if (e.code === "unauthenticated") return gate(key ? "guest" : "private", key); failing++; down(true); setTimeout(start, Math.min(5 * 60e3, 15e3 * 2 ** Math.min(failing - 1, 4))); return; }
    if (failing) { failing = 0; down(false); }
    if (key) { // already in on this device: the co-parent link still makes them a co-parent
      if (!state.me.parent) { const up = await call("/upgrade", { method: "POST", body: JSON.stringify({ key }) }).catch(() => null); if (up && up.parent) { ver = ""; await pull().catch(() => {}); } }
      const u = new URL(location.href); u.searchParams.delete("k"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
    if (!state.me.name) return gate("owner", "");
    resolveReady(); timer = setTimeout(poll, EVERY);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
