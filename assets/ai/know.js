/* What AutoFaber Offline knows without a network: what's already on this phone. Three sources, read on the device:
   - the Blackout Kit's guides (safe water, a dead fridge, carbon monoxide, the phone's battery, radio, emergency numbers),
     read from the kit's own page, which the offline worker keeps;
   - the House Manual (localStorage "house:v1"): where the shutoffs are, the Wi-Fi, appliances, people to call; never an
     entry marked private;
   - Street Board's notices for every street this phone has opened (localStorage "street:posts:<board>"), while live.
   OfflineKnow.gather() → [{ src, title, text, where? }];  OfflineKnow.search(question, notes, k) → the k best, best first.
   Plain word matching (with a few everyday synonyms), so it works the same on every device, model or not. */
(function (root) {
  "use strict";
  const STOP = new Set("a an and are as at be but by can do does for from get got have how i if in is it its me my of on or our so that the their them there this to us was we what when where which who why will with you your yours i'm it's where's what's how's there's can't don't".split(" "));
  // a few words people use for the same thing, so "gas valve" finds "gas shutoff" and "drinking water" finds "safe water"
  const SAME = [["shutoff", "shut", "valve", "stopcock", "turn", "off", "cutoff"], ["water", "drinking", "drink", "purify", "purifying", "clean", "boil", "bleach"], ["fridge", "freezer", "refrigerator", "food", "spoil", "spoiled"],
    ["generator", "carbon", "monoxide", "co", "fumes", "heater", "heat"], ["phone", "battery", "charge", "charging", "power"], ["radio", "walkie", "talkie", "ham", "frs", "frequency", "channel"],
    ["emergency", "911", "999", "112", "ambulance", "police", "fire"], ["wifi", "wi", "fi", "internet", "password", "router", "network"], ["breaker", "fuse", "electric", "electricity", "panel"], ["need", "needs", "help", "offer", "offers"]];
  const GROUP = new Map(); SAME.forEach((g, i) => g.forEach((w) => GROUP.set(w, i)));
  const words = (s) => String(s || "").toLowerCase().replace(/wi-fi/g, "wifi").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  const stem = (w) => w.length > 4 ? w.replace(/(ing|ers|ies|es|s)$/, "") : w;

  async function guides() {
    let html = null; for (const u of ["/blackout", "/blackout.html"]) { try { const r = await fetch(u); if (r.ok) { html = await r.text(); break; } } catch (e) {} }
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, "text/html"), out = [];
    for (const d of doc.querySelectorAll("details")) { const title = (d.querySelector("summary") || {}).textContent || "", src = (d.querySelector(".src") || {}).textContent || "";
      for (const li of d.querySelectorAll("li")) out.push({ src: "guide", title: title.trim(), text: li.textContent.replace(/\s+/g, " ").trim(), where: src.trim() }); }
    return out;
  }
  function house() {
    let E = []; try { E = JSON.parse(localStorage.getItem("house:v1") || "[]"); } catch (e) {}
    return E.filter((e) => e && e.title && !e.priv).map((e) => ({ src: "house", title: String(e.title), text: [e.where, e.det, e.model ? "Model: " + e.model : ""].filter(Boolean).join(" · ") }));
  }
  function street() {
    const out = [], now = Date.now();
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^street:posts:/.test(k)) continue; const board = k.slice(13);
      for (const p of JSON.parse(localStorage.getItem(k) || "[]")) if (p && p.text && p.exp > now && !p.gone) out.push({ src: "street", title: (p.kind ? p.kind.charAt(0).toUpperCase() + p.kind.slice(1) : "Notice") + (p.by ? " from " + p.by : ""), text: String(p.text), where: board, at: p.at }); } } catch (e) {}
    return out;
  }
  async function gather() { return [...(await guides()), ...house(), ...street()]; }

  // score: each question word found in a note (its title counts double), a word with the same meaning half as much
  function search(q, notes, k = 4) {
    const qs = [...new Set(words(q).map(stem))]; if (!qs.length) return [];
    return notes.map((n) => { const t = words(n.title).map(stem), b = words(n.text).map(stem); let s = 0, hit = 0;
      for (const w of qs) { const g = GROUP.get(w); if (t.includes(w)) { s += 3; hit++; } else if (b.includes(w)) { s += 1.5; hit++; } else if (g !== undefined && [...t, ...b].some((x) => GROUP.get(x) === g)) { s += 0.75; hit++; } }
      if (n.src === "house") s *= 1.2; // the house's own answer before the general guide
      return { n, s: hit ? s * (hit / qs.length) : 0 }; }).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.n);
  }
  const label = (n) => n.src === "guide" ? "Blackout Kit guide · " + n.title : n.src === "house" ? "House Manual · " + n.title : "Street Board (" + n.where + ") · " + n.title;
  root.OfflineKnow = { gather, search, label, words };
})(typeof self !== "undefined" ? self : this);
