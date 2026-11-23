/* Faber · the FaberOS app kit. An app on mentifaber.org loads this one small file to talk to FaberOS when it runs in a
   FaberOS window; outside FaberOS every call is a harmless no-op and Faber.inOS is false, so an app behaves as before.

     Faber.inOS                   true inside a FaberOS window
     Faber.notify(title, body)    a notification in FaberOS's notification center
     Faber.open(appId)            ask FaberOS to open another app
     Faber.save(blob, name)       put a file on the Shelf (FaberOS's shared file shelf, kept in this browser)
     Faber.onFiles(fn)            FaberOS hands this app files from the Shelf ("Open with"): fn(File[])

   Messages go only to and from FaberOS itself: same origin, and only the page that holds this app's window. */
(() => {
  let inOS = false;
  try { inOS = window.parent !== window && parent.location.origin === location.origin && /^\/os(\.html)?$/.test(parent.location.pathname); } catch (e) {}
  const post = (m) => { if (inOS) parent.postMessage(Object.assign({ faberos: 1 }, m), location.origin); };
  let onFiles = null; const waiting = [];
  addEventListener("message", (e) => {
    if (!inOS || e.origin !== location.origin || e.source !== parent || !e.data || e.data.faberos !== 1) return;
    if (e.data.type === "files" && Array.isArray(e.data.files)) { if (onFiles) onFiles(e.data.files); else waiting.push(e.data.files); }
  });
  window.Faber = {
    inOS,
    notify(title, body) { post({ type: "notify", title: String(title || "").slice(0, 120), body: String(body || "").slice(0, 400) }); },
    open(id) { post({ type: "open", id: String(id || "") }); },
    save(blob, name) { if (!(blob instanceof Blob)) return false; post({ type: "save", file: new File([blob], String(name || "file").slice(0, 160), { type: blob.type }) }); return inOS; },
    onFiles(fn) { onFiles = fn; post({ type: "ready", files: true }); while (waiting.length) fn(waiting.shift()); },
  };
  post({ type: "ready" });
})();
