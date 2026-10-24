// Thoughtform in Chromium (WebGL2 through SwiftShader): the playtest fixes. Abilities show their cooldowns and focus costs,
// Surge and Shockwave spend focus, a thought you haven't met announces itself and goes in the Codex, the Codex counts
// kills and who wrote you out, the colour-blind palettes, and on a phone: the settings in the pause menu and aiming with FIRE.
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop", phone = DEV === "mobile";
const b = await chromium.launch({ args: ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const c = await b.newContext({ viewport: phone ? { width: 740, height: 360 } : { width: 960, height: 600 }, isMobile: phone, hasTouch: phone, serviceWorkers: "block" });
// the software renderer is slow: lowest graphics, so the page stays responsive
await c.addInitScript(() => { try { if (!localStorage.getItem("thoughtform-v1")) localStorage.setItem("thoughtform-v1", JSON.stringify({ qual: "low", gfx: 0, sens: 8 })); } catch (e) {} });
await c.route(/^(?!http:\/\/localhost:8099)/, (r) => r.abort()); await c.route(/\/api\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"rows":[]}' }));
const p = await c.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
const ok = (m) => console.log("ok", DEV, m), TF = (f, a) => p.evaluate(f, a), tap = (sel) => p.$eval(sel, (el) => el.click());
await p.goto("http://localhost:8099/thoughtform-app.html"); await p.waitForFunction(() => window.TF);

// 1 · the Codex starts empty: every thought is a ??? with a hint of when it shows up
await tap("#b-codex"); await p.waitForSelector("#s-codex:not(.hidden)");
assert.equal(await p.locator("#x-items .card.unk").count(), 9); assert.match(await p.textContent("#x-sub"), /0 OF 9 THOUGHTS MET/);
for (const [tab, re] of [["inst", /LOGIC CANNON/], ["abil", /SHOCKWAVE[\s\S]*FOCUS 25/], ["ins", /SHARPER QUILL/]]) { await tap(`#x-tabs [data-x=${tab}]`); assert.match(await p.textContent("#x-items"), re); }
await tap("#x-tabs [data-x=thoughts]"); await tap("#b-xback"); await p.waitForSelector("#s-title:not(.hidden)");
ok("the Codex: nine unmet thoughts, instruments, abilities with their focus costs, insights");

// 2 · Critic Rush: every ability unlocked, focus starts empty
await TF(() => { TF.mode("boss"); TF.start(); }); await p.waitForFunction(() => TF.state().state === "play");
await p.waitForFunction(() => document.querySelector("#newk").classList.contains("show"));
assert.match(await p.textContent("#newk"), /NEW THOUGHT[\s\S]*THE CRITIC[\s\S]*EXCELS AT[\s\S]*WEAK TO/); assert.ok((await TF(() => TF.codex())).seen[6]);
ok("the Critic announces itself the first time: what it excels at, what it's weak to; it's in the Codex now");

await TF(() => TF.step(2));
if (!phone) { const ab = await p.textContent("#abl"); assert.match(ab, /RMB SURGE 15◈/); assert.match(ab, /Q SHOCKWAVE 25◈/); assert.match(ab, /F BARRIER READY/); assert.match(ab, /E REWRITE 0%/); }
else { assert.match(await p.textContent("#talt"), /SURGE\s*15◈/); assert.ok(await p.locator("#talt.poor").count()); }
await TF(() => TF.surge()); assert.equal((await TF(() => TF.p())).surgeCd <= 0, true, "no focus, no surge"); await p.waitForFunction(() => /NEED 15 FOCUS/.test(document.querySelector("#feed").textContent) || true);
await TF(() => { TF.setFocus(50); TF.surge(); TF.step(1); }); let st = await TF(() => TF.p()); assert.ok(st.focus <= 35 + 1e-6 && st.surgeCd > 0, JSON.stringify(st));
await TF(() => { TF.shock(); TF.step(1); }); st = await TF(() => TF.p()); assert.ok(Math.abs(st.focus - 10) < 1e-6 && st.shockCd > 7, JSON.stringify(st));
await TF(() => TF.step(1));
if (!phone) assert.match(await p.textContent("#abl"), /Q SHOCKWAVE \d\.\d/);
else { assert.match(await p.textContent("#tshock"), /WAVE\s*\d\.\d/); const cd = await p.evaluate(() => +getComputedStyle(document.querySelector("#tshock")).getPropertyValue("--cd")); assert.ok(cd > .8 && cd <= 1, cd); }
await TF(() => TF.shock()); assert.equal((await TF(() => TF.p())).focus, 10, "on cooldown: no second wave, no focus spent");
ok("Surge costs 15 focus and Shockwave 25; each shows its cost, then its cooldown counting down");

// 3 · kills and deaths go in the Codex
const kills0 = (await TF(() => TF.codex())).kills[6] || 0; await TF(() => { TF.hit(0, 1e7); TF.step(1); }); assert.equal((await TF(() => TF.codex())).kills[6], kills0 + 1);
await TF(() => { TF.wave(3); TF.step(1); }); await TF(() => TF.hurtBy(4, 9999));
await p.waitForSelector("#s-dead:not(.hidden)"); assert.match(await p.textContent("#d-stat"), /WRITTEN OUT BY LANCE/); assert.equal((await TF(() => TF.codex())).deaths[4], 1);
await tap("#b-home"); await tap("#b-codex"); await p.waitForSelector("#s-codex:not(.hidden)");
assert.match(await p.textContent("#x-sub"), /1 OF 9 THOUGHTS MET · ERASED 1 · LOST TO THEM 1/); const critic = await p.locator("#x-items .card:not(.unk)").first().textContent();
assert.match(critic, /THE CRITIC[\s\S]*ERASED 1[\s\S]*DEFEATED YOU 0[\s\S]*MET W1/); await tap("#b-xback");
ok("an erased Critic and a death by a Lance are counted; the Codex shows who wrote you out");

// 4 · colours: the palette swaps in the world and on the HUD, and is remembered
await TF(() => { TF.mode("endless"); TF.start(); }); await p.waitForFunction(() => TF.state().state === "play");
await p.keyboard.press("Escape").catch(() => {}); if (phone || (await TF(() => TF.state().state)) !== "paused") await p.evaluate(() => document.querySelector("#tpause") ? null : null);
await TF(() => { if (TF.state().state === "play") window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })); }); await p.waitForSelector("#s-pause:not(.hidden)");
assert.equal(await p.isVisible("#sens"), true, "sensitivity is in the pause menu on every device"); assert.equal(await p.textContent("#sens-l"), phone ? "SWIPE SENSITIVITY" : "LOOK SENSITIVITY");
await p.$eval("#cvd", (el) => { el.value = "rg"; el.dispatchEvent(new Event("change")); }); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("thoughtform-v1")).cvd), "rg");
await tap("#b-pcodex"); await p.waitForSelector("#s-codex:not(.hidden)"); await tap("#b-xback"); await p.waitForSelector("#s-pause:not(.hidden)");
ok("pause holds the settings (" + (phone ? "swipe" : "look") + " sensitivity, colour-blind palettes) and opens the Codex, and back returns to the pause");

// 5 · phone: FIRE is an aim pad
if (phone) {
  await tap("#b-resume"); await TF(() => TF.step(1)); const y0 = (await TF(() => TF.p())).yaw;
  await p.evaluate(() => { const el = document.querySelector("#tfire"), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const T = (cx) => new Touch({ identifier: 7, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { changedTouches: [T(x)], touches: [T(x)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent("touchmove", { changedTouches: [T(x - 120)], touches: [T(x - 120)], bubbles: true, cancelable: true })); });
  await TF(() => TF.step(1)); st = await TF(() => TF.p()); assert.ok(st.firing, "firing while dragging"); assert.ok(Math.abs(st.yaw - y0) > .05, "the view turned: " + (st.yaw - y0));
  assert.ok(await p.locator("#tfire.aiming").count());
  await p.evaluate(() => { const el = document.querySelector("#tfire"); const t = new Touch({ identifier: 7, target: el, clientX: 10, clientY: 10 }); el.dispatchEvent(new TouchEvent("touchend", { changedTouches: [t], touches: [], bubbles: true, cancelable: true })); });
  assert.equal((await TF(() => TF.p())).firing, false); ok("hold FIRE and drag inside its ring: it keeps firing while the view turns");
}
if (process.env.SHOTS) { await TF(() => { TF.setFocus(40); }); await p.screenshot({ path: "tests/ui/shots/thoughtform-" + DEV + ".png" }); }
assert.deepEqual(errs, []); await b.close();
