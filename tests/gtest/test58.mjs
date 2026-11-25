// The Nest Registry's backups, restored for real (Cloudflare's free plan: no R2, so the photos, the daily copies and the
// registry all live in its own Durable Object). The daily copy lists the photos it needs, and a photo a kept copy needs
// isn't deleted when the registry lets go of it, so restoring a copy brings its photos back too; once no kept copy needs
// it, it goes. Photos already missing are named, not silently skipped. A restore saves what's there first, so it can be
// undone; and the downloaded export (photos inside) restores a registry whose database lost them.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = process.argv[2] || new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "nest58.js", readFileSync(REPO + "/src/nest.js", "utf8").replace('from "cloudflare:workers"', 'from "../cf-nest.mjs"').replace('from "./nest-find.js"', 'from "' + REPO + '/src/nest-find.js"').replace('from "./rowmeter.js"', 'from "' + REPO + '/src/rowmeter.js"'));
writeFileSync(new URL("./cf-nest.mjs", import.meta.url), "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n");
const { Nest } = await import(OUT + "nest58.js?" + Date.now());
let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
class Cursor { constructor(r) { this.r = r; } toArray() { return this.r; } }
const db = new DatabaseSync(":memory:"), sql = { exec(q, ...a) { const st = db.prepare(q); if (/^\s*select/i.test(q)) return new Cursor(st.all(...a).map((x) => ({ ...x }))); st.run(...a); return new Cursor([]); } };
const transactionSync = (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };
globalThis.fetch = async () => new Response("offline", { status: 404 });
const png = (b) => Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGA" + b + "mMIQAAAABJRU5ErkJggg==", "base64");
const nest = new Nest({ storage: { sql, transactionSync, getAlarm: async () => null, setAlarm: async () => {} } }, { HIVE: { idFromName: () => "h", get: () => ({ fetch: async () => Response.json({}) }) } });
const call = async (path, body, h = {}, raw) => { const r = await nest.fetch(new Request("https://mentifaber.org/api/nest" + path, { method: body ? "POST" : "GET", headers: { "content-type": raw ? raw.type : "application/json", ...h }, body: raw ? raw.body : body ? JSON.stringify(body) : undefined })); return { status: r.status, r, j: /json/.test(r.headers.get("content-type") || "") ? await r.clone().json() : null }; };
const O = { "x-nest-owner": "1" };
await call("/join", { name: "Anders" }, O); const key = (await call("/state", null, O)).j.invite;
const G = { cookie: (await nest.fetch(new Request("https://mentifaber.org/api/nest/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name: "Maria" }) }))).headers.get("set-cookie").split(";")[0] };
const photo = async (bytes) => (await call("/blob", {}, O, { type: "image/png", body: bytes })).j.id;
const bytesOf = async (id) => { const r = await call("/blob/" + id, null, G); return r.status === 200 ? Buffer.from(await r.r.arrayBuffer()) : null; };
const day = new Date().toISOString().slice(0, 10), photoRows = () => db.prepare("SELECT COUNT(*) c FROM photo").get().c;

// the registry today: a crib with its photo (claimed), a stroller with a pick
let r0;
const crib = png("hKm"), pick = png("hKn"), c1 = await photo(crib), s1 = await photo(pick);
await call("/doc", { path: "items/i1", data: { name: "Crib", kind: "item", imageId: c1 } }, O);
await call("/doc", { path: "items/i2", data: { name: "Stroller", kind: "item", options: [{ n: "City", i: s1 }] } }, O);
r0 = await call("/doc", { path: "claims/i1", data: { by: "Maria" } }, O); assert.equal(r0.status, 200, JSON.stringify(r0.j));

// 1 · the daily copy says which photos it needs, and is refused to a guest
assert.equal((await call("/backup", {}, G)).status, 403);
let r = await call("/backup", {}, O); assert.deepEqual([r.j.ok, r.j.photos, r.j.missing], [true, 2, undefined]);
const saved = JSON.parse(db.prepare("SELECT data FROM backup WHERE day=?").get(day).data); assert.deepEqual(saved.photoIds.sort(), [c1, s1].sort()); assert.deepEqual(saved.photosMissing, []);
ok("the daily copy keeps the records and names the two photos it needs (none missing); guests can't make one");

// 2 · the registry changes: a new crib photo replaces the old one, the stroller is deleted, a gift is un-claimed
const c2 = await photo(png("hKo"));
await call("/doc", { path: "items/i1", data: { name: "Crib (white)", kind: "item", imageId: c2 } }, O);
await call("/doc", { path: "items/i2", data: null }, O).catch(() => {}); db.prepare("DELETE FROM doc WHERE path='items/i2'").run(); db.prepare("DELETE FROM doc WHERE path='claims/i1'").run();
await nest.dropPhoto(c1); await nest.dropPhoto(s1); // what the registry does when it lets a photo go (a replaced or unused one)
assert.ok(await bytesOf(c1) && await bytesOf(s1), "a kept copy still needs them, so they wait instead of being deleted");
assert.deepEqual(db.prepare("SELECT id FROM gone ORDER BY id").all().map((x) => x.id), [c1, s1].sort());
ok("a photo the registry lets go of waits while a kept copy still needs it");

// 3 · restore the daily copy: the old records and their photos are back, byte for byte; a guest can't do it
assert.equal((await call("/restore", { day }, G)).status, 403);
assert.equal((await call("/restore", { day: "2001-01-01" }, O)).status, 404); assert.equal((await call("/restore", { day: "nonsense" }, O)).status, 400);
r = await call("/restore", { day }, O); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.deepEqual([r.j.ok, r.j.photos, r.j.missing], [true, 2, undefined]); assert.match(r.j.undo, /^\d{4}-\d\d-\d\d~before-restore-\d{6}$/);
let st = (await call("/state", null, G)).j; const docs = st.docs || {};
assert.equal(docs["items/i1"].name, "Crib"); assert.equal(docs["items/i1"].imageId, c1); assert.equal(docs["items/i2"].options[0].i, s1); assert.equal(docs["claims/i1"].by, "Maria");
assert.deepEqual(await bytesOf(c1), crib); assert.deepEqual(await bytesOf(s1), pick); assert.equal(db.prepare("SELECT COUNT(*) c FROM gone").get().c, 0, "back in use, no longer waiting");
assert.ok(db.prepare("SELECT 1 FROM person WHERE name='Maria'").get(), "guests and their sign-ins are left alone");
ok("restoring the daily copy brings back the list, the picks, the claim and both photos, byte for byte; guests stay signed in");

// 4 · the restore can be undone: what was there just before is a copy of its own (with the new crib photo kept)
r = await call("/restore", { day: r.j.undo }, O); assert.equal(r.j.ok, true); st = (await call("/state", null, G)).j;
assert.equal(st.docs["items/i1"].name, "Crib (white)"); assert.equal(st.docs["items/i1"].imageId, c2); assert.ok(await bytesOf(c2));
ok("a restore can be undone: the registry as it was just before comes back, photo included");
r = await call("/backups", null, O); assert.equal(r.j.copies[0].slice(0, 10), day); assert.ok(r.j.copies.some((c) => /~before-restore-/.test(c)) && r.j.copies.includes(day)); assert.equal((await call("/backups", null, G)).status, 403);
ok("the owner sees the copies there are to go back to, newest first, the before-restore ones included; a guest can't");

// 5 · when no kept copy needs a let-go photo any more, it goes (copies older than 14 days, as before)
db.prepare("UPDATE OR REPLACE kept SET day='2001-01-01'").run(); db.prepare("UPDATE backup SET day='2001-01-01' WHERE day NOT LIKE '%~%'").run(); db.prepare("UPDATE backup SET day='2001-01-02' WHERE day LIKE '%~%'").run();
await nest.dropPhoto(c1); db.prepare("DELETE FROM kv WHERE k='backup'").run(); const before = photoRows();
r = await call("/backup", {}, O); assert.ok(r.j.ok); assert.equal(await bytesOf(c1), null, "no copy needs it now: deleted"); assert.ok(await bytesOf(c2), "the photo in use stays"); assert.ok(photoRows() < before);
ok("a photo nobody uses and no kept copy needs is deleted at the next daily copy");

// 6 · a photo that's already gone is named in the copy (not silently skipped)
const lost = "b" + "e".repeat(20); await call("/doc", { path: "items/i3", data: { name: "Mobile", kind: "item", imageId: lost } }, O); db.prepare("DELETE FROM kv WHERE k='backup'").run();
r = await call("/backup", {}, O); assert.deepEqual(r.j.missing, [lost]); assert.deepEqual(JSON.parse(db.prepare("SELECT data FROM backup WHERE day=?").get(day).data).photosMissing, [lost]);
const ex = (await call("/export", null, O)).j; assert.deepEqual(ex.photosMissing, [lost]); assert.ok(ex.photos[c2]);
ok("a photo already missing is named in the daily copy and in the download");

// 7 · the export restores a registry whose database lost its photos: the photos come back from the file
db.prepare("DELETE FROM photo").run(); db.prepare("DELETE FROM doc WHERE path LIKE 'items/%'").run(); assert.equal(await bytesOf(c2), null);
r = await call("/restore", { file: ex }, O); assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.photosBack, 1); assert.deepEqual(r.j.missing, [lost]);
assert.ok(await bytesOf(c2)); assert.equal((await call("/state", null, G)).j.docs["items/i1"].name, "Crib (white)");
assert.equal((await call("/restore", { file: { kind: "something else", docs: {} } }, O)).status, 400);
ok("the downloaded export restores the registry and its photos; a file that isn't a registry copy is refused; what couldn't come back is named");
console.log("nest backups restored: all checks passed");
