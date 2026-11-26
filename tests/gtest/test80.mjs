// Recall Watch, the server side (src/recalls.js, /api/recalls): the CPSC's recalls for a make and model.
//  - only make, model and kind words go out: a model number asked for on its own, a make with a kind together
//  - each recall as the page needs it: number, date, title, the cpsc.gov link (no other links), products and their model
//    numbers, makers, hazards, remedies, contact; recalls for the model number first, then the newest
//  - malformed questions refused; the CPSC down or odd is a 502 with a plain message; 300 checks a day per connection
import assert from "node:assert/strict";
const { recalls, recallOf } = await import(new URL("../../src/recalls.js", import.meta.url));
let n = 0; const ok = (m) => console.log("  ✓ " + ++n + " " + m);
const hits = new Map(), st = { hit: async (k, l) => { hits.set(k, (hits.get(k) || 0) + 1); return hits.get(k) <= l; } };
const env = { STORE: { idFromName: (x) => x, get: () => st } }, json = (b, s = 200, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...h } });
// recalls as the CPSC's Recalls Retrieval service writes them
const rec = (n, date, title, model, maker, extra = {}) => ({ RecallID: 9000 + n, RecallNumber: String(n), RecallDate: date + "T00:00:00", Title: title, URL: "https://www.cpsc.gov/Recalls/2024/" + n, ConsumerContact: maker + " toll-free at 800-555-0100",
  Products: [{ Name: title.split(" Recall")[0], Model: model, NumberOfUnits: "About 1,200 units", Type: "", CategoryID: "1" }], Manufacturers: [{ Name: maker, CompanyID: "1" }], Hazards: [{ Name: "The dishwasher's control board can overheat, posing a fire hazard.", HazardType: "Fire", HazardTypeID: "1" }],
  Remedies: [{ Name: "Consumers should stop using the recalled dishwashers and contact " + maker + " for a free repair." }], RemedyOptions: [{ Option: "Repair" }], Images: [{ URL: "https://www.cpsc.gov/s3fs-public/x.png" }], ...extra });
const DB = [rec(24101, "2024-03-07", "Bosch Recalls Dishwashers Due to Fire Hazard", "SHX878WD5N, SHPM88Z75N and SHE53C85N", "BSH Home Appliances"),
  rec(23050, "2023-01-12", "Bosch Recalls Dishwasher Racks Due to Laceration Hazard", "SGE63E15UC", "BSH Home Appliances"),
  rec(22001, "2022-06-01", "Bosch Recalls Dishwasher Hoses With an Odd Link", "X1", "Bosch", { URL: "https://evil.example/recall" })];
const asked = [];
const fake = async (url) => { const u = new URL(url); asked.push(Object.fromEntries(u.searchParams)); const p = Object.fromEntries(u.searchParams);
  let out = DB; if (p.ProductModel) out = DB.filter((r) => r.Products.some((x) => x.Model.toUpperCase().includes(p.ProductModel.toUpperCase())));
  if (p.Manufacturer) out = DB.filter((r) => /bosch/i.test(p.Manufacturer) && (r.Title + r.Manufacturers[0].Name).match(/bosch|bsh/i) && r.Title.toLowerCase().includes(String(p.ProductName || "").toLowerCase().replace(/s$/, "")));
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } }); };
const call = async (q, f = fake, ip = "203.0.113.5") => { const r = await recalls(new Request("https://mentifaber.org/api/recalls?" + new URLSearchParams(q), { headers: { "cf-connecting-ip": ip } }), env, json, { fetchFn: f }); return { s: r.status, j: await r.json() }; };

let r = await call({ model: "SHX878WD5N", maker: "Bosch", kind: "dishwasher" }); assert.equal(r.s, 200);
assert.deepEqual(asked, [{ format: "json", ProductModel: "SHX878WD5N" }, { format: "json", Manufacturer: "Bosch", ProductName: "dishwasher" }], "only make, model and kind words go out");
assert.deepEqual(r.j.recalls.map((x) => [x.n, x.why]), [["24101", "model"], ["23050", "maker"], ["22001", "maker"]], "the model's recall first, then the make's, newest first");
const x = r.j.recalls[0];
assert.deepEqual({ ...x, hazards: x.hazards.length, remedies: x.remedies.length }, { n: "24101", date: "2024-03-07", why: "model", title: "Bosch Recalls Dishwashers Due to Fire Hazard", url: "https://www.cpsc.gov/Recalls/2024/24101",
  products: [{ name: "Bosch", model: "SHX878WD5N, SHPM88Z75N and SHE53C85N", units: "About 1,200 units" }], makers: ["BSH Home Appliances"], hazards: 1, remedies: 1, options: ["Repair"], contact: "BSH Home Appliances toll-free at 800-555-0100", units: "About 1,200 units", image: "https://www.cpsc.gov/s3fs-public/x.png" });
assert.equal(r.j.recalls[2].url, "", "a link anywhere but cpsc.gov isn't passed on");
ok("only make, model and kind words go to the CPSC; each recall as the page needs it, the model's own first; no link but cpsc.gov's");

asked.length = 0; r = await call({ model: "SMS-6ZDI48E <script>" }); assert.equal(asked[0].ProductModel, "SMS-6ZDI48E script", "only the words of a model number");
assert.equal((await call({ model: "ab" })).s, 400); assert.equal((await call({ maker: "Bosch" })).s, 400, "a make alone is too broad"); assert.equal((await call({})).s, 400);
assert.equal(recallOf({ Title: "no number" }), null); assert.equal(recallOf({ recallNumber: "1", title: "lower case fields", products: [{ name: "Kettle", model: "K1" }] }, "model").products[0].model, "K1", "field names in either case");
ok("malformed questions refused, a model number cleaned to its words; field names read in either case");

r = await call({ model: "SHX878WD5N" }, async () => new Response("busy", { status: 503 })); assert.equal(r.s, 502); assert.match(r.j.error, /didn't answer \(503\)/);
r = await call({ model: "SHX878WD5N" }, async () => new Response("<html>", { status: 200 })); assert.equal(r.s, 502); assert.match(r.j.error, /unexpected/);
r = await call({ model: "SHX878WD5N" }, async () => { throw new Error("network"); }); assert.equal(r.s, 502);
ok("the CPSC down, odd or unreachable is a 502 with a plain message");

for (let i = 0; i < 300; i++) await call({ model: "SHX878WD5N" }, fake, "203.0.113.6"); r = await call({ model: "SHX878WD5N" }, fake, "203.0.113.6"); assert.equal(r.s, 429); assert.match(r.j.error, /300 recall checks/);
ok("300 checks a day per connection");
console.log("recall watch: all checks passed");
