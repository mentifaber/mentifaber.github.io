// In Case (/incase) in Chromium: a family's phone and a paramedic's, against the real sealed boxes (src/care.js).
//  - the family's phone: Gran's medicines come in from her Care Circle (opened on the phone with its own key); the card
//    is saved; the house's shutoffs show for the family but not on the card
//  - shared for paramedics: a QR code and a link; the paramedic's phone, which has nothing of the family's, opens the card
//    from the link: allergies first, who to call as phone links; the server holds only ciphertext
//  - an edit shows the card has changed since it was shared; updating it reaches the paramedic's link
//  - the wallet card prints front and back with the QR code; stopping sharing ends the link; axe on both views
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import path from "node:path"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const REPO = process.argv[2] || path.resolve(new URL("../..", import.meta.url).pathname), DEV = process.argv[3] || "desktop", M = DEV === "mobile";
const AXE = fs.readFileSync(process.env.AXE || require.resolve("axe-core/axe.min.js"), "utf8");
const { care, incase } = await import(REPO + "/src/care.js");
const mem = new Map(), st = { kvGet: async (k) => structuredClone(mem.get(k)) ?? null, kvDel: async (k) => { mem.delete(k); }, hit: async () => true,
  kvCas: async (k, e, v) => { const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== e) return { ok: false, cur }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const b64u = (buf) => Buffer.from(buf).toString("base64url"), hex = (n) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("hex");
// Gran's Care Circle, made the way care.html makes one
const CID = hex(8), CKEY = b64u(crypto.getRandomValues(new Uint8Array(32))), CT = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("care-token:" + CKEY))).toString("hex").slice(0, 32);
{ const K = await crypto.subtle.importKey("raw", Buffer.from(CKEY, "base64url"), "AES-GCM", false, ["encrypt"]), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, K, new TextEncoder().encode(JSON.stringify({ care: 1, person: "Gran", members: ["Ann"], meds: [{ id: "m1", name: "Metformin", dose: "500 mg", times: ["08:00", "20:00"], with: "with food" }, { id: "m2", name: "Ramipril", dose: "5 mg", times: ["08:00"], with: "" }] })));
  await care(new Request("https://mentifaber.org/api/care/" + CID, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: CT, v: 0, ct: b64u(ct), iv: b64u(iv) }) }), env, json); }
const b = await chromium.launch({ args: ["--no-proxy-server"] }), errs = [];
const phone = async () => { const ctx = await b.newContext({ viewport: M ? { width: 390, height: 844 } : { width: 1200, height: 900 }, isMobile: M, hasTouch: M, serviceWorkers: "block", locale: "en-US" });
  await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
  await ctx.route(/\/api\/(care|incase)\//, async (rt) => { const q = rt.request(), req = new Request(q.url().replace("localhost:8099", "mentifaber.org"), { method: q.method(), headers: q.headers(), body: q.method() === "POST" ? q.postData() : undefined });
    const r = /\/api\/care\//.test(q.url()) ? await care(req, env, json) : await incase(req, env, json); rt.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return p; };
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + DEV + " " + m);
const axe = async (p) => { await p.addScriptTag({ content: AXE }); return p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })).violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((y) => y.target.join(" ")).join("; "))); };

try {
  const A = await phone(); await A.goto("http://localhost:8099/incase.html");
  await A.evaluate(({ CID, CKEY }) => { localStorage.setItem("care:circles", JSON.stringify([{ id: CID, key: CKEY, person: "Gran" }]));
    localStorage.setItem("house:v1", JSON.stringify([{ id: "h1", kind: "shutoff", title: "Water stopcock", where: "Under the kitchen sink", det: "", priv: false }, { id: "h2", kind: "note", title: "Alarm code", where: "4471", priv: true }])); }, { CID, CKEY });
  await A.reload(); assert.match(await A.textContent("#people"), /No cards yet/); assert.match(await A.textContent("#home-at"), /Water stopcock: Under the kitchen sink/); assert.doesNotMatch(await A.textContent("body"), /4471/);
  await A.click("#new"); await A.waitForSelector("#from-care:not([hidden]) button"); assert.match(await A.textContent("#from-care"), /Gran's 2 medicines/);
  await A.click("#from-care button"); assert.equal(await A.inputValue("[name=name]"), "Gran"); assert.equal(await A.inputValue("[name=meds]"), "Metformin, 500 mg, 08:00, 20:00, with food\nRamipril, 5 mg, 08:00");
  await A.fill("[name=born]", "1941-03-02"); await A.selectOption("[name=blood]", "A+"); await A.fill("[name=allergies]", "Penicillin: rash and swelling"); await A.fill("[name=conditions]", "Type 2 diabetes\nHigh blood pressure");
  await A.fill("[name=contacts]", "Ann Lee, daughter, 555 0100 222"); await A.fill("[name=notes]", "Hard of hearing in the left ear"); await A.click("#edit button[type=submit]"); await A.waitForSelector(".person");
  const card = await A.textContent(".person"); assert.match(card, /Gran[\s\S]*Born(March 2, 1941|2 March 1941) \(\d+\)[\s\S]*Blood typeA\+[\s\S]*AllergiesPenicillin: rash and swelling[\s\S]*ConditionsType 2 diabetes[\s\S]*Metformin, 500 mg/); assert.doesNotMatch(card, /stopcock/);
  ok("Gran's medicines come in from her Care Circle, opened on the phone; the card is saved; the house's shutoffs are for the family, not on the card");

  await A.click(".person [data-act=share]"); await A.waitForSelector(".person .qr svg"); const link = await A.textContent(".person .link"); assert.match(link, /\/incase#v=[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
  assert.match(await A.getAttribute(".person .qr svg", "aria-label"), /QR code for Gran's card/);
  const box = [...mem.entries()].find(([k]) => k.startsWith("incase:"))[1]; assert.ok(!/Gran|Penicillin|Metformin|555/.test(JSON.stringify(box)), "the server holds only ciphertext");
  const B = await phone(); await B.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:8099").replace("/incase#", "/incase.html#")); await B.waitForSelector("#view:not([hidden]) .sec");
  assert.equal(await B.textContent("#v-name"), "Gran"); assert.match(await B.textContent("#v-card"), /AllergiesPenicillin: rash and swelling/); assert.equal(await B.getAttribute('#v-card a[href^="tel:"]', "href"), "tel:5550100222");
  assert.equal(await B.isHidden("#home"), true); assert.equal(await B.$$eval("#view button, #view input", (x) => x.length), 0, "nothing to edit"); assert.deepEqual(await axe(B), []);
  ok("shared for paramedics: a QR code and a link; the paramedic's phone opens the card from the link alone (allergies, who to call as a phone link); the server holds only ciphertext; axe");

  await A.click(".person [data-act=edit]"); await A.fill("[name=allergies]", "Penicillin: rash and swelling\nLatex"); await A.click("#edit button[type=submit]"); await A.waitForSelector(".person");
  await A.waitForFunction(() => !/changed the card since/.test(document.querySelector(".person").textContent)); // saving a shared card updates it
  await B.reload(); await B.waitForFunction(() => /Latex/.test(document.querySelector("#v-card").textContent));
  ok("an edit to a shared card reaches the paramedic's link");

  await A.evaluate(() => { window.print = () => { window.__printed = true; }; }); await A.click(".person [data-act=print]"); assert.equal(await A.evaluate(() => window.__printed), true);
  await A.emulateMedia({ media: "print" }); assert.equal(await A.isVisible("#print"), true); assert.equal(await A.isVisible(".wrap"), false);
  assert.match(await A.textContent("#print"), /IN CASE · Gran[\s\S]*Blood A\+[\s\S]*Allergies: Penicillin: rash and swelling; Latex[\s\S]*Medicines: Metformin[\s\S]*Call: Ann Lee[\s\S]*Scan for the full card/); assert.equal(await A.$$eval("#print .qr svg", (x) => x.length), 1);
  await A.emulateMedia({ media: "screen" }); assert.deepEqual(await axe(A), []);
  ok("the wallet card prints front and back, with the QR code; axe on the family's view");

  await A.click(".person [data-act=unshare]"); await A.waitForSelector(".person [data-act=share]"); await B.reload(); await B.waitForFunction(() => /isn't shared any more/.test(document.querySelector("#v-st").textContent));
  await A.reload(); assert.match(await A.textContent(".person"), /Gran/, "the card itself stays on the family's phone");
  ok("stopping sharing ends the link; the card stays on the family's phone");

  assert.deepEqual(errs, []); for (const x of [A, B]) assert.equal(await x.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  console.log("all passed " + DEV);
} finally { await b.close(); }
