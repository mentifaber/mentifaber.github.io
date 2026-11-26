// Repair Café, the server side (src/repair.js, /api/repair/*): a pop-up repair day.
//  - a day is made with a hash of its key; malformed days are refused; 5 new days a day per connection
//  - the public sees the day and which slots are free, never a name; a slot takes as many bookings as there are tables,
//    even when two people book its last place at the same moment
//  - a booker's secret shows them their own booking (and their place in the queue) and cancels it; nobody else's does
//  - only the day's key opens the door: every booking with its name and Fix or Replace's inputs, walk-ins, checking in,
//    a table, how it went (with a Device Passport for a fix, a Workshop Portal link for what goes to the workshop), undo
//  - the day's times and tables can't be changed under someone's booking; closing stops bookings; removing it is for good
//  - 10 bookings a day per connection (a refused one doesn't count)
import assert from "node:assert/strict";
const { repair, slotsOf } = await import(new URL("../../src/repair.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const mem = new Map(), hits = new Map();
const tick = () => new Promise((r) => setImmediate(r));
const st = { kvGet: async (k) => { await tick(); return structuredClone(mem.get(k)) ?? null; }, hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; }, kvDel: async (k) => { mem.delete(k); },
  kvCas: async (k, expect, v) => { await tick(); const cur = mem.get(k) ?? null; if ((cur ? cur.v || 0 : 0) !== expect) return { ok: false, cur: structuredClone(cur) }; mem.set(k, structuredClone(v)); return { ok: true }; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const call = async (p, body, ip = "203.0.113.60") => { const r = await repair(new Request("https://mentifaber.org/api/repair" + p, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined }), env, json); return { s: r.status, j: await r.json() }; };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const date = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const KEY = hex(16), DAY = { title: "Elm Street Repair Café", place: "The library hall, 2 Elm St", date: date(3), from: "10:00", to: "12:00", slot: 30, tables: 2, note: "Bring the charger", board: "elm-street" };

// a new day
for (const [bad, why] of [[{ ...DAY, place: "" }, /where/], [{ ...DAY, date: "2020-01-01" }, /been and gone/], [{ ...DAY, date: date(400) }, /six months/], [{ ...DAY, to: "09:00" }, /starts and ends/], [{ ...DAY, slot: 2 }, /slot/], [{ ...DAY, tables: 40 }, /tables/], [{ ...DAY, from: "00:00", to: "23:00", slot: 5 }, /slots/]]) {
  const r = await call("", { op: "new", day: bad, ok: await sha(KEY) }); assert.equal(r.s, 400, JSON.stringify(bad)); assert.match(r.j.error, why); }
assert.equal((await call("", { op: "new", day: DAY })).s, 400, "no key hash");
let r = await call("", { op: "new", day: DAY, ok: await sha(KEY) }); assert.equal(r.s, 200); const ID = r.j.id; assert.match(ID, /^[0-9a-f]{12}$/);
assert.deepEqual(r.j.slots.map((s) => s.t), ["10:00", "10:30", "11:00", "11:30"]); assert.deepEqual(slotsOf(r.j.day), ["10:00", "10:30", "11:00", "11:30"]);
assert.ok(!JSON.stringify(mem.get("rc:" + ID)).includes(KEY), "only the key's hash is kept");
for (let i = 0; i < 5; i++) assert.equal((await call("", { op: "new", day: DAY, ok: await sha(KEY) }, "203.0.113.61")).s, 200);
assert.equal((await call("", { op: "new", day: DAY, ok: await sha(KEY) }, "203.0.113.61")).s, 429);
ok("a day is made with a hash of its key (malformed days refused); 5 new days a day per connection");

// booking
const S1 = hex(16), S2 = hex(16), S3 = hex(16);
const chk = { kind: "laptop", fault: "battery", age: 4, price: 900 };
r = await call("/" + ID, { op: "book", t: "10:00", name: "Ann", device: "ThinkPad T480", problem: "Battery dies in an hour", chk, tk: await sha(S1) }); assert.equal(r.s, 200); const B1 = r.j.bid;
assert.equal((await call("/" + ID, { op: "book", t: "10:15", name: "Bob", device: "Kettle", tk: await sha(S2) })).s, 400, "not one of the slots");
assert.equal((await call("/" + ID, { op: "book", t: "10:00", name: "", device: "Kettle", tk: await sha(S2) })).s, 400, "no name");
// two people book the last place at 10:00 at the same moment
const [x, y] = await Promise.all([call("/" + ID, { op: "book", t: "10:00", name: "Bob", device: "Kettle", problem: "Won't switch off", tk: await sha(S2) }, "203.0.113.62"), call("/" + ID, { op: "book", t: "10:00", name: "Cat", device: "Lamp", tk: await sha(S3) }, "203.0.113.63")]);
assert.deepEqual([x.s, y.s].sort(), [200, 409], "one gets the last place, the other's told it's gone"); const late = x.s === 409 ? x : y; assert.match(late.j.error, /just been taken/);
const lateIp = x.s === 409 ? "203.0.113.62" : "203.0.113.63", B2 = (x.s === 200 ? x : y).j.bid, S2b = x.s === 200 ? S2 : S3;
r = await call("/" + ID, { op: "book", t: "10:30", name: "Cat", device: "Lamp", tk: await sha(S3) }, lateIp); assert.equal(r.s, 200); const B3 = r.j.bid;
r = await call("/" + ID); assert.deepEqual(r.j.slots, [{ t: "10:00", free: 0 }, { t: "10:30", free: 1 }, { t: "11:00", free: 2 }, { t: "11:30", free: 2 }]);
assert.ok(!/Ann|Bob|Cat|ThinkPad|Kettle|Lamp|Battery/.test(JSON.stringify(r.j)), "the public sees no names, devices or problems"); assert.equal(r.j.counts.booked, 3);
ok("the public sees which slots are free and never a name; a slot takes as many as there are tables, even two bookings at the same moment");

r = await call("/" + ID, { op: "mine", bid: B1, secret: S1 }); assert.equal(r.s, 200); assert.equal(r.j.mine.name, "Ann"); assert.equal(r.j.mine.t, "10:00"); assert.deepEqual(r.j.mine.chk, chk); assert.equal(r.j.mine.ahead, null);
assert.equal((await call("/" + ID, { op: "mine", bid: B1, secret: S2 })).s, 403, "someone else's secret");
assert.equal((await call("/" + ID, { op: "cancel", bid: B1, secret: hex(16) })).s, 403);
assert.equal((await call("/" + ID, { op: "cancel", bid: B3, secret: S3 })).s, 200); r = await call("/" + ID); assert.equal(r.j.slots[1].free, 2, "a cancelled place is free again");
assert.equal((await call("/" + ID, { op: "mine", bid: B3, secret: S3 })).s, 404);
ok("a booker's secret shows them their own booking and cancels it; nobody else's does, and a cancelled place is free again");

// the door
assert.equal((await call("/" + ID, { op: "door", key: hex(16) })).s, 403); assert.equal((await call("/" + ID, { op: "arrive", bid: B1 })).s, 403);
r = await call("/" + ID, { op: "door", key: KEY }); assert.equal(r.s, 200); assert.deepEqual(r.j.ents.map((e) => e.name).sort(), ["Ann", r.j.ents.find((e) => e.bid === B2).name].sort()); assert.ok(!JSON.stringify(r.j).includes(await sha(S1)), "not the bookers' secret hashes");
assert.deepEqual(r.j.ents.find((e) => e.bid === B1).chk, chk);
assert.equal((await call("/" + ID, { op: "arrive", key: KEY, bid: B1 })).s, 200);
const SW = hex(16); r = await call("/" + ID, { op: "walkin", key: KEY, name: "Dee", device: "Toaster", problem: "Only one side heats", tk: await sha(SW) }); assert.equal(r.s, 200); const BW = r.j.ent.bid; assert.ok(r.j.ent.arr); assert.equal(r.j.ent.t, null);
assert.equal((await call("/" + ID, { op: "mine", bid: BW, secret: SW })).j.mine.ahead, 1, "Dee is second in the queue");
assert.equal((await call("/" + ID, { op: "table", key: KEY, bid: B1, table: 9 })).s, 400, "there are 2 tables");
r = await call("/" + ID, { op: "table", key: KEY, bid: B1, table: 2 }); assert.equal(r.j.ent.table, 2); assert.equal((await call("/" + ID, { op: "mine", bid: BW, secret: SW })).j.mine.ahead, 0, "now Dee's next");
assert.equal((await call("/" + ID)).j.counts.atTables, 1);
ok("only the day's key opens the door: the bookings with names and Fix or Replace's inputs, checking in, walk-ins, a place in the queue, a table");

// how it went
assert.equal((await call("/" + ID, { op: "done", key: KEY, bid: B1, out: "mended" })).s, 400);
assert.equal((await call("/" + ID, { op: "done", key: KEY, bid: B1, out: "advice", passport: "abc.def" })).s, 400, "a passport is for a fix");
assert.equal((await call("/" + ID, { op: "done", key: KEY, bid: BW, out: "workshop", portal: "https://evil.example/portal#x.y" })).s, 400);
r = await call("/" + ID, { op: "done", key: KEY, bid: B1, out: "fixed", work: ["Replaced the battery"], parts: ["01AV422 battery"], note: "Calibrate it once", passport: "eyJ2IjoxfQ.c2ln" }); assert.equal(r.s, 200);
assert.equal(r.j.ent.done.table, 2); assert.equal(r.j.ent.done.passport, "eyJ2IjoxfQ.c2ln");
r = await call("/" + ID, { op: "mine", bid: B1, secret: S1 }); assert.equal(r.j.mine.done.out, "fixed"); assert.deepEqual(r.j.mine.done.work, ["Replaced the battery"]); assert.equal(r.j.mine.done.passport, "eyJ2IjoxfQ.c2ln");
r = await call("/" + ID, { op: "done", key: KEY, bid: BW, out: "workshop", portal: "/portal#ab12cd34ef.Zx9_8-7y6w5v" }); assert.equal(r.s, 200);
assert.equal((await call("/" + ID, { op: "undo", key: KEY, bid: BW })).j.ent.done, null); await call("/" + ID, { op: "done", key: KEY, bid: BW, out: "no", note: "The element's gone" });
const c = (await call("/" + ID)).j.counts; assert.equal(c.fixed, 1); assert.equal(c.no, 1); assert.equal(c.waiting, 0);
ok("how it went: a fix with its Device Passport (only for a fix), a Workshop Portal link (only the portal's own), undo; the booker sees theirs");

// changing the day
assert.equal((await call("/" + ID, { op: "edit", key: KEY, day: { from: "10:30" } })).s, 409, "someone's booked at 10:00");
assert.equal((await call("/" + ID, { op: "edit", key: KEY, day: { tables: 1 } })).s, 409, "two are booked at 10:00");
r = await call("/" + ID, { op: "edit", key: KEY, day: { to: "13:00", place: "The church hall" } }); assert.equal(r.s, 200); assert.equal(r.j.slots.length, 6); assert.equal(r.j.day.place, "The church hall");
assert.equal((await call("/" + ID, { op: "close", key: KEY })).j.open, false);
r = await call("/" + ID, { op: "book", t: "12:00", name: "Eve", device: "Radio", tk: await sha(hex(16)) }, "203.0.113.70"); assert.equal(r.s, 409); assert.match(r.j.error, /closed/);
await call("/" + ID, { op: "reopen", key: KEY });
ok("the day's times and tables can't be changed under someone's booking; closing stops bookings");

// the day's limit
const ip = "203.0.113.80"; let got = 0;
for (let i = 0; i < 12; i++) { const r2 = await call("/" + ID, { op: "book", t: ["11:00", "11:30", "12:00", "12:30"][i % 4], name: "N" + i, device: "Thing", tk: await sha(hex(16)) }, ip); if (r2.s === 200) got++; else if (r2.s === 429) break; }
assert.equal(got, 8, "the slots fill first (4 slots × 2 tables)"); assert.equal(hits.get("rc-book:" + ip), 8, "a refused booking doesn't count");
ok("a refused booking doesn't count against the connection's 10 a day");

r = await call("/" + ID, { op: "remove", key: KEY }); assert.equal(r.s, 200); assert.equal((await call("/" + ID)).s, 404); assert.equal(mem.has("rc:" + ID), false);
assert.equal((await call("/zzz")).s, 404);
ok("removing the day is for good");
console.log("repair café server: all checks passed");
