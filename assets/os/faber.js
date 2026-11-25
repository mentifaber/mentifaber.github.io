/* Faber · the FaberOS app kit. An app on mentifaber.org loads this one small file to talk to FaberOS when it runs in a
   FaberOS window; outside FaberOS every call is a harmless no-op and Faber.inOS is false, so an app behaves as before.

     Faber.inOS                   true inside a FaberOS window
     Faber.notify(title, body)    a notification in FaberOS's notification center
     Faber.open(appId)            ask FaberOS to open another app
     Faber.save(blob, name)       put a file on the Shelf (FaberOS's shared file shelf, kept in this browser)
     Faber.onFiles(fn)            FaberOS hands this app files from the Shelf ("Open with"): fn(File[])
     Faber.verbs({ name: fn })    what this app can do when AutoFaber asks (Faber Verbs). Each verb is declared in the
                                  app's FaberOS manifest (name, what it does, its arguments, whether it changes data);
                                  FaberOS checks the arguments against that and asks you first when a verb changes
                                  anything. fn(args) returns (or resolves to) a short answer: a string or { text }.

   Messages go only to and from FaberOS itself: same origin, and only the page that holds this app's window. */
(() => {
  let inOS = false;
  try { inOS = window.parent !== window && parent.location.origin === location.origin && /^\/os(\.html)?$/.test(parent.location.pathname); } catch (e) {}
  const post = (m) => { if (inOS) parent.postMessage(Object.assign({ faberos: 1 }, m), location.origin); };
  // Inside FaberOS, an app's own focus() can't pull the keyboard out of FaberOS: while this window doesn't have the
  // keyboard and nobody has just pressed in it, the call is ignored (a first-run guide focusing its first field as it
  // loads would otherwise take the letters someone is typing into FaberOS's top bar). Once the window is being used it
  // has the keyboard, and focus() works as always.
  // (A press in FaberOS itself counts as a user gesture for this window too, so only a press or key in this window says
  // it's being used.)
  if (inOS) { const own = HTMLElement.prototype.focus; let used = 0; const mark = () => { used = Date.now(); };
    ["pointerdown", "keydown", "touchstart"].forEach((t) => addEventListener(t, mark, true));
    HTMLElement.prototype.focus = function (o) { if (!document.hasFocus() && Date.now() - used > 1000) return; return own.call(this, o); }; }
  let onFiles = null; const waiting = []; let verbs = {};
  addEventListener("message", (e) => {
    if (!inOS || e.origin !== location.origin || e.source !== parent || !e.data || e.data.faberos !== 1) return;
    if (e.data.type === "files" && Array.isArray(e.data.files)) { if (onFiles) onFiles(e.data.files); else waiting.push(e.data.files); }
    if (e.data.type === "verb" && typeof e.data.name === "string") {
      const fn = Object.prototype.hasOwnProperty.call(verbs, e.data.name) && verbs[e.data.name], id = e.data.id;
      const reply = (ok, v) => post({ type: "verb-result", id, ok, text: String((v && typeof v === "object" ? v.text : v) || (ok ? "Done." : "That didn't work.")).slice(0, 600) });
      if (typeof fn !== "function") return reply(false, "This app can't do \"" + e.data.name + "\".");
      Promise.resolve().then(() => fn(e.data.args || {})).then((v) => reply(true, v), (x) => reply(false, x && x.message ? x.message : x));
    }
  });
  window.Faber = {
    inOS,
    notify(title, body) { post({ type: "notify", title: String(title || "").slice(0, 120), body: String(body || "").slice(0, 400) }); },
    open(id) { post({ type: "open", id: String(id || "") }); },
    save(blob, name) { if (!(blob instanceof Blob)) return false; post({ type: "save", file: new File([blob], String(name || "file").slice(0, 160), { type: blob.type }) }); return inOS; },
    onFiles(fn) { onFiles = fn; post({ type: "ready", files: true }); while (waiting.length) fn(waiting.shift()); },
    verbs(map) { verbs = Object.assign({}, map); post({ type: "verbs", names: Object.keys(verbs).slice(0, 40) }); },
  };
  post({ type: "ready" });
})();
