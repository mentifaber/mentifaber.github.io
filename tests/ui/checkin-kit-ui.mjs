// The Quiet Check-in sensor kit (game plan GP-6.2) in Chromium, against the real server code (src/checkin.js): with a
// device link made, her settings give a setup file already holding her sensor link, for the room she names:
//  - an ESP32 with a PIR motion sensor, or with an LD2410 presence radar (ESPHome), or a motion sensor she already has
//    in Home Assistant; each is valid YAML, calls the link on movement and sends a heartbeat every 6 hours
//  - the link in the file really works: calling it the way the sensor would checks her in from that room
//  - it downloads under a name for the room; without a device link there's no file, only a pointer to make one
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import { execFileSync } from "node:child_process"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const { checkin } = await import(REPO + "/src/checkin.js");
const mem = new Map(); const st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvPut: async (k, v) => { mem.set(k, structuredClone(v)); }, kvDel: async (k) => mem.delete(k), kvList: async () => [], hit: async () => true };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (u, method = "GET", body) => { const r = await checkin(new Request(u, { method, headers: { "content-type": "application/json" }, body }), env, json, {}); return { status: r.status, j: await r.json() }; };
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1180, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", acceptDownloads: true, timezoneId: "Europe/London" });
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/\/api\/checkin/, async (rt) => { const q = rt.request(), r = await call(q.url(), q.method(), q.method() === "POST" ? q.postData() : undefined); rt.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.j) }); });
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
// YAML is checked with PyYAML where the machine has it (ESPHome's !secret is a custom tag, read as a string)
const yamlOk = (text) => { try { return JSON.parse(execFileSync("python3", ["-c", "import sys,json,yaml\nclass L(yaml.SafeLoader): pass\nL.add_constructor('!secret', lambda l, n: '<secret>')\nprint(json.dumps(yaml.load(sys.stdin.read(), Loader=L)))"], { input: text }).toString()); } catch (e) { if (/No module named/.test(String(e.stderr || ""))) return null; throw new Error("not valid YAML: " + (e.stderr || e.message)); } };

await p.goto("http://localhost:8099/checkin.html"); await p.fill("#name", "Gran"); await p.fill("#by", "10:00"); await p.click("#f button[type=submit]"); await p.waitForSelector(".link");
const meLink = (await p.$$eval(".link", (xs) => xs.map((x) => x.textContent)))[0], id = /me\.([0-9a-f]{16})/.exec(meLink)[1];
await p.goto(meLink.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/checkin#", "/checkin.html#")); await p.waitForSelector("#ok");
await p.click("#set summary"); assert.equal(await p.$$eval("#kit", (x) => x.length), 0, "no file before there's a device link"); assert.match(await p.textContent("#set"), /Make a device link above; the sensor uses the same key/);
await p.click("#mkDev"); await p.waitForSelector("#kit");
const key = /t=([0-9a-f]{32})/.exec(await p.textContent("#senseLink"))[1];
ok("no setup file until there's a device link; then the sensor card offers one");

// a PIR board for the kitchen
let y = await p.textContent("#kOut"); const sense = "http://localhost:8099/api/checkin/" + id + "/sense?t=" + key + "&room=kitchen";
assert.ok(y.includes('url: "' + sense + '&motion=1"') && y.includes('url: "' + sense + '&motion=0"'), y);
assert.match(y, /platform: gpio\n    pin: GPIO13[\s\S]*device_class: motion[\s\S]*interval: 6h/); assert.match(await p.textContent("#kHow"), /GPIO13/);
let doc = yamlOk(y); if (doc) { assert.equal(doc.esphome.name, "quiet-checkin-kitchen"); assert.equal(doc.wifi.ssid, "<secret>"); assert.equal(doc.http_request.verify_ssl, true); assert.equal(doc.binary_sensor[0].on_press[0]["http_request.get"].url, sense + "&motion=1"); }
ok("an ESP32 with a PIR motion sensor (ESPHome): valid YAML, Wi-Fi from secrets, the kitchen's link on movement, a heartbeat every 6 hours");

// a radar for the hall
await p.fill("#kRoom", "Front Hall!"); await p.selectOption("#kKind", "ld2410"); y = await p.textContent("#kOut");
assert.match(y, /ld2410:[\s\S]*platform: ld2410\n    has_target:[\s\S]*room=front%20hall&motion=1/); assert.match(y, /name: quiet-checkin-front-hall/);
doc = yamlOk(y); if (doc) { assert.equal(doc.uart.baud_rate, 256000); assert.match(doc.binary_sensor[0].has_target.on_press[0]["http_request.get"].url, /room=front%20hall&motion=1$/); }
// the file's link works: calling it the way the board would checks her in from that room
const rec = mem.get("ci:" + id); rec.last = Date.now() - 2 * 864e5; rec.days = []; mem.set("ci:" + id, rec);
const radarUrl = /url: "([^"]+motion=1)"/.exec(y)[1].replace("http://localhost:8099", "https://mentifaber.org"); assert.deepEqual((await call(radarUrl)).j, { ok: true });
const fam = await call("https://mentifaber.org/api/checkin/" + id + "?t=" + key); assert.equal(fam.status, 403, "the device key reads nothing back");
assert.equal(mem.get("ci:" + id).via, "front hall sensor"); assert.ok(mem.get("ci:" + id).rooms["front hall"]);
ok("an LD2410 radar for the front hall: valid YAML; the link inside it really checks her in from that room, and reads nothing back");

// Home Assistant
await p.fill("#kRoom", "lounge"); await p.selectOption("#kKind", "ha"); await p.waitForSelector("#kEntL:not([hidden])"); await p.fill("#kEnt", "binary_sensor.lounge_pir"); y = await p.textContent("#kOut");
doc = yamlOk(y); if (doc) { assert.ok(doc.rest_command.quiet_checkin_lounge.url.endsWith("room=lounge&motion=1")); assert.equal(doc.automation[0].triggers[0].entity_id, "binary_sensor.lounge_pir"); assert.equal(doc.automation[0].actions[0].action, "rest_command.quiet_checkin_lounge"); assert.equal(doc.automation[1].triggers[0].hours, "/6"); }
else assert.match(y, /entity_id: binary_sensor\.lounge_pir[\s\S]*action: rest_command\.quiet_checkin_lounge/);
await p.fill("#kEnt", "not an entity; rm -rf"); y = await p.textContent("#kOut"); assert.match(y, /entity_id: binary_sensor\.lounge_motion/, "a name that isn't a Home Assistant entity falls back to the room's");
ok("a motion sensor already in Home Assistant: valid YAML, a REST command and two automations (movement, and a 6-hourly heartbeat); a bad entity name isn't passed through");

const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#kSave")]); assert.equal(dl.suggestedFilename(), "quiet-checkin-lounge.yaml");
const saved = fs.readFileSync(await dl.path(), "utf8"); assert.equal(saved, y);
ok("it downloads as quiet-checkin-lounge.yaml, exactly as shown");
assert.deepEqual(errs, []); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
await b.close(); console.log("all passed " + DEV);
