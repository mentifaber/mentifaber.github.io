/* Sealed pages: the page ships a lock screen plus an AES-256-GCM ciphertext
   of the real content (see tools/seal.mjs). The key is derived from the
   username and password with PBKDF2-SHA256, so nothing readable exists
   without them. A correct login remembers this device's key until
   MFSeal.forget(storeKey) is called.

   On mentifaber.org the Worker (src/worker.js) also checks logins: without a
   session it sends the page with an empty ciphertext, so the login first goes
   to /api/login (o.app names the page), then the ciphertext is fetched and
   opened here as before. Where the ciphertext is already in the page (the
   GitHub Pages copy), it is opened directly. */
(function () {
  "use strict";
  var ITER = 600000;
  var subtle = window.crypto && window.crypto.subtle;
  var supported = !!(subtle && window.DecompressionStream && window.TextEncoder);

  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function hex(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? "0" : "") + a[i].toString(16); return s; }

  // Proof of the login for the server: PBKDF2 over the same user\0pass with a per-app salt.
  function proof(app, secret) {
    return Promise.all([
      subtle.digest("SHA-256", new TextEncoder().encode("mentifaber-login:" + app)),
      subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]),
    ]).then(function (r) {
      return subtle.deriveBits({ name: "PBKDF2", salt: r[0], iterations: ITER, hash: "SHA-256" }, r[1], 256);
    }).then(hex);
  }
  function blobOf(html) {
    var m = html.match(/<script type="application\/octet-stream" id="mf-blob">([^<]*)<\/script>/);
    return m ? m[1].replace(/\s+/g, "") : "";
  }

  function MFSeal(o) {
    var blobEl = document.getElementById(o.blobId || "mf-blob");
    var salt, iv, ct;
    function parse(text) {
      var raw = unb64(text.replace(/\s+/g, ""));
      salt = raw.subarray(0, 16); iv = raw.subarray(16, 28); ct = raw.subarray(28);
    }
    var sealed = !!blobEl.textContent.trim();
    if (sealed) parse(blobEl.textContent);
    var idle = o.btn.textContent;

    function reveal(key) {
      return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function (pt) {
        return new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      }).then(function (html) {
        if (o.onOpen) o.onOpen();
        document.open(); document.write(html); document.close();
      });
    }
    function deny(msg) {
      o.err.textContent = msg; o.btn.disabled = false; o.btn.textContent = idle;
      if (o.card) { o.card.classList.remove(o.shake || "shake"); void o.card.offsetWidth; o.card.classList.add(o.shake || "shake"); }
    }
    // Server check: prove the login, then fetch the page again with the new session.
    function unlockFromServer(secret) {
      return proof(o.app, secret).then(function (p) {
        return fetch("/api/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: o.app, proof: p }) });
      }).then(function (r) {
        if (r.status === 429) throw { msg: "Too many tries. Wait a few minutes and try again." };
        if (r.status === 401) throw { wrong: true };
        if (!r.ok) throw { msg: "Couldn't reach the server. Check your connection and try again." };
        return fetch(location.pathname, { credentials: "same-origin", cache: "no-store" });
      }).then(function (r) { return r.text(); }).then(function (html) {
        var b = blobOf(html);
        if (!b) throw { msg: "Signed in, but the page didn't load. Reload and try again." };
        blobEl.textContent = b; parse(b); sealed = true;
      });
    }
    function attempt() {
      if (!supported) { deny("This browser can't open this page — use a current Chrome, Safari or Firefox."); return; }
      if (!o.user.value.trim() || !o.pass.value) { deny(o.emptyText || "Both fields are needed."); return; }
      o.btn.disabled = true; o.btn.textContent = o.busyText || "Checking…"; o.err.textContent = "";
      var secret = o.user.value.trim() + "\u0000" + o.pass.value;
      (sealed ? Promise.resolve() : unlockFromServer(secret)).then(function () {
        return subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
      }).then(function (base) {
        return subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
      }).then(function (key) {
        return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function () { return subtle.exportKey("raw", key); })
          .then(function (k) { store(o.storeKey, b64(k)); return reveal(key); });
      }).catch(function (e) {
        o.pass.value = "";
        deny(e && e.msg ? e.msg : o.denyText || "That's not right — try again.");
      });
    }
    o.btn.addEventListener("click", attempt);
    o.pass.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    o.user.addEventListener("keydown", function (e) { if (e.key === "Enter") o.pass.focus(); });

    // A remembered key only opens this exact ciphertext; a reseal retires it.
    var saved = recall(o.storeKey);
    if (saved && supported && sealed) {
      subtle.importKey("raw", unb64(saved), { name: "AES-GCM" }, false, ["decrypt"])
        .then(reveal).catch(function () { store(o.storeKey, null); });
    }
  }
  // Forget this device's key; with an app name, also end the server session.
  MFSeal.forget = function (k, app) {
    store(k, null);
    if (app) try { fetch("/api/logout/" + app, { method: "POST", credentials: "same-origin", keepalive: true }); } catch (e) {}
  };
  window.MFSeal = MFSeal;
})();
