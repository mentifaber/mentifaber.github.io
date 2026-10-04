// Mentifaber "install as an app" pill. Any page with a web manifest can include this:
// Android / desktop Chrome and Edge get the real install prompt, iPhone and iPad get the
// Share → Add to Home Screen steps. Hidden once installed, and for a week after "not now".
(() => {
  const key = "mf-install-" + location.pathname.replace(/\.html$/, "");
  const standalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone;
  if (standalone() || !document.querySelector('link[rel="manifest"]')) return;
  try { if (+localStorage.getItem(key) > Date.now()) return; } catch (e) {}
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let prompt = null, el = null;
  const name = (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || document.title.split(/[·|—-]/)[0].trim();
  function show() {
    if (el) return;
    el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.innerHTML = '<style>#mf-inst{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;' +
      'max-width:calc(100vw - 24px);padding:10px 10px 10px 16px;border-radius:999px;background:rgba(14,10,28,.94);color:#efe9ff;border:1px solid rgba(157,139,255,.45);' +
      'box-shadow:0 10px 40px rgba(0,0,0,.45);font:600 13px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;animation:mfin .35s ease-out}' +
      '#mf-inst b{white-space:nowrap}#mf-inst .go{white-space:nowrap;border:0;border-radius:999px;padding:9px 16px;font:inherit;color:#07040f;background:linear-gradient(90deg,#7dffd8,#9d8bff);cursor:pointer}' +
      '#mf-inst .x{border:0;background:none;color:#9b8fc2;font:inherit;font-size:18px;cursor:pointer;padding:4px 8px}#mf-inst .tip{display:none;font-weight:400;font-size:12px;color:#c9bfe9}' +
      '#mf-inst.ios .tip{display:block}@keyframes mfin{from{opacity:0;transform:translate(-50%,20px)}}</style>' +
      '<div id="mf-inst"><span><b></b><span class="tip">Tap <b>Share</b> then <b>Add to Home Screen</b></span></span><button class="go">Install app</button><button class="x" aria-label="Not now">✕</button></div>';
    document.body.appendChild(el);
    const box = el.querySelector("#mf-inst");
    box.querySelector("b").textContent = name ? "Get " + name + " as an app" : "Install as an app";
    box.querySelector(".go").onclick = async () => {
      if (prompt) { prompt.prompt(); try { await prompt.userChoice; } catch (e) {} prompt = null; hide(); }
      else box.classList.toggle("ios");
    };
    box.querySelector(".x").onclick = () => { try { localStorage.setItem(key, Date.now() + 7 * 864e5); } catch (e) {} hide(); };
    setTimeout(() => { if (el && !box.classList.contains("ios")) hide(); }, 20000);
  }
  function hide() { if (el) { el.remove(); el = null; } }
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); prompt = e; setTimeout(show, 1200); });
  addEventListener("appinstalled", hide);
  if (ios) addEventListener("load", () => setTimeout(show, 1500));
})();
