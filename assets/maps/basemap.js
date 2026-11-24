/* The site's own base map for Leaflet: land, coasts, borders and country names drawn from Natural Earth data served by
   mentifaber.org itself (assets/maps/world-*.json, built by tools/maps/build-world.mjs). No tile service and no API key
   stand between a visitor and the map, so it can't be switched off by a provider changing its terms (as CARTO did on
   25 September 2026, when its free tiles started showing an "API key required" notice instead of the map).

   Close in (zoom 5 and up) it can add street-level detail from OpenStreetMap's own tiles, which have never needed a
   key; they're darkened to match. If those tiles fail to load, they're taken away and the drawn map carries on.

     FaberMap.base(map, { labels: true, detail: true, theme: { land, coast, border, label } })  → Promise
*/
(function () {
  "use strict";
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const url = (f) => new URL(f, HERE).href;
  const cache = {};
  const load = (res) => cache[res] || (cache[res] = fetch(url("world-" + res + ".json")).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { delete cache[res]; throw e; }));
  const THEME = { sea: "#0b1320", land: "#16212f", coast: "rgba(140,170,205,.42)", border: "rgba(160,180,205,.26)", label: "rgba(205,215,230,.62)" };
  const OFFS = [-360, 0, 360];

  function draw(L, map, w, t, panes) {
    const g = L.layerGroup(), rd = L.canvas({ pane: panes.land, padding: 0.3 });
    for (const off of OFFS) {
      for (const r of w.land) { const ll = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i] + off]);
        g.addLayer(L.polygon(ll, { renderer: rd, pane: panes.land, color: t.coast, weight: 0.8, fillColor: t.land, fillOpacity: 1, interactive: false, smoothFactor: 0.6 })); }
      for (const r of w.borders) { const ll = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i] + off]);
        g.addLayer(L.polyline(ll, { renderer: rd, pane: panes.land, color: t.border, weight: 0.7, dashArray: "2 3", interactive: false, smoothFactor: 0.6 })); }
    }
    return g;
  }

  function labelsFor(L, w, t, pane) {
    return w.labels.map(([name, lon, lat, rank]) => {
      const m = L.marker([lat, lon], { pane, interactive: false, keyboard: false,
        icon: L.divIcon({ className: "fm-label", html: '<span style="color:' + t.label + '">' + name.replace(/[&<>]/g, "") + "</span>", iconSize: [0, 0] }) });
      m.rank = rank; return m;
    });
  }

  function base(map, opts) {
    opts = opts || {}; const L = window.L, t = Object.assign({}, THEME, opts.theme || {});
    if (!document.getElementById("fm-style")) { const s = document.createElement("style"); s.id = "fm-style";
      s.textContent = ".fm-label span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:600 10.5px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-shadow:0 0 3px #000,0 0 6px #000;pointer-events:none}" +
        ".fm-detail{filter:invert(1) hue-rotate(180deg) brightness(.82) contrast(.88) saturate(.6)}";
      document.head.appendChild(s); }
    map.getContainer().style.background = t.sea;
    const panes = { land: "fmLand", labels: "fmLabels", detail: "fmDetail" };
    if (!map.getPane(panes.land)) { map.createPane(panes.land).style.zIndex = 150; map.createPane(panes.detail).style.zIndex = 160; map.createPane(panes.labels).style.zIndex = 380; map.getPane(panes.labels).style.pointerEvents = "none"; }
    const st = { res: null, layer: null, labels: [], shown: new Set() };

    const showLabels = () => {
      if (!opts.labels && opts.labels !== undefined) return;
      const z = map.getZoom(), max = z < 2.5 ? 1 : z < 3.5 ? 2 : z < 4.5 ? 3 : 4, b = map.getBounds().pad(0.2);
      for (const m of st.labels) { const want = m.rank <= max && b.contains(m.getLatLng()) && !(st.detailOn && z >= 6);
        if (want && !st.shown.has(m)) { m.addTo(map); st.shown.add(m); } else if (!want && st.shown.has(m)) { m.remove(); st.shown.delete(m); } }
    };
    const use = (res) => load(res).then((w) => {
      if (st.res === res || st.res === "50m") return; // once the detailed map is in, it stays
      const g = draw(L, map, w, t, panes); if (st.layer) st.layer.remove(); g.addTo(map); st.layer = g; st.res = res;
      st.shown.forEach((m) => m.remove()); st.shown.clear(); st.labels = labelsFor(L, w, t, panes.labels); showLabels();
      map.attributionControl && map.attributionControl.addAttribution("Map: <a href=\"https://www.naturalearthdata.com/\" target=\"_blank\" rel=\"noopener\">Natural Earth</a>");
    });
    const ready = use("110m");
    const zoomed = () => { if (map.getZoom() >= 4 && st.res !== "50m") use("50m").catch(() => {}); showLabels(); };
    map.on("zoomend moveend", zoomed);

    if (opts.detail !== false) { // street-level detail close in, from OpenStreetMap (no key); gone again if it won't load
      let ok = 0, bad = 0;
      const tl = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { pane: panes.detail, minZoom: 5, maxZoom: 19, className: "fm-detail", crossOrigin: false,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' });
      tl.on("tileload", () => { ok++; st.detailOn = true; showLabels(); });
      tl.on("tileerror", () => { if (++bad >= 6 && !ok) { tl.remove(); st.detailOn = false; showLabels(); } });
      tl.addTo(map);
    }
    return ready.then(() => { zoomed(); return map; });
  }

  window.FaberMap = { base, load };
})();
