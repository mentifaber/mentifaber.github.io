// Upstream mocks shared by the Vigil browser test (routes) and the in-process relay (global fetch).
import { readFileSync } from "node:fs";
const DIR = new URL(".", import.meta.url).pathname;
const NOW = Date.now(), NS = Math.floor(NOW / 1e3);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const HOME = { lat: 39.2014, lon: -85.9214 };
export const log = [];

// ~8000 aircraft worldwide, clustered over busy regions, plus a few known ones near home
const REGIONS = [[40, -90, 14, 22, 0.32], [50, 10, 9, 14, 0.25], [30, 115, 10, 14, 0.14], [25, 50, 8, 12, 0.06], [-25, -50, 10, 12, 0.05], [35, 138, 5, 8, 0.05], [0, 0, 60, 170, 0.13]];
function pickRegion() { let r = rnd(), a = 0; for (const g of REGIONS) { a += g[4]; if (r <= a) return g; } return REGIONS[0]; }
export const OS_STATES = [];
for (let i = 0; i < 8000; i++) {
  const [la, lo, dla, dlo] = pickRegion();
  const lat = Math.max(-75, Math.min(75, la + (rnd() - 0.5) * 2 * dla)), lon = lo + (rnd() - 0.5) * 2 * dlo;
  const gnd = rnd() < 0.06, alt = gnd ? null : Math.round(rnd() < 0.3 ? rnd() * 3000 : 3000 + rnd() * 9500);
  OS_STATES.push([(0x100000 + i).toString(16), "TST" + (1000 + i) + " ", ["United States", "Germany", "China", "United Kingdom", "France", "Brazil", "Japan"][i % 7],
    NS - 2, NS - 1, +lon.toFixed(4), +lat.toFixed(4), alt, gnd, gnd ? 0 : 120 + rnd() * 130, rnd() * 360, gnd ? null : (rnd() - 0.5) * 15, null, alt, i === 77 ? "7700" : String(1000 + (i % 6000)), false, 0, [2, 3, 4, 4, 4, 6, 8][i % 7]]);
}
OS_STATES.push(["aa2ba2", "UAL2677 ", "United States", NS - 1, NS, -86.4, 39.5, 10363, false, 236, 255.6, -1, null, 10500, "3371", false, 0, 4]);

const ADSB_NEAR = (lat, lon) => {
  const ac = [];
  for (let i = 0; i < 120; i++) ac.push({ hex: (0xa00000 + i).toString(16), type: "adsb_icao", flight: "N" + (100 + i) + "AB", r: "N" + (100 + i) + "AB", t: ["C172", "B738", "A320", "E75L", "B77W"][i % 5],
    desc: ["CESSNA 172", "BOEING 737-800", "AIRBUS A-320", "EMBRAER ERJ-175", "BOEING 777-300ER"][i % 5], alt_baro: i % 13 === 0 ? "ground" : 1500 + (i * 397) % 39000, gs: 90 + (i * 7) % 380, track: (i * 37) % 360,
    baro_rate: ((i % 5) - 2) * 640, squawk: String(1200 + i), category: ["A1", "A3", "A3", "A3", "A5"][i % 5], lat: lat + Math.sin(i) * 1.4, lon: lon + Math.cos(i * 1.3) * 1.8, seen_pos: (i % 7) * 0.4, mlat: i % 9 === 0 ? ["lat"] : [] });
  ac.push({ hex: "aa2ba2", type: "adsb_icao", flight: "UAL2677 ", r: "N75426", t: "B739", desc: "BOEING 737-900", ownOp: "UNITED AIRLINES INC", alt_baro: 34000, gs: 452, track: 255.6, baro_rate: 0, squawk: "3371", category: "A3", lat: 39.48, lon: -86.45, seen_pos: 0.2, mlat: [] });
  ac.push({ hex: "ae1234", type: "adsb_icao", flight: "RCH401  ", r: "05-5140", t: "C17", desc: "BOEING C-17 Globemaster III", dbFlags: 1, alt_baro: 28000, gs: 410, track: 80, lat: lat + 0.6, lon: lon - 0.8, seen_pos: 0.5, mlat: [] });
  ac.push({ hex: "a77777", type: "adsb_icao", flight: "N7700X  ", r: "N7700X", t: "PA28", desc: "PIPER PA-28", squawk: "7700", emergency: "general", alt_baro: 4500, gs: 95, track: 190, baro_rate: -900, lat: lat - 0.3, lon: lon + 0.25, seen_pos: 0.1, mlat: [] });
  return { ac, now: Date.now(), total: ac.length };
};
const J = (o, h = {}, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...h } });
const T = (t, h = {}) => new Response(t, { headers: { "access-control-allow-origin": "*", ...h } });
const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
const tle = `ISS (ZARYA)
1 25544U 98067A   ${yday()} .00005946  00000+0  11657-3 0  9991
2 25544  51.6321  74.9235 0006732 257.7935 102.2300 15.48850287590084
CSS (TIANHE)
1 48274U 21035A   ${yday()} .00022176  00000+0  26300-3 0  9993
2 48274  41.4695 322.9239 0000414  91.3605 268.7281 15.60678231311658
NOAA 19
1 33591U 09005A   ${yday()} .00000075  00000+0  65163-4 0  9990
2 33591  99.0349 335.1420 0013452 213.7046 146.3285 14.13151545909219
GOES 16
1 41866U 16071A   ${yday()} -.00000243  00000+0  00000+0 0  9995
2 41866   0.0761  86.2280 0001141 228.4337 220.3005  1.00271010 36093
METOP-B
1 38771U 12049A   ${yday()} .00000110  00000+0  70063-4 0  9996
2 38771  98.6731 330.7090 0001614  98.3016 261.8366 14.21504428616870
METEOSAT-11
1 40732U 15034A   ${yday()} .00000017  00000+0  00000+0 0  9995
2 40732   2.7392  59.5310 0001233 134.6203 340.2201  1.00271828 40166
`;
function yday() { const d = new Date(), y0 = Date.UTC(d.getUTCFullYear(), 0, 1); const doy = (Date.now() - y0) / 864e5 + 1; return String(d.getUTCFullYear() % 100).padStart(2, "0") + doy.toFixed(8).padStart(12, "0"); }
function forecast() {
  const H = 171, D = 16, h0 = Math.floor(NOW / 3600e3) * 3600e3 - 3 * 3600e3;
  const ht = Array.from({ length: H }, (_, i) => iso(h0 + i * 3600e3).slice(0, 16));
  const day0 = new Date(NOW); day0.setHours(12, 0, 0, 0);
  const dt = Array.from({ length: D }, (_, i) => new Date(day0.getTime() + i * 864e5).toISOString().slice(0, 10));
  const arr = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  return {
    current: { temperature_2m: 14.2, apparent_temperature: 12.9, relative_humidity_2m: 61, dew_point_2m: 6.9, weather_code: 2, precipitation: 0, wind_speed_10m: 14, wind_direction_10m: 220, wind_gusts_10m: 28, pressure_msl: 1016.2, cloud_cover: 40, visibility: 24000, uv_index: 2.1, is_day: 1 },
    minutely_15: { time: arr(8, i => iso(NOW + i * 900e3)), precipitation: arr(8, () => 0) },
    hourly: { time: ht, temperature_2m: arr(H, i => 10 + 6 * Math.sin(i / 24 * 6.28)), apparent_temperature: arr(H, i => 9 + 6 * Math.sin(i / 24 * 6.28)), precipitation_probability: arr(H, i => (i * 13) % 70),
      precipitation: arr(H, i => (i % 17 === 0 ? 0.4 : 0)), weather_code: arr(H, i => [0, 1, 2, 3, 61][i % 5]), wind_speed_10m: arr(H, () => 12), wind_gusts_10m: arr(H, () => 25), uv_index: arr(H, () => 1), is_day: arr(H, i => ((i + 7) % 24 < 12 ? 1 : 0)), pressure_msl: arr(H, () => 1015) },
    daily: { time: dt, weather_code: arr(D, i => [0, 2, 3, 61, 95][i % 5]), temperature_2m_max: arr(D, i => 18 + i % 5), temperature_2m_min: arr(D, i => 6 + i % 4), apparent_temperature_max: arr(D, () => 17), apparent_temperature_min: arr(D, () => 5),
      precipitation_probability_max: arr(D, i => (i * 17) % 90), precipitation_sum: arr(D, i => i % 3), precipitation_hours: arr(D, i => i % 5), wind_speed_10m_max: arr(D, () => 20), wind_gusts_10m_max: arr(D, () => 35), wind_direction_10m_dominant: arr(D, () => 200),
      uv_index_max: arr(D, () => 4), sunrise: arr(D, i => dt[i] + "T07:40"), sunset: arr(D, i => dt[i] + "T18:55"), daylight_duration: arr(D, () => 40000) },
  };
}
const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export async function upstream(url, init = {}) {
  url = String(url);
  log.push(url);
  const u = new URL(url);
  const h = u.host, p = u.pathname;
  if (h === "api.open-meteo.com") return J(u.searchParams.get("models") ? { daily: Object.fromEntries(["gfs_seamless", "ecmwf_ifs025", "icon_seamless"].flatMap((m, k) => [["temperature_2m_max_" + m, Array(7).fill(18 + k)], ["temperature_2m_min_" + m, Array(7).fill(6)], ["precipitation_sum_" + m, Array(7).fill(1)]])) } : forecast());
  if (h === "air-quality-api.open-meteo.com") return J({ current: { us_aqi: 38, pm2_5: 7.1 } });
  if (h === "geocoding-api.open-meteo.com") return J({ results: [{ name: "Chicago", latitude: 41.85, longitude: -87.65, admin1: "Illinois", country: "United States", country_code: "US" }] });
  if (h === "api.bigdatacloud.net") return J({ city: "Columbus", principalSubdivision: "Indiana", countryName: "United States" });
  if (h === "api.coingecko.com") return p.includes("global") ? J({ data: { total_market_cap: { usd: 3.1e12 }, market_cap_change_percentage_24h_usd: 1.2, market_cap_percentage: { btc: 56.1 } } })
    : J({ bitcoin: { usd: 98000, usd_24h_change: 1.5 }, ethereum: { usd: 3400, usd_24h_change: -0.7 }, solana: { usd: 180, usd_24h_change: 2.1 }, dogecoin: { usd: 0.21, usd_24h_change: 0.4 } });
  if (h === "api.frankfurter.dev" || h === "api.frankfurter.app" || h === "open.er-api.com") return J({ rates: { EUR: 0.92, GBP: 0.78, JPY: 149.3, CAD: 1.37 } });
  if (h === "en.wikipedia.org") return J({ news: [{ story: "A <a href=\"./X\">thing</a> happened.", links: [{ content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/X" } } }] }] });
  if (h === "earthquake.usgs.gov") return J({ features: [{ properties: { mag: 6.1, place: "120 km S of Somewhere", time: NOW - 3600e3 }, geometry: { coordinates: [142.1, 38.2, 30] } }, { properties: { mag: 4.2, place: "Nevada", time: NOW - 7200e3 }, geometry: { coordinates: [-117, 38, 8] } }] });
  if (h === "api.wheretheiss.at") return J({ latitude: 12.3, longitude: -40.1, altitude: 418, velocity: 27600 });
  if (h === "services.swpc.noaa.gov") {
    if (p.endsWith("noaa-planetary-k-index.json")) return J([{ time_tag: iso(NOW - 6 * 3600e3), Kp: 2.33 }, { time_tag: iso(NOW - 3 * 3600e3), Kp: 3.67 }]);
    if (p.endsWith("noaa-planetary-k-index-forecast.json")) { const t0 = Math.floor(NOW / 10800e3) * 10800e3; return J(Array.from({ length: 56 }, (_, i) => { const t = t0 + (i - 24) * 10800e3; return { time_tag: iso(t), kp: (i % 9) * 0.67, observed: t < NOW - 10800e3 ? "observed" : t < NOW ? "estimated" : "predicted", noaa_scale: null }; })); }
    if (p.endsWith("noaa-scales.json")) return J({ "0": { DateStamp: iso(NOW).slice(0, 10), R: { Scale: "1", Text: "minor" }, S: { Scale: "0", Text: "none" }, G: { Scale: "0", Text: "none" } }, "1": { DateStamp: iso(NOW).slice(0, 10), R: { MinorProb: "35", MajorProb: "5" }, S: { Prob: "5" }, G: { Scale: "0" } }, "2": { DateStamp: iso(NOW + 864e5).slice(0, 10), R: { MinorProb: "30", MajorProb: "5" }, S: { Prob: "1" }, G: { Scale: "1" } }, "3": { DateStamp: iso(NOW + 1728e5).slice(0, 10), R: { MinorProb: "25", MajorProb: "1" }, S: { Prob: "1" }, G: { Scale: "0" } } });
    if (p.endsWith("ovation_aurora_latest.json")) return J({ coordinates: Array.from({ length: 900 }, (_, i) => [i % 360, 60 + (i % 15), 20 + (i % 30)]) });
    if (p.endsWith("summary/solar-wind-speed.json")) return J([{ proton_speed: 587, time_tag: iso(NOW) + "Z" }]);
    if (p.endsWith("summary/solar-wind-mag-field.json")) return J([{ bt: 4, bz_gsm: -2, time_tag: iso(NOW) + "Z" }]);
    if (p.endsWith("rtsw_wind_1m.json")) return J(Array.from({ length: 1440 }, (_, i) => ({ time_tag: iso(NOW - i * 60e3), active: true, source: "SOLAR1", proton_speed: 450 + 80 * Math.sin(i / 200), proton_density: 3 + Math.sin(i / 90), proton_temperature: 1e5 })));
    if (p.endsWith("rtsw_mag_1m.json")) return J(Array.from({ length: 1440 }, (_, i) => ({ time_tag: iso(NOW - i * 60e3), active: true, source: "SOLAR1", bt: 5, bz_gsm: -3 * Math.sin(i / 70), by_gsm: 1 })));
    if (p.endsWith("xrays-1-day.json")) return J(Array.from({ length: 1440 }, (_, i) => ({ time_tag: iso(NOW - i * 60e3) + "Z", flux: (i > 300 && i < 330 ? 2.4e-5 : 6e-7), energy: "0.1-0.8nm" })));
    if (p.endsWith("xray-flares-latest.json")) return J([{ current_class: "C1.2", max_class: "M2.4", max_time: iso(NOW - 5 * 3600e3) + "Z" }]);
    if (p.includes("/solar-wind/")) return new Response("<html>404</html>", { status: 404 });
  }
  if (h === "api.weather.gov") return J(u.searchParams.get("event") ? { features: [] } : { features: [{ properties: { event: "Tornado Warning", areaDesc: "Bartholomew, IN", severity: "Extreme", sent: iso(NOW) + "Z" }, geometry: { type: "Polygon", coordinates: [[[-86, 39], [-85.8, 39], [-85.8, 39.3], [-86, 39.3], [-86, 39]]] } }] });
  if (h === "volcanoes.usgs.gov") return J([]);
  if (h === "www.gdacs.org") return J({ features: [{ properties: { eventtype: "TC", alertlevel: "Orange", name: "Tropical Cyclone TEST", country: "Philippines" }, geometry: { type: "Point", coordinates: [125, 14] } }] });
  if (h === "raw.githubusercontent.com") return T(tle);
  if (h === "api.rainviewer.com") return J({ host: "https://tilecache.rainviewer.com", radar: { past: [{ time: NS - 600, path: "/v2/radar/a" }, { time: NS, path: "/v2/radar/b" }], nowcast: [] }, satellite: { infrared: [{ time: NS, path: "/v2/satellite/c" }] } });
  if (h === "tilecache.rainviewer.com") return new Response(PNG1, { headers: { "content-type": "image/png" } });
  if (h === "ll.thespacedevs.com") return J({ results: [{ name: "Falcon 9 | Starlink", net: iso(NOW + 864e5) + "Z", pad: { latitude: "28.5", longitude: "-80.6", name: "SLC-40", location: { name: "Cape Canaveral" } } }] });
  if (h === "api.nasa.gov") return J({ title: "Pillars of Creation", media_type: "image", url: "https://apod.nasa.gov/x.jpg", explanation: "Stars." });
  if (h === "apod.nasa.gov" || h === "t.plnspttrs.net" || h === "hexdb.io" && p.startsWith("/static")) return new Response(PNG1, { headers: { "content-type": "image/png" } });
  if (h === "api.adsbdb.com") {
    if (p.startsWith("/v0/callsign/UAL2677")) return J({ response: { flightroute: { callsign: "UAL2677", airline: { name: "United Airlines", icao: "UAL" }, origin: { iata_code: "CLE", icao_code: "KCLE", latitude: 41.4117, longitude: -81.8498, municipality: "Cleveland", name: "Cleveland Hopkins", country_iso_name: "US" }, destination: { iata_code: "DEN", icao_code: "KDEN", latitude: 39.8617, longitude: -104.673, municipality: "Denver", name: "Denver International", country_iso_name: "US" } } } });
    if (p.startsWith("/v0/aircraft/aa2ba2")) return J({ response: { aircraft: { type: "737NG 924ER/W", icao_type: "B739", manufacturer: "Boeing", registration: "N75426", registered_owner: "United Airlines", registered_owner_country_name: "United States" } } });
    return J({ response: "unknown aircraft" }, {}, 404);
  }
  if (h === "api.planespotters.net") return J({ photos: p.endsWith("aa2ba2") ? [{ thumbnail_large: { src: "https://t.plnspttrs.net/aa2ba2.jpg" }, link: "https://www.planespotters.net/photo/1", photographer: "J. Spotter" }] : [] });
  if (h === "hexdb.io") return T("n/a");
  if (h === "opensky-network.org") return J({ time: Math.floor(Date.now() / 1e3), states: OS_STATES }, { "x-rate-limit-remaining": "380" });
  if (h === "auth.opensky-network.org") return J({ access_token: "t", expires_in: 1800 });
  if (h === "api.adsb.lol" || h === "opendata.adsb.fi") {
    const m = /\/point\/([-\d.]+)\/([-\d.]+)\/(\d+)/.exec(p) || /\/lat\/([-\d.]+)\/lon\/([-\d.]+)\/dist\/(\d+)/.exec(p);
    if (m) return J(ADSB_NEAR(+m[1], +m[2]));
    if (p.endsWith("/mil")) return J({ ac: [{ hex: "ae1234", flight: "RCH401", r: "05-5140", t: "C17", desc: "BOEING C-17", dbFlags: 1, alt_baro: 28000, gs: 410, track: 80, lat: 39.8, lon: -86.7 }, { hex: "43c6f1", flight: "RRR7201", t: "A400", dbFlags: 1, alt_baro: 22000, gs: 330, track: 300, lat: 51, lon: -1 }] });
    if (/\/sqk\/7700$/.test(p)) return J({ ac: [{ hex: "e48a11", flight: "TAM3054", r: "PR-MYX", t: "A320", squawk: "7700", emergency: "general", alt_baro: 9000, gs: 250, track: 120, lat: -23.4, lon: -46.6 }] });
    if (/\/sqk\/7[56]00$/.test(p)) return J({ ac: [] });
    if (/\/callsign\/DAL9/.test(p)) return J({ ac: [{ hex: "a1b2c3", flight: "DAL9", r: "N123DL", t: "A359", alt_baro: 38000, gs: 480, track: 60, lat: 52, lon: -30 }] });
    return J({ ac: [] });
  }
  if (h === "data.gdeltproject.org") {
    if (p.endsWith("lastupdate.txt")) return T("97697 9ea5 http://data.gdeltproject.org/gdeltv2/20261014004500.export.CSV.zip\n");
    const z = /(\d{14})\.export\.CSV\.zip$/.exec(p);
    if (z) { try { return new Response(readFileSync(DIR + z[1] + ".zip"), { headers: { "access-control-allow-origin": "*" } }); } catch { return new Response("nf", { status: 404, headers: { "access-control-allow-origin": "*" } }); } }
  }
  if (h === "api.gdeltproject.org") return J({ articles: [{ url: "https://news.example/1", title: "Heavy shelling reported near the front", seendate: "20261014T001500Z", domain: "news.example", sourcecountry: "United Kingdom" }] });
  return new Response("unmocked " + url, { status: 599 });
}
