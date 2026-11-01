// Projects in Chromium: “+ Project” makes one (name, instructions, files: text, PDF, Word, spreadsheets); new chats go into
// the active project and send its instructions and files with every message; the chips filter the sessions; a session can be
// moved between projects from ⌘K; files can be removed; deleting a project keeps its chats, outside any project.
//   node projects-ui.mjs <repo> desktop|mobile
import { createRequire } from "node:module"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const DEV = process.argv[3] || "desktop";
globalThis.fetch = async (u) => { throw new Error("offline: " + u); };
const H = await import("../gtest/harness.mjs"); H.hive.sql();
H.setResponder((sys) => /follow-up questions the user might ask next/.test(sys) ? '{"q": []}' : /You decide which tools/.test(sys) ? '{"calls":[]}' : "Fine, here's the answer.");
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: DEV === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: DEV === "mobile", hasTouch: DEV === "mobile", serviceWorkers: "block" });
const bodies = []; ctx.on("request", (r) => { if (/\/api\/hive\/chat$/.test(r.url())) bodies.push(JSON.parse(r.postData() || "{}")); });
await ctx.route(/\/api\/hive\//, async (route) => { const req = route.request(), u = new URL(req.url()); const res = await H.hive.fetch(new Request("https://mentifaber.org" + u.pathname + u.search, { method: req.method(), headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: req.postData() || undefined }));
  const h = {}; res.headers.forEach((v, k) => (h[k] = v)); return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) }); });
await ctx.route(/\/api\/(?!hive)/, (rt) => rt.fulfill({ contentType: "application/json", body: "{}" }));
await ctx.route(/^(?!http:\/\/localhost:8099)/, (rt) => rt.abort());
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\//, (rt) => rt.fulfill({ contentType: "text/javascript", body: `window.XLSX = { read: () => ({ SheetNames: ["Costs"], Sheets: { Costs: 1 } }), utils: { sheet_to_csv: () => "Item,EUR\\nTiles,480\\nGrout,35" } };` }));
const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => { if (!/Service worker is disabled/.test(e.message)) errs.push(e.message); });
p.on("dialog", (d) => d.accept());
const ok = (m) => console.log("ok", DEV, m), settled = () => p.waitForFunction(() => !document.querySelector(".ex.pending") && document.querySelector(".m.ai .acts"), null, { timeout: 15000 });
const LSget = (k) => p.evaluate((k) => JSON.parse(localStorage.getItem("hive:" + k) || "null"), k), chips = () => p.$$eval("#projs button", (bs) => bs.map((b) => b.textContent + (b.classList.contains("on") ? "*" : "")));
const ask = async (t) => { await p.fill("#inp", t); await p.click("#sendb"); await settled(); };
await p.goto("http://localhost:8099/hive-app.html#studio"); await p.waitForTimeout(900);

assert.deepEqual(await chips(), ["+ Project"]); assert.equal(await p.isVisible("#pnote"), false);
await p.click("#projs [data-pedit='']"); await p.waitForSelector("#pdlg[open]"); assert.equal(await p.isVisible("#p-del"), false, "nothing to delete yet");
await p.fill("#p-name", "Kitchen renovation"); await p.fill("#p-ins", "Prices in euros, suppliers in Portugal.");
await p.setInputFiles("#p-add", [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Wall is 3.2 m wide.") }, { name: "budget.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK") }]);
await p.waitForFunction(() => document.querySelectorAll("#p-files > div").length === 2, null, { timeout: 8000 }); assert.match(await p.textContent("#p-files"), /notes\.txt[\s\S]*budget\.csv/);
await p.click("#p-form button[type=submit]"); await p.waitForTimeout(300);
assert.equal(await p.isVisible("#pdlg"), false); assert.deepEqual(await chips(), ["All", "Kitchen renovation*", "Edit project", "+ Project"]);
assert.match(await p.textContent("#pnote"), /New chats go into “Kitchen renovation”: its instructions and 2 files go with every message/);
ok("+ Project makes one: name, instructions, a text file and a spreadsheet (read as CSV); it becomes the active project");

await ask("How much will tiles cost for the wall?");
const kitchen = (await LSget("projects"))[0]; let sent = bodies.at(-1).project;
assert.equal(sent.name, "Kitchen renovation"); assert.equal(sent.instructions, "Prices in euros, suppliers in Portugal."); assert.deepEqual(sent.files.map((f) => [f.name, f.text]), [["notes.txt", "Wall is 3.2 m wide."], ["budget.csv", "Item,EUR\nTiles,480\nGrout,35"]]);
assert.equal((await LSget("chats"))[0].project, kitchen.id);
await ask("And grout?"); assert.equal(bodies.at(-1).project.name, "Kitchen renovation", "every message in it, not just the first");
ok("a new chat goes into the active project and every message sends its instructions and files");

// a second project: a fresh chat starts in it; the chips filter the sessions
await p.click("#projs [data-pedit='']"); await p.fill("#p-name", "Garden"); await p.fill("#p-ins", "Small north-facing garden."); await p.click("#p-form button[type=submit]"); await p.waitForTimeout(300);
assert.equal(await p.locator(".m.user").count(), 0, "a new project starts a new chat");
await ask("What grows in shade?"); assert.equal(bodies.at(-1).project.name, "Garden"); assert.equal(await p.locator("#hist .sess").count(), 1, "only Garden's chats");
await p.click("#projs button:has-text('All')"); assert.equal(await p.locator("#hist .sess").count(), 2); assert.match(await p.textContent("#hist"), /Garden[\s\S]*Kitchen renovation/, "under All, each session shows its project");
await p.click("#projs button:has-text('Kitchen renovation')"); assert.equal(await p.locator("#hist .sess").count(), 1); assert.match(await p.textContent("#hist .sess"), /tiles/i);
assert.equal(await p.locator(".m.user").count(), 0, "picking a project leaves a chat from another one");
ok("each project's chips show only its sessions; All shows every session with its project");

// move a session to another project from ⌘K
await p.evaluate(() => document.querySelector("#hist .sess").click()); await p.waitForSelector(".m.ai");
await p.click("#cmdk-btn"); await p.fill("#cq", "move garden"); await p.waitForTimeout(150); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
const garden = (await LSget("projects")).find((x) => x.name === "Garden"); assert.equal((await LSget("chats")).find((c) => /tiles/i.test(c.title)).project, garden.id);
await ask("Is it shady there?"); assert.equal(bodies.at(-1).project.name, "Garden", "the next message carries the new project");
ok("⌘K moves a session to another project; its next message carries that project");

// edit: remove a file; delete: the chats stay, outside any project
await p.click("#projs button:has-text('Kitchen renovation')"); await p.click("#projs [data-pedit]:has-text('Edit project')"); await p.waitForSelector("#pdlg[open]");
assert.equal(await p.inputValue("#p-name"), "Kitchen renovation"); await p.click("#p-files [data-pfx='0']"); await p.click("#p-form button[type=submit]"); await p.waitForTimeout(200);
assert.deepEqual((await LSget("projects")).find((x) => x.name === "Kitchen renovation").files.map((f) => f.name), ["budget.csv"]);
await p.click("#projs button:has-text('Garden')"); await p.click("#projs [data-pedit]:has-text('Edit project')"); await p.click("#p-del"); await p.waitForTimeout(300);
assert.deepEqual(await chips(), ["All*", "Kitchen renovation", "+ Project"]); const C = await LSget("chats");
assert.equal(C.length, 2, "its chats stay"); assert.ok(C.every((c) => c.project !== garden.id)); assert.equal(await p.locator("#hist .sess").count(), 2);
ok("a project's files can be removed; deleting a project keeps its chats, outside any project");

await p.reload(); await p.waitForTimeout(700); assert.deepEqual(await chips(), ["All*", "Kitchen renovation", "+ Project"]); ok("projects are kept on the device");
const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(wide <= 1, "sideways scroll " + wide);
assert.deepEqual(errs, []); await b.close(); console.log("all passed", DEV); process.exit(0);
