// The Foundry's catalog (src/store.js): the shelf (android/apps.json) joined with each app's latest signed build
// from its GitHub release. Only complete, release-signed builds of the right app are offered; build-only fields stay private.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const { S, SHELF, REPO } = await import("./store-load.mjs");
const sha = "ab".repeat(32);
const good = (id, extra = {}) => ({ id, versionCode: 142, versionName: "1.0.42", size: 581632, sha256: sha, minSdk: 24, targetSdk: 34, cert: "B4:DC", signed: "release", commit: "abc", built: "2026-10-24T02:00:00Z", changes: ["Store: first release"], permissions: ["android.permission.INTERNET"], ...extra });
const fake = (builds, seen = []) => async (u) => { seen.push(u); const k = u.split("/download/")[1]; const b = builds[k]; if (b instanceof Error) throw b; return b === undefined ? new Response("Not Found", { status: 404 }) : new Response(typeof b === "string" ? b : JSON.stringify(b), { status: 200 }); };

// 1 · the shelf itself is sound: every app built here is the package its folder builds, with an icon that exists
const ids = new Set();
for (const a of SHELF.apps) {
  assert.match(a.id, /^[a-z][\w]*(\.[a-z][\w]*)+$/); assert.ok(!ids.has(a.id), "duplicate " + a.id); ids.add(a.id);
  assert.ok(a.name && a.tagline && a.description && a.category, a.id + " needs words");
  assert.ok(existsSync(REPO + a.icon), a.id + " icon " + a.icon);
  if (a.prebuilt) { assert.ok(existsSync(REPO + "/" + a.prebuilt), a.id + " prebuilt " + a.prebuilt); assert.ok(a.release && /^[\w-]+$/.test(a.file), a.id + " release/file"); }
  if (a.twa) {   // one of the site's web apps, built from the shared template: its page, both logo sizes, a package of its own
    assert.ok(!a.dir && !a.prebuilt, a.id + " is built one way"); assert.ok(existsSync(REPO + a.twa + ".html"), a.id + " page " + a.twa);
    assert.ok(existsSync(REPO + a.icon.replace("-512.png", "-192.png")), a.id + " launcher icon"); assert.match(a.bg || "", /^#[0-9a-f]{6}$/i, a.id + " colour");
    assert.ok(a.release && /^[\w-]+$/.test(a.file), a.id + " release/file");
  }
  if (a.dir) {
    const g = readFileSync(REPO + "/" + a.dir + "/app/build.gradle.kts", "utf8");
    assert.match(g, new RegExp('applicationId = "' + a.id.replace(/\./g, "\\.") + '"'), a.dir + " builds " + a.id);
    assert.match(g, /keyAlias = "autofaber"/, a.dir + " signs with the release key"); assert.ok(a.release && /^[\w-]+$/.test(a.file), a.id + " release/file");
  }
}
assert.ok(ids.has("org.mentifaber.store") && ids.has("org.mentifaber.autofaber") && ids.has("org.mentifaber.mentiplayer"));
const tpl = readFileSync(REPO + "/android/webapp/app/build.gradle.kts", "utf8"); assert.match(tpl, /applicationId = appId/); assert.match(tpl, /keyAlias = "autofaber"/);
const wf = readFileSync(REPO + "/.github/workflows/android.yml", "utf8"); assert.match(wf, /ORG_GRADLE_PROJECT_appId: \$\{\{ matrix\.app\.id \}\}/); assert.match(wf, /select\(\.dir or \.prebuilt or \.twa\)/);
assert.ok(SHELF.apps.filter((a) => a.twa).length >= 30 && SHELF.apps.some((a) => a.id === "org.mentifaber.thoughtform"));
ok("the shelf lists " + SHELF.apps.length + " apps; each one built here is the package its folder builds (the web apps from one template, each its own package), signed with the release key");

// 2 · the catalog joins words and builds
let seen = [];
let c = await S.catalog(SHELF, fake({ "autofaber-android/AutoFaber.json": good("org.mentifaber.autofaber"), "mentifaber-store/MentifaberStore.json": good("org.mentifaber.store", { versionCode: 150, built: "2026-10-25T00:00:00Z" }) }, seen));
assert.equal(c.apps.length, SHELF.apps.length); const af = c.apps.find((a) => a.id === "org.mentifaber.autofaber");
assert.equal(af.available, true); assert.equal(af.versionCode, 142); assert.equal(af.sha256, sha); assert.equal(af.name, "AutoFaber");
assert.equal(af.apk, "https://github.com/mentifaber/mentifaber.github.io/releases/download/autofaber-android/AutoFaber.apk");
for (const k of ["dir", "release", "file", "signed", "id2"]) assert.ok(!(k in af), k + " leaked");
assert.equal(c.updated, "2026-10-25T00:00:00Z"); assert.equal(c.store, "org.mentifaber.store");
assert.ok(seen.every((u) => u.startsWith(S.RELEASES) && u.endsWith(".json")));
ok("each app gets its latest build's version, size, checksum and download; where it's built from stays private");

// 3 · anything less than a complete, signed build of the right app is not offered
const bad = { missing: undefined, wrongId: good("org.evil.app"), testKey: good("org.mentifaber.autofaber", { signed: "test" }), noSha: good("org.mentifaber.autofaber", { sha256: "xyz" }), zero: good("org.mentifaber.autofaber", { versionCode: 0 }), notJson: "<html>", down: new Error("refused") };
for (const [k, b] of Object.entries(bad)) {
  c = await S.catalog(SHELF, fake({ "autofaber-android/AutoFaber.json": b }));
  const a = c.apps.find((x) => x.id === "org.mentifaber.autofaber");
  assert.equal(a.available, false, k); assert.ok(!a.apk && !a.sha256, k); assert.equal(a.name, "AutoFaber", k);
}
ok("no build, another app's build, a test-key build, a broken checksum, a bad version, junk or a dead link: the app shows, but can't be installed");

// 4 · routes
const ctx = { waitUntil() {} }, req = (p) => new Request("https://mentifaber.org" + p);
let r = await S.store(req("/store/catalog.json"), ctx, SHELF, fake({ "autofaber-android/AutoFaber.json": good("org.mentifaber.autofaber") }));
assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /json/); assert.match(r.headers.get("cache-control"), /max-age=60/); assert.equal(r.headers.get("access-control-allow-origin"), "*");
assert.equal((await r.json()).apps.find((a) => a.id === "org.mentifaber.autofaber").available, true);
r = await S.store(req("/store.apk"), ctx, SHELF); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), S.RELEASES + "mentifaber-store/MentifaberStore.apk");
r = await S.store(req("/store/apk/org.mentifaber.autofaber"), ctx, SHELF); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), S.RELEASES + "autofaber-android/AutoFaber.apk");
r = await S.store(req("/store/apk/org.nope.app"), ctx, SHELF); assert.equal(r.status, 404);
assert.equal(await S.store(req("/store/apk/../../x"), ctx, SHELF), null); assert.equal(await S.store(req("/store"), ctx, SHELF), null); assert.equal(await S.store(req("/store/"), ctx, SHELF), null);
ok("/store/catalog.json, /store.apk and /store/apk/<id> answer; anything else under /store is left to the page");

// 5 · the Worker routes to it, and the Foundry app is vouched for at mentifaber.org/store
const w = readFileSync(REPO + "/src/worker.js", "utf8"); assert.match(w, /import \{ store as storeRoutes \} from "\.\/store\.js"/); assert.match(w, /path === "\/store\.apk" \|\| path\.startsWith\("\/store\/"\)/);
const links = JSON.parse(readFileSync(REPO + "/.well-known/assetlinks.json", "utf8")); assert.deepEqual(links.map((l) => l.target.package_name).sort(), ["org.mentifaber.autofaber", "org.mentifaber.mentiplayer", "org.mentifaber.store", ...SHELF.apps.filter((a) => a.twa).map((a) => a.id)].sort());
assert.equal(new Set(links.map((l) => l.target.sha256_cert_fingerprints[0])).size, 1);
const man = readFileSync(REPO + "/android/store/app/src/main/AndroidManifest.xml", "utf8"); for (const p of ["REQUEST_INSTALL_PACKAGES", "UPDATE_PACKAGES_WITHOUT_USER_ACTION", "QUERY_ALL_PACKAGES"]) assert.match(man, new RegExp(p));
const inst = readFileSync(REPO + "/android/store/app/src/main/java/org/mentifaber/store/Installer.java", "utf8"); assert.match(inst, /hex\(md\.digest\(\)\)\.equals\(a\.sha256\)/); assert.match(inst, /a\.id\.equals\(apk\.packageName\)/); assert.match(inst, /Collections\.disjoint\(theirs, ours\)/);
const br = readFileSync(REPO + "/android/store/app/src/main/java/org/mentifaber/store/MainActivity.java", "utf8"); assert.match(br, /addWebMessageListener\(web, "MentiStore", Collections\.singleton\(ORIGIN\)/); assert.match(br, /ORIGIN = "https:\/\/mentifaber\.org"/);
const wr = JSON.parse(readFileSync(REPO + "/wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "")); for (const r of ["/store/*", "/store.apk", "/autofaber.apk"]) assert.ok(wr.assets.run_worker_first.includes(r), r + " must reach the Worker: unmatched paths get the 404 page, not the Worker");
ok("the Worker serves the store (its paths are routed to it first); every app that opens mentifaber.org full screen shares one signing key in assetlinks; Foundry checks checksum, package and signer, and talks only to mentifaber.org");
