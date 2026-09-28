/* Mentifaber app versions: a small version pill, and a "what's new" card the
 * first time someone opens an app after it was updated.
 * Usage: <script src="assets/js/mf-version.js" data-app="ballast" defer></script>
 * Optional: data-pos="bl|br|tl|tr" (default bl), data-pill="off" to hide the pill.
 * Versions and notes come from assets/versions.json (tools/versions.py builds it
 * from git history). Exposes window.MF_VERSION once loaded. */
(function () {
  "use strict";
  var me = document.currentScript;
  if (!me) return;
  var key = me.getAttribute("data-app"), pos = me.getAttribute("data-pos") || "bl", pill = me.getAttribute("data-pill") !== "off";
  var url = new URL("../versions.json", me.src).href;
  var SEEN = "mf-version-" + key;
  function store(v) { try { v == null ? localStorage.removeItem(SEEN) : localStorage.setItem(SEEN, v); } catch (e) {} }
  function seen() { try { return localStorage.getItem(SEEN); } catch (e) { return null; } }
  function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  function fmtDate(d) { try { return new Date(d + "T12:00:00").toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }); } catch (e) { return d; } }

  var css = "" +
    ".mfv-pill{position:fixed;z-index:2147483000;font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;" +
    "padding:6px 9px;border-radius:999px;background:rgba(12,10,16,.62);color:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.16);" +
    "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;opacity:.72;transition:opacity .2s}" +
    ".mfv-pill:hover{opacity:1}.mfv-pill i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#ff8fc0;margin-left:6px;vertical-align:1px}" +
    ".mfv-card{position:fixed;z-index:2147483001;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-130%);" +
    "width:min(92vw,380px);background:rgba(18,15,24,.94);color:#f4efe6;border:1px solid rgba(255,255,255,.14);border-radius:18px;" +
    "padding:16px 16px 12px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;" +
    "backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:transform .5s cubic-bezier(.2,1.3,.4,1)}" +
    ".mfv-card.show{transform:translate(-50%,0)}" +
    ".mfv-card h4{margin:0 0 2px;font-size:15px;font-weight:700}.mfv-card small{display:block;color:rgba(244,239,230,.6);font-size:11.5px;margin-bottom:8px}" +
    ".mfv-card ul{margin:0 0 10px;padding-left:18px}.mfv-card li{margin:3px 0;color:rgba(244,239,230,.88)}" +
    ".mfv-card button{font:700 12px system-ui,sans-serif;padding:8px 14px;border-radius:999px;border:0;background:#f4efe6;color:#15121c;cursor:pointer;float:right}";
  function injectCSS() { var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }

  function card(v, updated) {
    var old = document.querySelector(".mfv-card"); if (old) old.remove();
    var c = document.createElement("div"); c.className = "mfv-card"; c.setAttribute("role", "status");
    c.innerHTML = "<h4>" + (updated ? "Updated to v" : v.name + " · v") + esc(v.version) + "</h4><small>" + (updated ? v.name + " · " : "") + "released " + esc(fmtDate(v.date)) + "</small>" +
      (v.notes && v.notes.length ? "<ul>" + v.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") + "<button type=\"button\">Got it</button><div style=\"clear:both\"></div>";
    document.body.appendChild(c);
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add("show"); }); });
    var close = function () { c.classList.remove("show"); setTimeout(function () { c.remove(); }, 500); store(v.version); var dot = document.querySelector(".mfv-pill i"); if (dot) dot.remove(); };
    c.querySelector("button").addEventListener("click", close);
    if (!updated) setTimeout(close, 9000);
  }

  function start(v) {
    window.MF_VERSION = v;
    injectCSS();
    var prev = seen(), updated = prev && prev !== v.version;
    if (pill) {
      var p = document.createElement("button"); p.type = "button"; p.className = "mfv-pill";
      p.setAttribute("aria-label", v.name + " version " + v.version + " — what's new");
      var side = pos.indexOf("r") >= 0 ? "right" : "left", edge = pos.indexOf("t") === 0 ? "top" : "bottom";
      p.style[side] = "calc(env(safe-area-inset-" + side + ",0px) + 10px)"; p.style[edge] = "calc(env(safe-area-inset-" + edge + ",0px) + 10px)";
      p.innerHTML = "v" + esc(v.version) + (updated ? "<i></i>" : "");
      p.addEventListener("click", function () { card(v, false); });
      document.body.appendChild(p);
    }
    if (!prev) store(v.version);
    else if (updated) setTimeout(function () { card(v, true); }, 1200);
  }

  fetch(url, { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (all) {
    var v = all[key]; if (!v) return;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { start(v); }); else start(v);
  }).catch(function () {});
  window.MFVersionCard = function () { if (window.MF_VERSION) card(window.MF_VERSION, false); };
})();
