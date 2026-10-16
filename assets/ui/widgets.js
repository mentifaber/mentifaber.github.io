/* Mentifaber 2 · live widgets. Any element with data-w="<kind>" becomes a small live tile; each one links to the app
   it comes from. Keyless public sources only, cached for a few minutes per tab, and a dead feed just says so.
   Kinds: weather · moon · pass · quakes · iss · btc · kp · hf · hive · agent · suite */
(() => {
  const TTL = 5 * 60e3;
  const cache = async (k, fn) => {
    try { const c = JSON.parse(sessionStorage.getItem("mfw:" + k) || "null"); if (c && Date.now() - c.t < TTL) return c.v; } catch (e) {}
    const v = await fn(); try { sessionStorage.setItem("mfw:" + k, JSON.stringify({ t: Date.now(), v })); } catch (e) {} return v;
  };
  const get = (u, ms) => fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms || 9000) : undefined }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const F = (c) => Math.round(c * 9 / 5 + 32);
  const WMO = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Storm, hail", 99: "Storm, hail" };
  const usUnits = /^en-US|^en-LR|^my/.test(navigator.language || "en-US");

  const KIND = {
    async weather() {
      const v = await cache("weather", async () => {
        const at = await get("/api/where", 5000);
        if (!at || at.lat == null) throw new Error("no location");
        const w = await get("https://api.open-meteo.com/v1/forecast?latitude=" + (+at.lat).toFixed(3) + "&longitude=" + (+at.lon).toFixed(3) + "&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto");
        return { place: at.city || at.region || "Here", lat: at.lat, lon: at.lon, t: w.current.temperature_2m, code: w.current.weather_code, hi: w.daily.temperature_2m_max[0], lo: w.daily.temperature_2m_min[0] };
      });
      const t = (c) => (usUnits ? F(c) + "°" : Math.round(c) + "°");
      return { label: "Weather · " + v.place, value: t(v.t), sub: (WMO[v.code] || "") + " · " + t(v.hi) + " / " + t(v.lo), href: "wx/?lat=" + (+v.lat).toFixed(4) + "&lon=" + (+v.lon).toFixed(4) + "&name=" + encodeURIComponent(v.place) };
    },
    async moon() { // computed here: days since a known new moon, on the mean synodic month
      const syn = 29.530588853, age = (((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % syn + syn) % syn, ill = (1 - Math.cos((2 * Math.PI * age) / syn)) / 2;
      const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"], i = Math.floor(((age / syn) * 8 + 0.5)) % 8;
      return { label: "Moon", value: Math.round(ill * 100) + "<small>%</small>", sub: names[i] + " · day " + Math.floor(age), href: "moon-compatibility.html", art: moonArt(age / syn) };
    },
    async quakes() {
      const v = await cache("quakes", async () => { const j = await get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"); const f = j.features.slice().sort((a, b) => b.properties.mag - a.properties.mag)[0]; return { n: j.features.length, mag: f && f.properties.mag, place: f && f.properties.place }; });
      return { label: "Quakes · 24h ≥ M4.5", value: v.n, sub: v.mag ? "Biggest M" + v.mag.toFixed(1) + " · " + (v.place || "").replace(/^.* of /, "") : "Quiet", href: "vigil.html" };
    },
    async iss() {
      const v = await get("https://api.wheretheiss.at/v1/satellites/25544", 7000);
      const lat = v.latitude, lon = v.longitude, ns = lat >= 0 ? "N" : "S", ew = lon >= 0 ? "E" : "W";
      return { label: "ISS · live", value: Math.abs(lat).toFixed(1) + "°" + ns, sub: Math.abs(lon).toFixed(1) + "°" + ew + " · " + Math.round(v.velocity).toLocaleString() + " km/h · " + (v.visibility === "daylight" ? "in sunlight" : "in shadow"), href: "vigil.html" };
    },
    async btc() {
      const v = await cache("btc", () => get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"));
      const p = v.bitcoin.usd, ch = v.bitcoin.usd_24h_change;
      return { label: "Bitcoin", value: "$" + Math.round(p).toLocaleString(), sub: (ch >= 0 ? "▲ " : "▼ ") + Math.abs(ch).toFixed(2) + "% · 24h", href: "vigil.html", tone: ch >= 0 ? "up" : "down" };
    },
    async kp() {
      const v = await kpData();
      const s = v.kp >= 7 ? "Severe storm" : v.kp >= 5 ? "Geomagnetic storm" : v.kp >= 4 ? "Unsettled" : "Quiet";
      return { label: "Space weather · Kp", value: v.kp.toFixed(1), sub: s + (v.kp >= 5 ? " · auroras likely" : ""), href: "vigil.html" };
    },
    async pass() {
      const v = await cache("pass", async () => {
        let o = null; try { o = JSON.parse(localStorage.getItem("ow.obs") || "null"); } catch (e) {}
        if (!o || !isFinite(o.lat)) { const w = await get("/api/where", 5000); if (!w || w.lat == null) throw new Error("no location"); o = { lat: w.lat, lon: w.lon, how: w.city }; }
        const tle = await fetch("/api/orbit/tle?catnr=25544").then((r) => (r.ok ? r.text() : Promise.reject(r.status)));
        const L = tle.split(/\r?\n/).filter((x) => /^[12] /.test(x)); if (L.length < 2) throw new Error("no elements");
        await loadSat(); return { p: nextPass(L[0], L[1], +o.lat, +o.lon), place: o.how };
      });
      if (!v.p) return { label: "Next ISS pass", value: "None", sub: "no pass over you in the next two days", href: "orbit.html" };
      const now = Date.now(), up = v.p.rise <= now, mins = Math.round((v.p.rise - now) / 60e3), when = mins >= 60 ? Math.floor(mins / 60) + "h " + (mins % 60) + "m" : mins + "m";
      return { label: "Next ISS pass" + (v.place ? " · " + String(v.place).replace(/ \(approx\.\)$/, "") : ""), value: up ? "Now" : new Date(v.p.rise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), sub: (up ? "overhead" : "in " + when) + " · max " + Math.round(v.p.max) + "° · " + (v.p.vis ? "visible to the eye" : "not visible"), href: "orbit.html", tone: v.p.vis ? "up" : "" };
    },
    async hf() { // HF radio and the geomagnetic field: one factor of several (solar flux and time of day matter too)
      const v = await kpData(), kp = v.kp;
      return { label: "HF conditions · Kp " + kp.toFixed(1), value: kp >= 5 ? "Poor" : kp >= 4 ? "Fair" : "Good", sub: kp >= 5 ? "geomagnetic storm: HF absorbed, worst near the poles" : kp >= 4 ? "unsettled: fading on polar paths" : "quiet field, no geomagnetic trouble", href: "novarac.html", tone: kp >= 5 ? "down" : kp < 4 ? "up" : "" };
    },
    async suite() {
      let have = {}; try { have = JSON.parse(localStorage.getItem("mf:suite-installed") || "{}"); } catch (e) {}
      const list = await cache("suite", () => get("assets/suite.json", 6000)), n = list.filter((a) => have[a.id]).length;
      return { label: "Your suite", value: n + "<small>/" + list.length + "</small>", sub: n === list.length ? "every app is on this device" : n ? "installed here · add the rest" : "none installed yet · add them all", href: "./#suite" };
    },
    async hive() {
      const v = await cache("hive", () => get("/api/hive/models", 8000));
      return { label: "Genesis", value: (v.models || []).length, sub: "models on call" + (v.resting ? " · free tier resting" : ""), href: "hive" };
    },
    async agent() {
      const v = await get("/api/agent/status", 8000);
      const st = { online: "Online", waking: "Waking", asleep: "Asleep", empty: "No model" }[v.state] || v.state;
      return { label: "Mentifaber Agent", value: st, sub: v.model ? v.model.label : "", href: "hive#keys", tone: v.state === "online" ? "up" : "" };
    },
  };

  function kpData() {
    return cache("kp", async () => { const j = await get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"); const last = j[j.length - 1]; // rows were arrays under a header row; newer SWPC products are objects
      const kp = Array.isArray(last) ? +last[1] : +(last.Kp != null ? last.Kp : last.kp_index != null ? last.kp_index : last.estimated_kp);
      if (!isFinite(kp)) throw new Error("no kp"); return { kp, at: Array.isArray(last) ? last[0] : last.time_tag }; });
  }
  // ── the next ISS pass over you: Orbit Watch's engine, run here ──
  let satP = null;
  const loadSat = () => satP || (satP = new Promise((ok, no) => { if (window.satellite) return ok(); const s = document.createElement("script"); s.src = "assets/orbit/satellite.min.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  function nextPass(l1, l2, lat, lon) {
    const S = window.satellite, rec = S.twoline2satrec(l1, l2), D = Math.PI / 180, obs = { latitude: lat * D, longitude: lon * D, height: 0.05 };
    const at = (t) => { const d = new Date(t), pv = S.propagate(rec, d); if (!pv || !pv.position || typeof pv.position !== "object") return null; const g = S.gstime(d); return { eci: pv.position, g, el: S.ecfToLookAngles(obs, S.eciToEcf(pv.position, g)).elevation / D }; };
    const sun = (t) => { const n = t / 864e5 - 10957.5, L = (280.46 + 0.9856474 * n) % 360, gm = ((357.528 + 0.9856003 * n) % 360) * D, lam = (L + 1.915 * Math.sin(gm) + 0.02 * Math.sin(2 * gm)) * D, e = (23.439 - 4e-7 * n) * D; return [Math.cos(lam), Math.cos(e) * Math.sin(lam), Math.sin(e) * Math.sin(lam)]; };
    const lit = (p, t) => { const s = sun(t), r = p.eci, d = r.x * s[0] + r.y * s[1] + r.z * s[2]; return d > 0 || Math.hypot(r.x - d * s[0], r.y - d * s[1], r.z - d * s[2]) > 6378; };
    const sunEl = (t) => { const s = sun(t), g = S.gstime(new Date(t)), x = s[0] * Math.cos(g) + s[1] * Math.sin(g), y = -s[0] * Math.sin(g) + s[1] * Math.cos(g), la = lat * D, lo = lon * D; return Math.asin(Math.cos(la) * Math.cos(lo) * x + Math.cos(la) * Math.sin(lo) * y + Math.sin(la) * s[2]) / D; };
    let pass = null;
    for (let t = Date.now() - 15 * 60e3, end = Date.now() + 48 * 3600e3; t < end; t += 30e3) {
      const p = at(t); if (!p) break;
      if (p.el > 0) { if (!pass) pass = { rise: t, max: p.el, vis: false }; pass.max = Math.max(pass.max, p.el); if (p.el > 8 && !pass.vis && lit(p, t) && sunEl(t) < -6) pass.vis = true; pass.set = t; }
      else if (pass) { if (pass.max >= 10 && pass.set > Date.now()) return pass; pass = null; }
    }
    return null;
  }

  function moonArt(f) { // a lit disc for the phase fraction f (0 new → .5 full → 1 new)
    const r = 15, k = Math.cos(2 * Math.PI * f), right = f < .5, sweep = right ? 1 : 0, rx = Math.abs(k) * r;
    const d = "M18 3a15 15 0 0 " + sweep + " 0 30a" + rx.toFixed(2) + " 15 0 0 " + ((k > 0) === right ? 1 - sweep : sweep) + " 0 -30z";
    return '<svg viewBox="0 0 36 36" width="44" height="44" style="position:absolute;right:14px;top:14px"><circle cx="18" cy="18" r="15" fill="rgba(255,255,255,.08)"/><path d="' + d + '" fill="#f4ecd2"/></svg>';
  }

  async function fill(el) {
    const kind = el.dataset.w, fn = KIND[kind]; if (!fn) return;
    el.classList.add("skel");
    try {
      const v = await fn();
      el.classList.remove("skel");
      if (v.href && el.tagName === "A" && !el.getAttribute("href")) el.href = v.href;
      el.innerHTML = '<span class="wl"><span>' + esc(v.label) + "</span></span>" + (v.art || "") + '<div class="wv"' + (v.tone === "up" ? ' style="color:#3dffa8"' : v.tone === "down" ? ' style="color:#ff6b6b"' : "") + ">" + v.value + '</div><div class="ws">' + esc(v.sub) + "</div>";
    } catch (e) {
      el.classList.remove("skel");
      el.innerHTML = '<span class="wl"><span>' + esc(el.dataset.label || kind) + '</span></span><div class="wv" style="font-size:18px;color:var(--dim)">Offline</div><div class="ws">the feed didn\'t answer; it retries on your next visit</div>';
    }
  }
  const go = () => document.querySelectorAll("[data-w]").forEach(fill);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: "200px" });
    document.querySelectorAll("[data-w]").forEach((el) => io.observe(el));
  } else go();
  window.MFWidgets = { refresh: go };
})();
