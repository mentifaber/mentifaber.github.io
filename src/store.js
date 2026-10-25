// The Foundry's catalog. android/apps.json is the shelf (names, words, icons); each app's latest build publishes
// <file>.apk and <file>.json (version, size, SHA-256, signer, what changed) to its GitHub release
// (.github/workflows/android.yml). The catalog joins the two, so a new build reaches Foundry within minutes of
// publishing, with no deploy of the site.
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

// One build's details, or null. A build is only offered when its details are complete and name this app.
export function build(a, b) {
  if (!b || typeof b !== "object" || b.id !== a.id || b.signed !== "release") return null;
  if (!Number.isInteger(b.versionCode) || b.versionCode < 1 || !/^[0-9a-f]{64}$/.test(b.sha256 || "") || !(b.size > 0)) return null;
  return pick(b, BUILT);
}

export async function catalog(shelf = SHELF, get = fetch) {
  const apps = await Promise.all(shelf.apps.filter((a) => ID.test(a.id || "")).map(async (a) => {
    let b = null;
    if (a.release && a.file && !soon(a)) {
      try {
        const r = await get(RELEASES + a.release + "/" + a.file + ".json", { cf: { cacheTtl: 90, cacheEverything: true } });
        if (r.ok) b = build(a, await r.json());
      } catch { b = null; }
    }
    return b ? { ...pick(a, PUBLIC), ...b, apk: apkUrl(a), available: true } : { ...pick(a, PUBLIC), available: false };
  }));
  const updated = apps.map((a) => a.built || "").sort().pop() || null;
  return { name: "Foundry", store: "org.mentifaber.store", updated, apps };
}

// The store's routes; null when the path isn't the store's.
export async function store(req, ctx, shelf = SHELF, get = fetch) {
  const path = new URL(req.url).pathname;
  if (path === "/store/catalog.json") {
    const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(new URL(req.url).origin + "/store/catalog.json");
    const hit = cache && (await cache.match(key));
    if (hit) return hit;
    const res = new Response(JSON.stringify(await catalog(shelf, get)), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  const m = path === "/store.apk" ? ["", "org.mentifaber.store"] : path.match(/^\/store\/apk\/([\w.]+)$/);
  if (m) {
    const a = shelf.apps.find((x) => x.id === m[1] && x.release && x.file && !soon(x));
    if (!a) return new Response("No such app in Foundry.", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(null, { status: 302, headers: { location: apkUrl(a), "cache-control": "public, max-age=300" } });
  }
  return null;
}
