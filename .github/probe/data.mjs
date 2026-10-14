const UA = { "user-agent": "Mozilla/5.0 (compatible; mentifaber.org Vigil/1.0; +https://mentifaber.org/contact)", accept: "application/json,text/csv,*/*" };
const show = async (label, url, n = 900) => { const t0 = Date.now(); try { const r = await fetch(url, { headers: UA }); const t = await r.text(); console.log("\n### " + label + " " + r.status + " " + (Date.now() - t0) + "ms " + (r.headers.get("content-type") || "")); console.log(t.slice(0, n)); return t; } catch (e) { console.log("\n### " + label + " ERROR " + e.message); return ""; } };
await show("yahoo XOM 1d/15m", "https://query1.finance.yahoo.com/v8/finance/chart/XOM?range=1d&interval=15m", 1500);
await show("yahoo2 ^GSPC 5d/1h", "https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1h", 700);
await show("yahoo GC=F", "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1d&interval=30m", 700);
await show("yahoo XRP-USD", "https://query1.finance.yahoo.com/v8/finance/chart/XRP-USD?range=1d&interval=30m", 700);
await show("yahoo search tesla", "https://query1.finance.yahoo.com/v1/finance/search?q=tesla&quotesCount=3&newsCount=0", 900);
await show("stooq xom.us", "https://stooq.com/q/l/?s=xom.us&f=sd2t2ohlcvpn&h&e=csv");
await show("stooq ^spx,gc.f,cl.f", "https://stooq.com/q/l/?s=%5Espx+gc.f+cl.f&f=sd2t2ohlcvpn&h&e=csv");
await show("coingecko price", "https://api.coingecko.com/api/v3/simple/price?ids=ripple,bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true");
await show("coingecko search xrp", "https://api.coingecko.com/api/v3/search?query=xrp", 700);
await show("coingecko markets spark", "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ripple&sparkline=true&price_change_percentage=24h", 600);
await show("coinbase XRP", "https://api.coinbase.com/v2/prices/XRP-USD/spot");
// GDELT: one export file, column check for actor countries, quad class, Goldstein, root codes
const last = await show("gdelt lastupdate", "https://data.gdeltproject.org/gdeltv2/lastupdate.txt", 400);
const m = /(\d{14})\.export\.CSV\.zip/.exec(last);
if (m) {
  const r = await fetch("https://data.gdeltproject.org/gdeltv2/" + m[1] + ".export.CSV.zip"), buf = await r.arrayBuffer(), v = new DataView(buf);
  let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  const cd = v.getUint32(e + 16, true), size = v.getUint32(cd + 20, true), lho = v.getUint32(cd + 42, true), start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
  const text = await new Response(new Blob([new Uint8Array(buf, start, size)]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  const rows = text.split("\n").filter(Boolean).map((l) => l.split("\t"));
  console.log("\n### gdelt file", m[1], "zip", buf.byteLength, "rows", rows.length, "cols", rows[0].length);
  console.log("sample row:", JSON.stringify(rows[5].map((x, i) => i + "=" + x.slice(0, 40))));
  const cnt = (i) => { const o = {}; for (const c of rows) o[c[i]] = (o[c[i]] || 0) + 1; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 14); };
  console.log("c7 actor1 country", JSON.stringify(cnt(7))); console.log("c17 actor2 country", JSON.stringify(cnt(17))); console.log("c28 root", JSON.stringify(cnt(28))); console.log("c29 quad", JSON.stringify(cnt(29)));
  const gs = rows.map((c) => +c[30]).filter(isFinite); console.log("c30 goldstein min/max/mean", Math.min(...gs), Math.max(...gs), (gs.reduce((a, b) => a + b, 0) / gs.length).toFixed(2));
  const pairs = {}; for (const c of rows) if (c[7] && c[17] && c[7] !== c[17]) { const k = [c[7], c[17]].sort().join("-"); pairs[k] = (pairs[k] || 0) + 1; } console.log("top dyads", JSON.stringify(Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 25)));
  const ec = {}; for (const c of rows) if (/^13/.test(c[26])) ec[c[26]] = (ec[c[26]] || 0) + 1; console.log("threat codes", JSON.stringify(ec));
  // an older file (2 days back) still downloadable?
  const old = new Date(Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[1].slice(8, 10), +m[1].slice(10, 12)) - 2 * 864e5).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const r2 = await fetch("https://data.gdeltproject.org/gdeltv2/" + old + ".export.CSV.zip"); console.log("older file", old, r2.status, (await r2.arrayBuffer()).byteLength);
}
