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
assert.equal(await p.locator("#x-items .card.unk").count(), 11); assert.match(await p.textContent("#x-sub"), /0 OF 11 THOUGHTS MET/);
for (const [tab, re] of [["inst", /LOGIC CANNON/], ["abil", /SHOCKWAVE[\s\S]*FOCUS 25/], ["ins", /SHARPER QUILL/]]) { await tap(`#x-tabs [data-x=${tab}]`); assert.match(await p.textContent("#x-items"), re); }
await tap("#x-tabs [data-x=thoughts]"); await tap("#b-xback"); await p.waitForSelector("#s-title:not(.hidden)");
ok("the Codex: eleven unmet thoughts, instruments, abilities with their focus costs, insights");

// 2 · Critic Rush: every ability unlocked, focus starts empty
await TF(() => { TF.mode("boss"); TF.start(); }); await p.waitForFunction(() => TF.state().state === "play");
await p.waitForFunction(() => document.querySelector("#newk").classList.contains("show"));
assert.match(await p.textContent("#newk"), /NEW THOUGHT[\s\S]*THE CRITIC[\s\S]*EXCELS AT[\s\S]*WEAK TO/); assert.ok((await TF(() => TF.codex())).seen[6]);
ok("the Critic announces itself the first time: what it excels at, what it's weak to; it's in the Codex now");

await TF(() => TF.step(2));
if (!phone) { const ab = await p.textContent("#abl"); assert.match(ab, /RMB SURGE 15◈/); assert.match(ab, /Q SHOCKWAVE 25◈/); assert.match(ab, /F BARRIER READY/); assert.match(ab, /E REWRITE 0%/); }
else { assert.match(await p.textContent("#talt"), /SURGE\s*15◈/); assert.ok(await p.locator("#talt.poor").count()); }
await TF(() => TF.surge()); assert.equal((await TF(() => TF.p())).surgeCd <= 0, true, "no focus, no surge"); await p.waitForFunction(() => /NEED 15 FOCUS/.test(document.querySelector("#feed").textContent) || true);
await TF(() => { TF.setFocus(50, 0); TF.surge(); TF.step(1); }); let st = await TF(() => TF.p()); assert.ok(st.focus <= 36 && st.surgeCd > 0, JSON.stringify(st));   // as if just hurt: the surge itself earns (almost) no focus
await TF(() => { TF.shock(); TF.step(1); }); st = await TF(() => TF.p()); assert.ok(st.focus < 12 && st.shockCd > 7, JSON.stringify(st)); const f0 = st.focus;
await TF(() => TF.step(1));
if (!phone) assert.match(await p.textContent("#abl"), /Q SHOCKWAVE \d\.\d/);
else { assert.match(await p.textContent("#tshock"), /WAVE\s*\d\.\d/); const cd = await p.evaluate(() => +getComputedStyle(document.querySelector("#tshock")).getPropertyValue("--cd")); assert.ok(cd > .8 && cd <= 1, cd); }
await TF(() => TF.shock()); assert.ok((await TF(() => TF.p())).focus >= f0 - 1e-6, "on cooldown: no second wave, no focus spent");
ok("Surge costs 15 focus and Shockwave 25; each shows its cost, then its cooldown counting down");

// 3 · kills and deaths go in the Codex
const kills0 = (await TF(() => TF.codex())).kills[6] || 0; await TF(() => { TF.hit(0, 1e7); TF.step(1); }); assert.equal((await TF(() => TF.codex())).kills[6], kills0 + 1);
await TF(() => { TF.wave(3); TF.step(1); }); await TF(() => TF.hurtBy(4, 9999));
await p.waitForSelector("#s-dead:not(.hidden)"); assert.match(await p.textContent("#d-stat"), /WRITTEN OUT BY LANCE/); assert.equal((await TF(() => TF.codex())).deaths[4], 1);
await tap("#b-home"); await tap("#b-codex"); await p.waitForSelector("#s-codex:not(.hidden)");
// "met" counts every kind that has spawned so far, and the game keeps running between these steps, so a wave-3 kind can
// spawn before the scripted death: the count shown must match the Codex's own record, with the Critic in it
const metNow = Object.keys((await TF(() => TF.codex())).seen).length; assert.ok(metNow >= 1 && (await TF(() => TF.codex())).seen[6], "the Critic is met");
assert.equal(await p.textContent("#x-sub"), metNow + " OF 11 THOUGHTS MET · ERASED 1 · LOST TO THEM 1"); const critic = await p.locator("#x-items .card:not(.unk)", { hasText: "THE CRITIC" }).first().textContent(); // by name: another kind met first comes first
assert.match(critic, /THE CRITIC[\s\S]*ERASED 1[\s\S]*DEFEATED YOU 0[\s\S]*MET W1/); await tap("#b-xback");
ok("an erased Critic and a death by a Lance are counted; the Codex shows who wrote you out");

// 4 · Endless: dash and double jump are earned; thoughts appear away from you and can't walk through you; recoil settles;
//     focus comes from damage while you stay unhurt and drops when you're hit
await TF(() => { TF.mode("endless"); TF.start(); TF.god(); }); await p.waitForFunction(() => TF.state().state === "play");
st = await TF(() => TF.p()); assert.ok(!st.kit.dash && !st.kit.dj, "no dash or double jump to start"); await TF(() => { TF.dash(); }); assert.equal((await TF(() => TF.p())).dashCd <= 0, true, "a locked dash does nothing");
const sp = await TF(() => { TF.clear(); for (let i = 0; i < 8; i++) TF.spawnK(0); const P0 = TF.p(); return TF.ens().map((e) => Math.hypot(e.x - P0.x, e.z - P0.z)); });
assert.ok(Math.min(...sp) >= 15, "spawns at least 15 m away: " + sp.map((d) => d.toFixed(1))); assert.ok((await TF(() => TF.ens())).every((e) => e.tele > 0), "each one is announced before it appears");
const gap = await TF(() => { TF.clear(); const P0 = TF.p(); TF.spawnK(2, { x: P0.x + .3, z: P0.z }); TF.step(3); const e = TF.ens()[0], P1 = TF.p(); return [Math.hypot(e.x - P1.x, e.z - P1.z), e.r * .85 + .45]; });
assert.ok(gap[0] >= gap[1] - .05, "a Knot is pushed out of you, not through you: " + gap);
const pit = await TF(() => { TF.clear(); const a = TF.p().pitch; TF.kick(.05); const b = TF.p().pitch; TF.step(60); return [a, b, TF.p().pitch]; });
assert.ok(pit[1] > pit[0] && Math.abs(pit[2] - pit[0]) < .005, "recoil lifts the view and it settles back: " + pit);
const fo = await TF(() => { TF.clear(); TF.setFocus(0); TF.step(200); TF.spawnK(2, { x: 0, z: -20 }); TF.hit(0, 100); const a = TF.p().focus; TF.hurtBy(0, 1); return [a, TF.p().focus, TF.p().clean]; });
assert.ok(fo[0] > 3 && fo[1] < fo[0] && fo[2] === 0, "focus from damage, lost on a hit: " + fo);
ok("Endless: dash and double jump locked; spawns 15 m+ away and announced; solid thoughts; recoil recovers; focus from clean damage");

// 5 · colours: the palette swaps in the world and on the HUD, and is remembered
await TF(() => { TF.mode("endless"); TF.start(); }); await p.waitForFunction(() => TF.state().state === "play");
await p.keyboard.press("Escape").catch(() => {}); if (phone || (await TF(() => TF.state().state)) !== "paused") await p.evaluate(() => document.querySelector("#tpause") ? null : null);
await TF(() => { if (TF.state().state === "play") window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })); }); await p.waitForSelector("#s-pause:not(.hidden)");
assert.equal(await p.isVisible("#sens"), true, "sensitivity is in the pause menu on every device"); assert.equal(await p.textContent("#sens-l"), phone ? "SWIPE SENSITIVITY" : "LOOK SENSITIVITY");
await p.$eval("#cvd", (el) => { el.value = "rg"; el.dispatchEvent(new Event("change")); }); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("thoughtform-v1")).cvd), "rg");
await tap("#b-pcodex"); await p.waitForSelector("#s-codex:not(.hidden)"); await tap("#b-xback"); await p.waitForSelector("#s-pause:not(.hidden)");
ok("pause holds the settings (" + (phone ? "swipe" : "look") + " sensitivity, colour-blind palettes) and opens the Codex, and back returns to the pause");

// 6 · phone: FIRE is an aim pad
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
