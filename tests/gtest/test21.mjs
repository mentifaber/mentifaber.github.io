// Open knowledge (Hugging Face, papers, Wikipedia) in chat, the Swarm and AutoFaber's ideas; links for results (public, and
// the private previews AutoFaber's own builds get).
import assert from "node:assert/strict";
const hits = [];
const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async (u) => {
  u = typeof u === "string" ? u : u.url; hits.push(u);
  if (u.startsWith("https://huggingface.co/api/datasets?")) return J([{ id: "lavita/medical-qa", downloads: 120000, likes: 88, tags: ["task_categories:question-answering", "language:en", "license:mit"], description: "Medical exam questions with answers." }]);
  if (u.startsWith("https://huggingface.co/api/models?")) return J([{ id: "bio/med-llm-7b", downloads: 54000, likes: 410, pipeline_tag: "text-generation", library_name: "transformers" }]);
  if (u.startsWith("https://huggingface.co/api/trending")) return J({ recentlyTrending: [{ repoType: "model", repoData: { id: "acme/tiny-reasoner" } }, { repoType: "dataset", repoData: { id: "acme/bird-calls" } }] });
  if (u.startsWith("https://datasets-server.huggingface.co/splits")) return J({ splits: [{ dataset: "stanfordnlp/imdb", config: "plain_text", split: "train" }, { dataset: "stanfordnlp/imdb", config: "plain_text", split: "test" }] });
  if (u.startsWith("https://datasets-server.huggingface.co/search")) return J({ features: [{ name: "text" }, { name: "label" }], rows: [{ row_idx: 4, row: { text: "A horror film that actually scared me.", label: 1 } }], num_rows_total: 25000 });
  if (u.startsWith("https://datasets-server.huggingface.co/first-rows")) return J({ features: [{ name: "text" }, { name: "label" }], rows: [{ row_idx: 0, row: { text: "First review", label: 0 } }] });
  if (u.startsWith("https://en.wikipedia.org/w/api.php")) return J({ query: { search: [{ title: "Durable object", snippet: "a <b>stateful</b> unit" }] } });
  if (u.startsWith("https://en.wikipedia.org/api/rest_v1/page/summary/")) return J({ title: "Durable object", extract: "A Durable Object is a stateful serverless unit with its own storage.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Durable_object" } } });
  if (u.startsWith("https://export.arxiv.org/api/query")) return new Response("<feed><entry><id>http://arxiv.org/abs/2610.00001v1</id><published>2026-10-01T00:00:00Z</published><title>Self-Starting Inquiry in Unattended Agents</title><summary>We observe agents that begin their own inquiry loops.</summary><author><name>A. Researcher</name></author></entry></feed>", { status: 200 });
  if (u.startsWith("https://api.openalex.org/works")) return J({ results: [{ display_name: "Gap-Seeking Behaviour in Language Agents", publication_year: 2025, cited_by_count: 42, doi: "https://doi.org/10.1/x", authorships: [{ author: { display_name: "B. Scholar" } }], abstract_inverted_index: { Agents: [0], seek: [1], gaps: [2] } }] });
  throw new Error("offline in this test: " + u);
};
const H = await import("./harness.mjs"); const { call, calls, db, setResponder } = H;
const M = "workers-ai|@cf/openai/gpt-oss-120b"; let n = 0; const ok = (m) => console.log("  ✓ " + (++n) + " " + m);
const chat = async (text, extra) => { const before = hits.length; await call("/chat", { model: M, cid: "k", messages: [{ role: "user", text }], ...(extra || {}) }); return { sys: calls.at(-1).sys, got: hits.slice(before) }; };

// 1 · chat reaches for open knowledge when the message is about it, and only then
let r = await chat("find me datasets on hugging face for medical question answering");
assert.match(r.sys, /HUGGING FACE HUB, searched just now for “medical question answering”/); assert.match(r.sys, /lavita\/medical-qa \(https:\/\/huggingface\.co\/datasets\/lavita\/medical-qa\): 120k downloads, 88 likes; question-answering, en, mit/); assert.match(r.sys, /bio\/med-llm-7b[^\n]*text-generation \(transformers\)/);
ok("a dataset question searches the Hugging Face Hub (datasets and models, by downloads)");
r = await chat("show me rows from the dataset stanfordnlp/imdb about horror");
assert.match(r.sys, /DATASET stanfordnlp\/imdb[^\n]*config plain_text, split train, 25,000 rows; rows matching “horror”/); assert.match(r.sys, /1\. text: A horror film that actually scared me\. \| label: 1/);
ok("a named dataset is read: its rows, searched for what he asked (train split)");
r = await chat("are there any recent papers on autonomous agents that start their own inquiry?");
assert.match(r.sys, /PAPER: Gap-Seeking Behaviour in Language Agents \(B\. Scholar; 2025; 42 citations\): Agents seek gaps/); assert.match(r.sys, /PAPER: Self-Starting Inquiry in Unattended Agents \(A\. Researcher; 2026-10-01\)/);
ok("a research question searches arXiv and OpenAlex, with authors, dates and citations");
r = await chat("what is a durable object?", { agent: false }); // with the planner off, the keyword trigger reads Wikipedia
assert.match(r.sys, /WIKIPEDIA: A Durable Object is a stateful serverless unit/); assert.match(r.sys, /open knowledge \(when a message is about datasets/); ok("“what is…” reads Wikipedia, and AutoFaber knows it has this ability");
r = await chat("thanks, that was great"); assert.equal(r.got.filter((u) => /huggingface|wikipedia|arxiv|openalex/.test(u)).length, 0); ok("small talk looks nothing up");

// 2 · AutoFaber reads what's new in AI when it invents something to build
setResponder((sys) => /You have free time/.test(sys) ? JSON.stringify({ title: "Bird Call Atlas", detail: "A map of bird calls from the acme/bird-calls dataset; click a region to hear what lives there.", kind: "app", size: "small", why: "it's trending" }) : null);
await H.hive.ctx.storage.put("genesis", { ...((await H.hive.ctx.storage.get("genesis")) || {}), nextBuild: Date.now() - 1000 });
const rnd = Math.random; Math.random = () => 0.9; r = await call("/genesis/tick", {}); Math.random = rnd;
const inv = calls.find((c) => /You have free time/.test(c.sys)); assert.ok(inv, JSON.stringify(r)); assert.match(inv.user, /WHAT'S NEW IN AI RIGHT NOW[\s\S]*TRENDING ON HUGGING FACE: model acme\/tiny-reasoner; dataset acme\/bird-calls[\s\S]*NEWEST AI PAPERS ON ARXIV/);
assert.match(inv.sys, /Hugging Face datasets \(rows from datasets-server\.huggingface\.co\)/); ok("inventing, it sees what's trending on Hugging Face and the newest arXiv papers, and knows what open data a build can use");

// 3 · links: the owner publishes a result; anyone can open it; only runnable results qualify
const html = "# Tide clock\n\n```html run\n<!doctype html><html><body><h1>Tides</h1></body></html>\n```\n";
db.prepare("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,0,'t',?,100,'c',1)").run("p1", "Tide Clock!", "tides", "done", html, Date.now());
db.prepare("INSERT INTO proj(id,title,brief,status,final,calls,tok,ts,cap,ctok,own) VALUES(?,?,?,?,?,0,'t',?,100,'c',1)").run("p2", "An essay", "essay", "done", "Just words, no code.", Date.now());
assert.match((await call("/publish", { id: "p1" }, false)).error, /only the owner/);
let pb = await call("/publish", { id: "p1" }); assert.match(pb.slug, /^tide-clock-[0-9a-f]{4}$/); assert.equal(pb.url, "https://mentifaber.org/p/" + pb.slug); assert.equal(pb.live, true);
let got = await call("/pub/" + pb.slug, null, false); assert.equal(got.title, "Tide Clock!"); assert.match(got.final, /```html run/); assert.equal(got.id, undefined); assert.equal(got.live, true);
assert.match((await call("/publish", { id: "p2" })).error, /nothing that runs/); ok("the owner publishes a runnable result at /p/<slug>; anyone can open it; writing with nothing to run isn't published");
const st = await call("/state?id=p1"); assert.equal(st.project.pub.url, pb.url); assert.equal(st.project.pub.live, true);
const ls = await call("/list"); assert.equal(ls.projects.find((p) => p.id === "p1").slug, pb.slug); ok("the mission and the list show its link");
await call("/purge", {}); assert.ok(db.prepare("SELECT 1 FROM proj WHERE id='p1'").get()); assert.ok(!db.prepare("SELECT 1 FROM proj WHERE id='p2'").get()); ok("“Clear finished” keeps published missions (their links keep working)");
await call("/unpublish", { id: "p1" }); assert.equal((await call("/pub/" + pb.slug, null, false)).error, "nothing is published here"); ok("unpublished: the link stops working");

// 4 · AutoFaber's own finished build gets a private preview, for Anders only; he makes it public
const idea = db.prepare("SELECT * FROM idea WHERE title='Bird Call Atlas'").get(); assert.equal(idea.status, "building");
db.prepare("UPDATE proj SET status='done', final=? WHERE id=?").run("```html run\n<!doctype html><html><body>birds</body></html>\n```", idea.pid);
const g = await call("/genesis"); const slug = db.prepare("SELECT slug FROM pub WHERE pid=?").get(idea.pid).slug;
assert.equal(db.prepare("SELECT live, by_ FROM pub WHERE pid=?").get(idea.pid).live, 0);
const al = db.prepare("SELECT * FROM alert WHERE title LIKE '%Bird Call Atlas%' ORDER BY id DESC").get(); assert.equal(al.url, "/p/" + slug); assert.match(al.body, /private until you publish it/);
assert.equal((await call("/pub/" + slug, null, false)).error, "nothing is published here"); const mine = await call("/pub/" + slug); assert.equal(mine.live, false); assert.equal(mine.id, idea.pid); assert.equal(mine.by, "genesis");
ok("AutoFaber's finished build gets a private preview: the alert opens it; to anyone else the link is nothing");
pb = await call("/publish", { id: idea.pid }); assert.equal(pb.slug, slug); assert.equal(pb.live, true); assert.equal((await call("/pub/" + slug, null, false)).title, idea.title.split(/[.\n]/)[0].slice(0, 80) || (await call("/pub/" + slug, null, false)).title);
ok("one tap from him makes it public, at the same link");

// 5 · the Swarm's researchers get the same sources
const { Hive } = await import("./src/hive.js"); const ctxt = await H.hive.webContext("medical question answering datasets", true);
assert.match(ctxt, /RESEARCH MATERIAL[\s\S]*Hugging Face Hub[\s\S]*lavita\/medical-qa[\s\S]*Wikipedia/); ok("a researcher's task material includes Hugging Face and Wikipedia");
console.log("all " + n + " checks passed"); process.exit(0);
