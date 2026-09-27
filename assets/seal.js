/* Sealed pages: the page ships a lock screen plus an AES-256-GCM ciphertext
   of the real content (see tools/seal.mjs). The key is derived from the
   username and password with PBKDF2-SHA256, so nothing readable exists
   without them. A correct login remembers this device's key until
   MFSeal.forget(storeKey) is called. */
(function () {
  "use strict";
  var ITER = 600000;
  var subtle = window.crypto && window.crypto.subtle;
  var supported = !!(subtle && window.DecompressionStream && window.TextEncoder);

  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function MFSeal(o) {
    var raw = unb64(document.getElementById(o.blobId || "mf-blob").textContent.replace(/\s+/g, ""));
    var salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), ct = raw.subarray(28);
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
    function attempt() {
      if (!supported) { deny("This browser can't open this page — use a current Chrome, Safari or Firefox."); return; }
      if (!o.user.value.trim() || !o.pass.value) { deny(o.emptyText || "Both fields are needed."); return; }
      o.btn.disabled = true; o.btn.textContent = o.busyText || "Checking…"; o.err.textContent = "";
      subtle.importKey("raw", new TextEncoder().encode(o.user.value.trim() + "\u0000" + o.pass.value), "PBKDF2", false, ["deriveKey"])
        .then(function (base) {
          return subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
        })
        .then(function (key) {
          return subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function () { return subtle.exportKey("raw", key); })
            .then(function (k) { store(o.storeKey, b64(k)); return reveal(key); });
        })
        .catch(function () { o.pass.value = ""; deny(o.denyText || "That's not right — try again."); });
    }
    o.btn.addEventListener("click", attempt);
    o.pass.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
    o.user.addEventListener("keydown", function (e) { if (e.key === "Enter") o.pass.focus(); });

    // A remembered key only opens this exact ciphertext; a reseal retires it.
    var saved = recall(o.storeKey);
    if (saved && supported) {
      subtle.importKey("raw", unb64(saved), { name: "AES-GCM" }, false, ["decrypt"])
        .then(reveal).catch(function () { store(o.storeKey, null); });
    }
  }
  MFSeal.forget = function (k) { store(k, null); };
  window.MFSeal = MFSeal;
})();
