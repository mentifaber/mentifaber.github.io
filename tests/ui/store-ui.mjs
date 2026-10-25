// The Foundry's storefront in Chromium, against the real catalog code (src/store.js) with builds faked.
// In a browser: the shelf, details, search, the APK downloads, hostile text kept as text. Inside the Foundry app (window.MentiStore
// faked the way the Android app answers): install, update with progress, the one-time "install apps" permission, open,
// uninstall, Foundry updating itself, update settings.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
const { S, SHELF } = await import("../gtest/store-load.mjs");
const sha = "cd".repeat(32);
const build = (id, vc, extra = {}) => ({ id, versionCode: vc, versionName: "1.0." + (vc - 100), size: 2_400_000, sha256: sha, minSdk: 24, targetSdk: 34, cert: "B4:DC:86", signed: "release", built: "2026-10-24T02:00:00Z", changes: ["Faster installs", "<b>bold</b> change"], permissions: ["android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS", "androidx.x.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"], ...extra });
// the hand-built apps and two test ones (the site's web apps, "twa", are checked on their own at the end)
const shelf = { apps: [...SHELF.apps.filter((a) => !a.twa), { id: "org.mentifaber.testapp", name: "Test <img src=x onerror=window.__x=1>", category: "Play", tagline: "A test app", description: "One.\n\nTwo.", icon: "/assets/icons/v2/store-512.png", release: "t", file: "T" }, { id: "org.mentifaber.later", name: "Later", category: "Tools", tagline: "Not built yet", description: "Soon.", icon: "/assets/icons/v2/store-512.png", release: "l", file: "L" }] };
const builds = { "autofaber-android/AutoFaber.json": build("org.mentifaber.autofaber", 142), "mentifaber-store/MentifaberStore.json": build("org.mentifaber.store", 150), "t/T.json": build("org.mentifaber.testapp", 120, { minSdk: 26 }) };
const cat = await S.catalog(shelf, async (u) => { const b = builds[u.split("/download/")[1]]; return b ? new Response(JSON.stringify(b)) : new Response("", { status: 404 }); });

const b = await chromium.launch({ args: ["--no-proxy-server"] });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const mk = async (bridge, ua) => {
  const c = await b.newContext({ viewport: DEV === "mobile" || ua ? { width: 390, height: 844 } : { width: 1280, height: 860 }, isMobile: DEV === "mobile" || !!ua, hasTouch: DEV === "mobile" || !!ua, serviceWorkers: "block",
    userAgent: ua || (DEV === "mobile" ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36" : undefined) });
  await c.route(/\/store\/catalog\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cat) }));
  await c.route(/^(?!http:\/\/localhost:8099)/, (r) => r.abort());
  if (bridge) await c.addInitScript(({ vc }) => {
    // the Foundry app, as the page sees it: replies and events over one message channel
    const st = window.__st = { inst: { "org.mentifaber.autofaber": 141, "org.mentifaber.store": 140 }, can: true, auto: true, calls: [] };
    const send = (m, d = 0) => setTimeout(() => window.MentiStore.onmessage && window.MentiStore.onmessage({ data: JSON.stringify(m) }), d);
    const info = () => ({ version: "1.0.40", sdk: 34, canInstall: st.can, silent: true, auto: st.auto, notify: true, package: "org.mentifaber.store" });
    window.__resume = () => send({ type: "resume", id: "org.mentifaber.store" });
    window.MentiStore = { onmessage: null, postMessage(s) {
      const m = JSON.parse(s); st.calls.push([m.op, m.id || (m.op === "auto" ? m.on : "")]); let data = true;
      if (m.op === "hello") data = info();
      else if (m.op === "installed") { data = {}; for (const id of m.ids) data[id] = st.inst[id] ? { versionCode: st.inst[id], versionName: "1.0." + (st.inst[id] - 100) } : null; }
      else if (m.op === "auto") { st.auto = m.on; data = info(); }
      else if (m.op === "install") {
        if (!st.can) { send({ type: "permission", id: m.id }); data = false; }
        else { [["download", 0], ["download", 45], ["verify"], ["install"]].forEach(([phase, pct], i) => send({ type: "progress", id: m.id, phase, pct }, 80 + i * 120));
          setTimeout(() => { st.inst[m.id] = vc[m.id]; send({ type: "done", id: m.id, ok: true, msg: "Installed" }); send({ type: "changed", id: m.id }, 30); }, 700); }
      }
      send({ type: "reply", req: m.req, data }, 5);
    } };
  }, { vc: Object.fromEntries(cat.apps.filter((a) => a.available).map((a) => [a.id, a.versionCode])) });
  const p = await c.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  return { c, p, errs };
};
const ok = (m) => console.log("ok", DEV, m), URL = "http://localhost:8099/store.html";

// ---- in a browser ----
{
  const { c, p, errs } = await mk(false);
  await p.goto(URL); await p.waitForSelector(".list .row");
  assert.equal(await p.locator(".list .row").count(), 6); assert.equal(await p.isVisible("#tabs a[data-v=updates]"), false);
  assert.match(await p.textContent(".hero h1"), /AutoFaber/);
  if (DEV === "mobile") { assert.equal(await p.getAttribute(".getit .btn.pri", "href"), "/store.apk"); assert.equal(await p.locator(".row a.btn.pri[href='/store.apk']").count(), 3); }
  else { assert.match(await p.textContent(".getit h2"), /on your Android phone/); assert.equal(await p.locator(".row .pill", { hasText: "Android app" }).count(), 3); }
  assert.equal(await p.locator(".row .pill", { hasText: "Coming soon" }).count(), 3);
  assert.equal(await p.evaluate(() => window.__x), undefined); assert.ok(await p.locator(".row b", { hasText: "Test <img" }).count());
  ok("the shelf: featured app, six apps, three not built yet; Foundry download on a phone, a pointer to the phone elsewhere; hostile names stay text");

  await p.fill("#q", "swarm"); await p.waitForFunction(() => document.querySelectorAll(".list .row").length === 1); assert.match(await p.textContent(".list .row b"), /AutoFaber/);
  await p.fill("#q", "zzzz"); await p.waitForSelector(".empty"); await p.fill("#q", "");
  if (await p.locator(".chips").count()) { await p.click(".chips button[data-cat=Play]"); assert.equal(await p.locator(".list .row").count(), 1); await p.click(".chips button[data-cat='']"); }
  ok("search and categories narrow the shelf");

  await p.click(".list .row:first-child .rlink"); await p.waitForSelector(".dhead");
  assert.match(p.url(), /#app\/org\.mentifaber\.autofaber$/); assert.match(await p.textContent(".dhead h1"), /AutoFaber/);
  const stats = await p.textContent(".stats"); assert.match(stats, /1\.0\.42/); assert.match(stats, /2\.3 MB/); assert.match(stats, /Android 7\.0\+/);
  assert.match(await p.textContent(".safe"), new RegExp(sha)); assert.match(await p.textContent(".perms"), /Use the internet/); assert.doesNotMatch(await p.textContent(".perms"), /dynamic receiver/i);
  assert.ok(await p.locator(".changes li", { hasText: "<b>bold</b> change" }).count()); assert.equal(await p.locator(".changes b").count(), 0);
  if (DEV === "mobile") assert.equal(await p.getAttribute(".dact a[download]", "href"), "https://github.com/mentifaber/mentifaber.github.io/releases/download/autofaber-android/AutoFaber.apk");
  assert.match(await p.title(), /AutoFaber · Foundry/);
  await p.goBack(); await p.waitForSelector(".hero");
  await p.click("#tabs a[data-v=about]"); assert.match(await p.textContent(".prose"), /SHA-256/);
  ok("an app's page: version, size, Android version, checksum, what's new and what it can do, in plain words; the APK alone on a phone");
  assert.deepEqual(errs, []); await c.close();
}

// ---- inside the Foundry app ----
{
  const { c, p, errs } = await mk(true);
  await p.goto(URL); await p.waitForSelector(".list .row"); await p.waitForFunction(() => document.querySelector("#ucount") && !document.querySelector("#ucount").hidden);
  assert.equal(await p.isVisible("#tabs a[data-v=updates]"), true); assert.equal(await p.textContent("#ucount"), "2");
  assert.equal(await p.isVisible("#selfup"), true); assert.match(await p.textContent("#selfup"), /new version of Foundry/);
  assert.equal(await p.locator(".getit").count(), 0);
  const btn = (id) => p.locator(`.list [data-act="${id}"] .btn`).first();
  assert.equal(await btn("org.mentifaber.autofaber").textContent(), "Update"); assert.equal(await btn("org.mentifaber.testapp").textContent(), "Install");
  ok("in the app: two updates waiting (one is Foundry itself, shown up top), the rest marked Install");

  await btn("org.mentifaber.autofaber").click(); await p.waitForSelector('.list [data-act="org.mentifaber.autofaber"] .prog');
  await p.waitForFunction(() => /Downloading · 45%|Checking|Installing/.test(document.querySelector('.list [data-act="org.mentifaber.autofaber"]').textContent));
  await p.waitForFunction(() => { const b = document.querySelector('.list [data-act="org.mentifaber.autofaber"] .btn'); return b && b.textContent === "Open"; });
  assert.match(await p.textContent("#toast"), /AutoFaber is installed/); assert.equal(await p.textContent("#ucount"), "1");
  ok("Update shows download progress, the signature check and the install, then turns into Open");

  await p.evaluate(() => { window.__st.can = false; }); await btn("org.mentifaber.testapp").click();
  await p.waitForFunction(() => /Allow from this source/.test(document.querySelector("#toast").textContent));
  assert.equal(await btn("org.mentifaber.testapp").textContent(), "Install");
  await p.evaluate(() => { window.__st.can = true; window.__resume(); });
  await p.waitForFunction(() => { const b = document.querySelector('.list [data-act="org.mentifaber.testapp"] .btn'); return b && b.textContent === "Open"; });
  ok("the first install asks for Android's “install apps” switch, then carries on by itself on return");

  await btn("org.mentifaber.testapp").click(); await p.waitForFunction(() => window.__st.calls.some(([o, id]) => o === "open" && id === "org.mentifaber.testapp"));
  await p.click("#selfup .btn"); await p.waitForFunction(() => window.__st.calls.some(([o, id]) => o === "install" && id === "org.mentifaber.store"));
  await p.waitForFunction(() => document.querySelector("#selfup").hidden && document.querySelector("#ucount").hidden);
  ok("Open hands over to the app; Foundry updates itself from the banner, and the update count clears");

  await p.click("#tabs a[data-v=installed]"); await p.waitForSelector(".shelf h2:has-text(\"Installed\")"); assert.equal(await p.locator(".list .row").count(), 3);
  await p.click("#tabs a[data-v=updates]"); await p.waitForSelector(".settings"); assert.match(await p.textContent(".shelf h2"), /all up to date/);
  await p.click(".sw input#auto", { force: true }); await p.waitForFunction(() => window.__st.auto === false);
  await p.goto(URL + "#app/org.mentifaber.autofaber"); await p.waitForSelector(".dact .btn");
  await p.click(".dact .btn:has-text('Uninstall')"); await p.waitForFunction(() => window.__st.calls.some(([o, id]) => o === "uninstall" && id === "org.mentifaber.autofaber"));
  assert.equal(await p.locator(".dact a[download]").count(), 0);
  ok("Installed lists what's on the phone, Updates holds the settings (auto-update can be turned off), and an app's page can uninstall it");
  assert.equal(await p.evaluate(() => window.__x), undefined);
  if (process.env.SHOTS) await p.screenshot({ path: "tests/ui/shots/store-" + DEV + ".png" });
  assert.deepEqual(errs, []); await c.close();
}
// ---- on an iPhone: Home Screen apps instead of APKs ----
{
  const { c, p, errs } = await mk(false, IPHONE);
  await p.goto(URL); await p.waitForSelector(".list .row");
  assert.match(await p.textContent(".getit h2"), /Put Foundry on your Home Screen/);
  assert.equal(await p.locator(".list .row").count(), 5, "Foundry itself isn't listed on iPhone");
  assert.equal(await p.locator(".list .row .btn.pri", { hasText: "Get" }).count(), 2, "the two web apps");
  assert.equal(await p.locator(".row .pill", { hasText: "Android only for now" }).count(), 3);
  assert.equal(await p.locator("a[href='/store.apk'], a[download]").count(), 0, "no APKs offered on iPhone");
  await p.click('.list [data-act="org.mentifaber.autofaber"] .btn'); await p.waitForSelector("dialog#iosget[open]");
  assert.match(await p.textContent("#iosget"), /Add to Home Screen/); assert.equal(await p.getAttribute("#iosget a.btn.pri", "href"), "/hive-app"); assert.equal(await p.getAttribute("#iosget a.btn.pri", "target"), "_blank");
  await p.click("#iosget [data-close]"); await p.waitForFunction(() => !document.querySelector("dialog#iosget").open);
  await p.goto(URL + "#app/org.mentifaber.mentiplayer"); await p.waitForSelector(".dhead");
  assert.match(await p.textContent(".stats"), /Home Screen app/); assert.equal(await p.locator(".safe, .perms").count(), 0);
  await p.goto(URL + "#app/org.mentifaber.bigbuttons"); await p.waitForSelector(".dhead"); assert.match(await p.textContent(".dact"), /Android only for now/);
  ok("on iPhone: web apps install to the Home Screen with a three-step guide, Android-only apps say so, and no APKs are offered");
  if (process.env.SHOTS) { await p.goto(URL); await p.waitForSelector(".list .row"); await p.screenshot({ path: "tests/ui/shots/store-iphone.png", fullPage: true }); }
  assert.deepEqual(errs, []); await c.close();
}
// ---- the whole shelf: every web app is there with its logo, and games, science and the rest each have a category ----
{
  // every app has a build: the Coming-soon ones must still not be offered, and they come last
  const full = await S.catalog(SHELF, async (u) => { const a = SHELF.apps.find((x) => u.endsWith("/" + x.release + "/" + x.file + ".json")); return a ? new Response(JSON.stringify(build(a.id, 130))) : new Response("", { status: 404 }); });
  const soonN = SHELF.apps.filter((a) => a.status === "soon").length;
  const { c, p, errs } = await mk(false); await c.unroute(/\/store\/catalog\.json/); await c.route(/\/store\/catalog\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(full) }));
  await p.goto(URL); await p.waitForSelector(".list .row");
  assert.equal(await p.locator(".list .row").count(), SHELF.apps.length);
  const broken = await p.evaluate(async () => { const imgs = [...document.querySelectorAll(".list .row img.ico")]; await Promise.all(imgs.map((i) => (i.loading = "eager", i.decode().catch(() => {})))); return imgs.filter((i) => !i.naturalWidth).map((i) => i.src); });
  assert.deepEqual(broken, [], "every logo loads");
  await p.click(".chips button[data-cat=Games]"); const games = await p.locator(".list .row b").allTextContents(); assert.ok(games.includes("Thoughtform") && games.includes("Tether"), games.join());
  await p.click(".chips button[data-cat='']"); await p.fill("#q", "mind under siege"); await p.waitForFunction(() => document.querySelectorAll(".list .row").length === 1); assert.match(await p.textContent(".list .row b"), /Thoughtform/);
  await p.fill("#q", ""); await p.waitForFunction((n) => document.querySelectorAll(".list .row").length === n, SHELF.apps.length);
  const tail = await p.$$eval(".list .row", (rs) => rs.map((r) => r.querySelector(".ract").textContent.trim()));
  assert.equal(tail.filter((t) => t === "Coming soon").length, soonN); assert.ok(tail.slice(-soonN).every((t) => t === "Coming soon"), "Coming soon goes last: " + tail.join("|"));
  await p.click('.list .row:last-child .rlink'); await p.waitForSelector(".dhead"); assert.match(await p.textContent(".dact"), /Coming soon/); assert.match(await p.textContent(".hint"), /preview/);
  assert.equal(await p.locator(".dact a[download], .dact .btn.pri").count(), 0, "nothing to install on a Coming-soon app's page");
  await p.goto(URL + "#app/org.mentifaber.barycenter"); await p.waitForSelector(".dhead"); assert.match(await p.textContent(".hint"), /invite or its password/);
  ok("the whole shelf: " + SHELF.apps.length + " apps, every logo loads, Thoughtform under Games and found by search; the " + soonN + " Coming-soon apps are last and offer nothing to install; private apps say they need an invite");
  assert.deepEqual(errs, []); await c.close();
}
await b.close();
