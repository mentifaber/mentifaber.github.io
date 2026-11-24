// Builds the site's own world map (assets/maps/world-110m.json, world-50m.json) from Natural Earth via world-atlas 2.0.2,
// so no map on mentifaber.org needs a tile service or an API key to show land, coasts, borders and country names.
//   npm pack world-atlas@2.0.2 topojson-client@3.1.0, unpack both, then:
//   node tools/maps/build-world.mjs <world-atlas/package> <topojson-client/package>
// Output: { land: [ring…] (their outlines are the coasts), borders: [line…], labels: [[name, lon, lat, rank]…] }, each ring or line a flat
// [lon, lat, lon, lat, …] array rounded to the map's detail. rank 1 = largest countries, shown first as you zoom out.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const [atlas, client] = process.argv.slice(2); if (!atlas || !client) { console.error("usage: build-world.mjs <world-atlas> <topojson-client>"); process.exit(2); }
const topo = createRequire(import.meta.url)(path.resolve(client, "dist/topojson-client.js"));
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../assets/maps"); fs.mkdirSync(OUT, { recursive: true });
// rounded to dp decimals, and a point closer than tol degrees to the last one kept is dropped (the last point always stays)
// longitudes are unwrapped across the date line (179 → 181, not -179), so a shape that crosses it (Russia, Fiji) draws whole
// instead of as a streak across the map; the map draws copies 360° either side, which covers the overhang
const unwrap = (coords) => { let prev = null; return coords.map(([lon, lat]) => { if (prev !== null) { while (lon - prev > 180) lon -= 360; while (prev - lon > 180) lon += 360; } prev = lon; return [lon, lat]; }); };
const flat = (coords, dp, tol = 0) => { const k = 10 ** dp, out = []; let pl, pa; coords = unwrap(coords);
  coords.forEach(([lon, lat], i) => { const a = Math.round(lon * k) / k, b = Math.round(lat * k) / k; if (a === pl && b === pa) return;
    if (pl !== undefined && i < coords.length - 1 && Math.hypot(a - pl, b - pa) < tol) return; out.push(a, b); pl = a; pa = b; }); return out; };
const area = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
const centroid = (r) => { let x = 0, y = 0, a = 0; for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; x += (r[i][0] + r[i + 1][0]) * f; y += (r[i][1] + r[i + 1][1]) * f; a += f; } return a ? [x / (3 * a), y / (3 * a)] : r[0]; };
for (const [res, dp, tol] of [["110m", 1, 0], ["50m", 2, 0.06]]) {
  const C = JSON.parse(fs.readFileSync(path.join(atlas, "countries-" + res + ".json"))), Lj = JSON.parse(fs.readFileSync(path.join(atlas, "land-" + res + ".json")));
  const land = []; const lf = topo.feature(Lj, Lj.objects.land);
  for (const f of lf.features || [lf]) { const g = f.geometry; const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates; for (const p of polys) for (const r of p) { const x = flat(r, dp, tol); if (x.length >= 6) land.push(x); } }
  const lines = (m) => (m.type === "LineString" ? [m.coordinates] : m.coordinates).map((l) => flat(l, dp, tol)).filter((x) => x.length >= 4);
  const borders = lines(topo.mesh(C, C.objects.countries, (a, b) => a !== b));
  const labels = [];
  for (const f of topo.feature(C, C.objects.countries).features) {
    const g = f.geometry; if (!g || !f.properties.name) continue; const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    let best = null, ba = 0, total = 0; for (const p of polys) { const a = Math.abs(area(unwrap(p[0]))); total += a; if (a > ba) { ba = a; best = p[0]; } }
    const u = unwrap(best), lons = u.map((c) => c[0]); let lon, lat;
    if (Math.max(...lons) - Math.min(...lons) > 300) { lon = 0; lat = u.reduce((s, c) => s + c[1], 0) / u.length; } // circles a pole (Antarctica)
    else { [lon, lat] = centroid(u); lon = ((lon + 540) % 360) - 180; } labels.push([f.properties.name, Math.round(lon * 10) / 10, Math.round(lat * 10) / 10, total]);
  }
  labels.sort((a, b) => b[3] - a[3]); labels.forEach((l, i) => (l[3] = i < 25 ? 1 : i < 70 ? 2 : i < 140 ? 3 : 4));
  const out = JSON.stringify({ src: "Natural Earth 1:" + res.replace("m", ",000,000") + " (public domain) via world-atlas 2.0.2", land, borders, labels });
  fs.writeFileSync(path.join(OUT, "world-" + res + ".json"), out + "\n"); console.log(res, (out.length / 1024).toFixed(0) + "KB", land.length, "rings", borders.length, "borders", labels.length, "labels");
}
