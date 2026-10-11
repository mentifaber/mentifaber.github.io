/* Mentifaber 2 · live widgets. Any element with data-w="<kind>" becomes a small live tile; each one links to the app
   it comes from. Keyless public sources only, cached for a few minutes per tab, and a dead feed just says so.
   Kinds: weather · moon · quakes · iss · btc · kp · hive · agent */
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
      const v = await cache("kp", async () => { const j = await get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"); const last = j[j.length - 1]; // rows were arrays under a header row; newer SWPC products are objects
        const kp = Array.isArray(last) ? +last[1] : +(last.Kp != null ? last.Kp : last.kp_index != null ? last.kp_index : last.estimated_kp);
        if (!isFinite(kp)) throw new Error("no kp"); return { kp, at: Array.isArray(last) ? last[0] : last.time_tag }; });
      const s = v.kp >= 7 ? "Severe storm" : v.kp >= 5 ? "Geomagnetic storm" : v.kp >= 4 ? "Unsettled" : "Quiet";
      return { label: "Space weather · Kp", value: v.kp.toFixed(1), sub: s + (v.kp >= 5 ? " · auroras likely" : ""), href: "vigil.html" };
    },
    async hive() {
      const v = await cache("hive", () => get("/api/hive/models", 8000));
      return { label: "Hive", value: (v.models || []).length, sub: "models on call" + (v.resting ? " · free tier resting" : ""), href: "hive" };
    },
    async agent() {
      const v = await get("/api/agent/status", 8000);
      const st = { online: "Online", waking: "Waking", asleep: "Asleep", empty: "No model" }[v.state] || v.state;
      return { label: "Mentifaber Agent", value: st, sub: v.model ? v.model.label : "", href: "hive#keys", tone: v.state === "online" ? "up" : "" };
    },
  };

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
