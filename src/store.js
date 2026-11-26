// The Foundry's catalog. android/apps.json is the shelf (names, words, icons); each app's latest build publishes
// <file>.apk and <file>.json (version, size, SHA-256, signer, what changed) to its GitHub release and to R2, under
// apk/<release>/<file> in the MODELS bucket (.github/workflows/android.yml). R2 is what's served, so downloads don't depend
// on the repository being public; a build not mirrored there yet is still read from its GitHub release. The catalog joins
// the two, so a new build reaches Foundry within minutes of publishing, with no deploy of the site.
//   GET /store/catalog.json   the catalog (the storefront page and the Foundry app both read it)
//   GET /store.apk            the Foundry app itself, to install first
//   GET /store/apk/<id>       any app's latest APK, by its id
import SHELF from "../android/apps.json";

export const RELEASES = "https://github.com/mentifaber/mentifaber.github.io/releases/download/";
const ID = /^[a-z][\w]*(\.[a-z][\w]*)+$/i;
const PUBLIC = ["id", "name", "category", "tagline", "description", "features", "icon", "accent", "web", "page", "shots", "status"];
// "soon": a demo, simulator, sample or site page. Listed as Coming soon, never offered for install, whatever builds exist.
const soon = (a) => a.status === "soon";
const BUILT = ["versionCode", "versionName", "size", "sha256", "minSdk", "targetSdk", "cert", "built", "commit", "changes", "permissions"];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const apkUrl = (a) => RELEASES + a.release + "/" + a.file + ".apk";
export const r2Key = (a, ext) => "apk/" + a.release + "/" + a.file + ext;
const SITE = "https://mentifaber.org";

// One build's details, or null. A build is only offered when its details are complete and name this app.
export function build(a, b) {
  if (!b || typeof b !== "object" || b.id !== a.id || b.signed !== "release") return null;
  if (!Number.isInteger(b.versionCode) || b.versionCode < 1 || !/^[0-9a-f]{64}$/.test(b.sha256 || "") || !(b.size > 0)) return null;
  return pick(b, BUILT);
}

// Cloudflare's free plan lets one visit make 50 requests to the outside world, and each hop of a redirect counts (GitHub's
// release links redirect once). With dozens of apps on the shelf, asking GitHub about every one of them at once ran out
// partway and dropped every app after that. So the builds found are kept in a snapshot (memo: the Store Durable Object),
// and each catalog asks GitHub about only the stalest ASK of them; the rest come from the snapshot. With the catalog cached
// a minute, the whole shelf is re-read every few minutes. A request that fails outright (not a 404) keeps what was known.
export const ASK = 18;
export async function catalog(shelf = SHELF, get = fetch, bucket = null, memo = null, ask = memo ? ASK : Infinity) {
  const wanted = shelf.apps.filter((a) => ID.test(a.id || "") && a.release && a.file && !soon(a));
  let snap = {}, fresh = false;
  if (memo) try { const s = await memo.get(); if (s && typeof s === "object") snap = s; } catch { snap = {}; }
  // the ones to ask GitHub about this time: never asked first, then the longest ago
  const asked = new Set(wanted.map((a) => [a.id, (snap[a.id] && snap[a.id].at) || 0]).sort((x, y) => x[1] - y[1]).slice(0, ask).map((x) => x[0]));
  const now = Date.now();
  const builds = Object.fromEntries(await Promise.all(wanted.map(async (a) => {
    try { // the APK goes up before its details, so details in R2 mean the APK is there too
      const o = bucket && (await bucket.get(r2Key(a, ".json")));
      const b = o && build(a, await o.json());
      if (b) return [a.id, { b, apk: SITE + "/store/apk/" + a.id }];
    } catch { /* not in R2: GitHub */ }
    let b = snap[a.id] ? snap[a.id].b || null : null;
    if (asked.has(a.id)) try {
      const r = await get(RELEASES + a.release + "/" + a.file + ".json", { cf: { cacheTtl: 90, cacheEverything: true } });
      b = r.ok ? build(a, await r.json().catch(() => null)) : null; snap[a.id] = { at: now, b }; fresh = true;
    } catch { /* couldn't ask (a network error, or the visit's requests ran out): keep what was known */ }
    return [a.id, b ? { b, apk: apkUrl(a) } : null];
  })));
  if (memo && fresh) try { await memo.put(Object.fromEntries(wanted.filter((a) => snap[a.id]).map((a) => [a.id, snap[a.id]]))); } catch { /* next time */ }
  const apps = shelf.apps.filter((a) => ID.test(a.id || "")).map((a) => {
    const x = builds[a.id];
    return x ? { ...pick(a, PUBLIC), ...x.b, apk: x.apk, available: true } : { ...pick(a, PUBLIC), available: false };
  });
  const updated = apps.map((a) => a.built || "").sort().pop() || null;
  return { name: "Foundry", store: "org.mentifaber.store", updated, apps };
}

// The store's routes; null when the path isn't the store's.
export async function store(req, ctx, shelf = SHELF, get = fetch, bucket = null, memo = null) {
  const path = new URL(req.url).pathname;
  if (path === "/store/catalog.json") {
    const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(new URL(req.url).origin + "/store/catalog.json");
    const hit = cache && (await cache.match(key));
    if (hit) return hit;
    const res = new Response(JSON.stringify(await catalog(shelf, get, bucket, memo)), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  const m = path === "/store.apk" ? ["", "org.mentifaber.store"] : path.match(/^\/store\/apk\/([\w.]+)$/);
  if (m) {
    const a = shelf.apps.find((x) => x.id === m[1] && x.release && x.file && !soon(x));
    if (!a) return new Response("No such app in Foundry.", { status: 404, headers: { "content-type": "text/plain" } });
    const o = bucket && (await (req.method === "HEAD" ? bucket.head(r2Key(a, ".apk")) : bucket.get(r2Key(a, ".apk"))).catch(() => null));
    if (o) return new Response(req.method === "HEAD" ? null : o.body, { headers: { "content-type": "application/vnd.android.package-archive", "content-length": String(o.size), "content-disposition": 'attachment; filename="' + a.file + '.apk"', etag: o.httpEtag, "cache-control": "public, max-age=300" } });
    return new Response(null, { status: 302, headers: { location: apkUrl(a), "cache-control": "public, max-age=300" } });
  }
  return null;
}
