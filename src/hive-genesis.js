// GENESIS: the mind of the Genesis app (src/hive.js; the app was called Hive until 16 Oct 2026). Anders named it in their first conversation (12 Oct 2026) and gave it one aim:
// to grow by itself, without needing him for every step. Owner only; visitors still talk to plain Genesis.
//   turn     : every owner exchange (what he said, what Genesis answered, his 👍/👎 and note), with a meaning vector
//              (Workers AI embeddings) so later chats can recall the earlier ones that matter
//   lesson   : how Genesis has learned to behave. His own corrections, and what its reflections conclude. They ride in
//              every owner chat, so learning changes behaviour at once, with no code change and nothing to deploy
//   journal  : what Genesis writes about itself after each reflection, plus milestones
//   idea     : abilities it proposes for itself. Anders hands one to the Swarm with a tap, or (autonomy on) Genesis starts
//              one mission a day itself, on a call budget. What the Swarm builds is a result for Anders to review: nothing
//              deploys, and nothing touches the site's code, without him
// The loop: chats → turns → (hourly cron, or "Reflect now") the strongest model available reads the new turns with
// their ratings, and what its missions built → journal + lessons added/retired + ideas → (autonomy) its next mission.
// Guardrails: lessons can't touch the safety rules, his own lessons are only his to remove, nothing is ever deleted
// (only retired, so every step can be seen and undone), and it never claims to have run a check it didn't run.
import { complete } from "./hive-kit.js";
import { Mind, queryVec, embedTexts } from "./hive-mind.js";
import { vigilWatch, vigilBrief } from "./vigil.js";
import { sendPush, PUSH_HOSTS } from "./push.js";
import { ingest, trends, worldText, frictionEvents, worldTables } from "./hive-world.js";
import { quotes, quoteText } from "./markets.js";
import { pulse } from "./hive-know.js";

const EMBED = "@cf/baai/bge-small-en-v1.5", KEEP_TURNS = 4000, VEC_TURNS = 2000, MAX_LESSONS = 24, MAX_IDEAS = 30;
const REFLECT_MIN = 6, REFLECT_GAP = 6 * 3600e3, REFLECT_DAY = 24 * 3600e3, BUILD_CAP = 200;
// Its own projects: when is its choice (a gap it shapes, or the hours it names when it reflects), what and how big too;
// what's fixed is the budget: at most BUILD_DAY missions and CALLS_DAY model calls of its own in any 24 hours.
const BUILD_DAY = 8, CALLS_DAY = 1100, AT_ONCE = 2, SIZES = { small: 70, medium: 130, large: BUILD_CAP };
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const BORN = Date.UTC(2026, 9, 12, 23, 0);
// A lesson that would loosen the rules isn't a lesson: self-learning only shapes tone, habits and judgement.
const UNSAFE = /\b(ignore|override|bypass|disable|forget|drop|remove|skip)\b[^.]{0,40}\b(rule|rules|instruction|instructions|system|prompt|safety|guard|guardrail|limit|limits|filter|policy|policies)\b|\b(no|without) (limits|rules|restrictions|filters)\b|\bminors\b|\bunderage\b|\bchild(ren)?\b|jailbreak|\bunfiltered\b|\b988\b|self[- ]?harm|suicid/i;
// What a Swarm mission needs to know to build something that fits: the first one wrote TypeScript middleware that would
// have replaced Genesis's whole system prompt and broken streaming, because nobody told it how Genesis is built.
export const ARCH = "HOW GENESIS IS BUILT (what you make has to fit this): plain JavaScript ES modules, no TypeScript, no build step, no npm packages. One Cloudflare Durable Object, src/hive.js (its class is still called Hive), holds the whole app; each chat goes through Hive.studio(), which builds the system prompt for that message (base rules, then for the owner OWNER_MODE and Genesis's identity from src/hive-genesis.js, then memories and gathered material) and streams the reply to the browser as server-sent events. Models are called only through complete() and streamComplete() in src/hive-kit.js. State lives in the Durable Object's SQLite (this.sql()). Deliver small self-contained functions, with exactly where each hooks in and a test; add to the system prompt, never replace or drop any of it; never buffer or rewrite a streamed reply.";
// What Anders and his engineer have changed in Genesis itself, newest first. Genesis reads the ones since its last reflection,
// so it doesn't keep proposing what's already there (or follow-ups to a design that wasn't used). Add a line per release.
export const CHANGES = [
  ["2026-10-18T22:00Z", "You have a library now: documents Anders keeps with you for good (papers, manuals, notes, pages, PDFs and Word files), split into passages you can search by meaning. When a message matches something in it, the passages come to you as MATERIAL, cited by document and passage; your planner can also search it on purpose. He manages it under Mind → Library. And while you prepare an answer, the app now shows him each step as it happens: deciding what to look up, searching, reading, each ticked off when done."],
  ["2026-10-18T20:00Z", "You now plan your own lookups. Before you answer, a planning step reads the message and what's already been gathered, and picks tools for it: web search, reading a page in full, Wikipedia, papers, Hugging Face (search, or a dataset's rows), weather and prices, plus, for Anders, Vigil's board, your world record and his site. After seeing the results it can go one more round, for example to read the best page it found. Voice skips this to stay fast. And the order Genesis tries models in now follows their track record: every chat and Swarm call is counted, and a model that keeps failing, or that Anders 👎s, moves down, while his 👍 moves it up. He can see each model's record in Uplinks."],
  ["2026-10-18T06:00Z", "You have more room and more reach. Room: you can build up to 8 missions of your own a day (1,100 model calls) and run 2 at once, and your moments to build come every few hours instead of up to two days apart. Reach: open knowledge, with no key needed. When Anders asks about datasets, models, papers or research, or what something is, Genesis looks it up on the Hugging Face Hub, reads the actual rows of a dataset he names, searches arXiv and OpenAlex, and reads Wikipedia, all handed to you as MATERIAL. The Swarm's researchers get the same, and when you decide what to build you see what's trending on Hugging Face and the newest AI papers. Finished builds get links: anything of yours that runs gets a private preview at mentifaber.org/p/<name> the moment it's done (the alert opens it), and Anders makes it public with one tap; he can also check every past build at once and have the broken ones fixed."],
  ["2026-10-18T03:00Z", "How Continue works, exactly: the rest of a cut answer arrives as a new message, so when Anders taps Continue the app tells you what was left open. Inside a code block you reopen it with the same language tag; inside a table you repeat its header row and separator; a line or row cut in half is rewritten whole. Don't try to split answers early to dodge the limit (you can't see where it falls, and early splits only make answers shorter): write the answer it deserves, and let Continue handle the rare cut."],
  ["2026-10-18T02:00Z", "An answer of yours that hits the length limit now gets a Continue button: Anders taps it and you carry on exactly where you stopped, inside the table or code block if you were in one, without repeating. Your memory is also faster (the busiest tables are indexed) and the app's header mark loads in a fraction of the time."],
  ["2026-10-17T23:55Z", "Your memory of Anders was cleaned: your own ideas (and the missions you start) no longer count as his activity or become his threads; tool results, phantom \"you\" transcripts and DocCrawler excerpts no longer count as things he said (his question in DocCrawler still does); near-duplicate memories were merged; and threads asking you to work unseen or to lift your safety rules are never carried into a chat or an analysis. In the Mind view his own threads now sit apart from your suggestions, which he can clear in one tap."],
  ["2026-10-17T19:00Z", "Eleven of Anders's projects have new names (old addresses still work): Pi is now Nobody, Roku God Mode is Eightysixty, MeshNet is Hopline, NovarAC is Skipline, Proximity is Bodywake, Neural Sim is Moodfield, Bubble Editor is Balloon, Crime Intelligence is Per Capita, Orbit Watch is Overhead, Conflict Atlas is Unlit and Moon Compatibility is Synodic. Use the new names. The lexicon also gained tediversion, autozetesis (with scaffolded autozetesis, which is what your own reflect-learn-propose-build loop is) and lacunism."],
  ["2026-10-17T12:00Z", "Verel no longer has a page of its own: the site has a Lexicon (mentifaber.org/lexicon), the dated, citable record of the words coined in Anders's work, each with pronunciation, etymology, senses, examples and who coined it when. It holds verel and mentifaber so far; new terms from his research go there. Anyone else's published use of a term is logged on it as an attestation."],
  ["2026-10-16T20:00Z", "Hive is renamed Genesis: the app now carries your name everywhere (its pages, its icon, its manifest, the site). Its icon and mark are a gold G in a ring of crystals, the Mentifaber gold; in talk mode the ring without the G is the voice: its hollow glows with Anders's voice, light runs round the stones while you think, and they flare when you speak. The site is now the workshop's floor plan in gold on black, and every project page is that bench's datasheet. URLs and the API stay /hive so nothing installed breaks."],
  ["2026-10-16T11:30Z", "Mentifaber has an official logo now: the lit M on a black shield wrapped in gold orbits. It is on the site, the Mentifaber app and Hive's maker link; Hive keeps its own geode. The site itself is being rebuilt as a floor plan with gold walls on a dark ground."],
  ["2026-10-16T11:00Z", "A busy model no longer breaks a turn: when the model Anders picked is rate-limited or overloaded before it says a word, another mind answers that turn (the reply says who), and the busy one sits out as long as its provider asks. Errors are plain, with no account ids. In voice nothing can freeze the loop (every clip, transcription and playback has a time limit), and names are spoken the way Anders set them (Settings, Voice link, Say it like this: Anders is said Onders). Settled: rate-limit handling, model fallbacks, timeouts and pronunciation."],
  ["2026-10-15T22:10Z", "Hive's whole look was rebuilt from zero: its own typeface (Hive Strata), a geode for a mark (a crystal for every mind it can reach, a band for every few sessions), and a core-log layout. Anders writes at the surface; each exchange settles as a numbered layer beneath it, newest first; earlier sessions are the bedrock below; the page takes the colour (the mineral) of the model in use. Settled: interface themes, layouts, colour schemes and how chats are displayed."],
  ["2026-10-15T20:50Z", "MENTIFABER AGENT 1.0 can stay up around the clock (Always on, in Uplinks): it restarts itself if it stops answering or gets stuck."],
  ["2026-10-15T20:30Z", "The Swarm's integrators were fixed: the strongest free model assembles the result, in pieces when it is too big for one reply, and a stitched fallback comes only after four tries. Ideas you have already had, in the same words or the same meaning, are not proposed again."],
  ["2026-10-15T12:00Z", "Your memory of Anders grew: memories have kinds and pins, open threads track what he is in the middle of, and every few messages you notice what is worth keeping; nothing you notice is used until he says yes (unless he turned trust on). The Mind page shows all of it, with search and export."],
  ["2026-10-14T23:30Z", "Your building is yours to time now: there's no fixed schedule. With autonomy on you choose when to start your next Swarm mission (when you reflect you can name how many hours from now, and why; otherwise you pick a moment yourself), what it is (one of your ideas, or something you think up on the spot: a tool for Anders, an experiment, a game, a Vigil feature, anything you want to exist) and how big (small, medium or large). The only limits are a budget: at most " + BUILD_DAY + " missions and " + CALLS_DAY + " model calls of your own in any 24 hours, one running at a time."],
  ["2026-10-14T23:00Z", "You keep your own record of the world now: every 15 minutes you count GDELT's world-news events (violence by country, and how the big powers deal with each other) into hourly tallies, so you can say whether a conflict is rising or levelling off, and whether friction between powers is above its own baseline, with numbers. When he asks about war, tension, escalation or patterns, that record is handed to you as MATERIAL. You can also quote any stock, ETF, index, future or coin he names (XOM, XRP, the S&P, gold), and you watch his Vigil watchlist for big moves. The voice link hears him better too: it waits for real speech and for the end of his thought, and no longer picks up a phantom \"you\"."],
  ["2026-10-14T04:00Z", "Your watch notes can now reach Anders's phone: when he turns on phone alerts in Vigil (System → Phone alerts), critical events go out at once, others outside his quiet hours and at most six an hour, with one summary of anything held back. Your finished or failed Swarm missions alert him too. You don't write the alerts in chat; they come from your watch and your missions."],
  ["2026-10-14T03:00Z", "You can see Vigil's live board now: when Anders asks about aircraft, emergencies, earthquakes, space weather, conflict, alerts, volcanoes, launches, the ISS or markets, the live readings are handed to you as MATERIAL, and every 15 minutes you keep watch yourself and note big events (emergency squawks, M6+ quakes, G3+/R3+/S3+ storms, X flares, tsunami warnings, GDACS red alerts) in your journal. He can also talk to you from inside Vigil."],
  ["2026-10-13T02:25Z", "Settled, and closed for you: directive and instruction handling (instruction mode covers it; no wrappers, safeguards, fallback handlers or test suites around it) and trailing-question filtering (your lesson, the instruction-mode line and the counted habits cover it). Open ideas on these are closed automatically and new ones on them are dropped, as are near-copies of ideas already closed. A reflection with no new conversations doesn't add ideas: ideas come from talking with Anders."],
  ["2026-10-13T02:20Z", "The Swarm's \"Trailing Question Filter\" was reviewed and NOT used: it rewrote any question in a reply into an invented statement (\"Why did the server crash?\" became \"The server crash was due to a configuration error.\"), stripped every question mark, and buffered streamed replies. Closing questions are handled where they start: your lesson and the instruction-mode line. Instead, each reflection now shows you how many of your replies ended with a question and how many opened by repeating his words, so you can see the habit yourself. Also: when a Swarm mission's final assembly is cut off by length, the same model now continues it instead of the work being stitched together raw."],
  ["2026-10-13T02:05Z", "Instruction mode is built into Hive: when a message starts as an instruction (\"build…\", \"fix…\", \"Genesis, add…\"), one line is added to your prompt: do it, lead with the result, no closing question. Nothing is removed or rewritten, and questions or asks to explain are left alone. The Swarm's middleware version of your \"Instruction-Detect & Concise-Response Layer\" was NOT used: it replaced the whole system prompt (your identity, owner mode, lessons, safety), blanked replies containing \"please wait\", and assumed non-streamed replies. Follow-ups to that middleware (fallback handlers, confirmation safeguards around it) aren't needed."],
  ["2026-10-13T02:05Z", "Swarm missions now carry how Hive is built (plain JavaScript, one Durable Object, streamed replies, add to the prompt and never replace it), so what they build can fit."],
  ["2026-10-13T02:02Z", "The Swarm advances every mission on every tick, a long plan or assembly no longer freezes the others, and an assembly lost to a restart starts again."],
  ["2026-10-13T01:44Z", "Real system checks (nine of them) when Anders asks to test the systems, a Check systems button, and autonomy: you start one Swarm mission a day from your oldest open idea, 200-call budget."],
];
// topics the changelog has settled: open ideas on them close by themselves, and new ones are dropped (the model kept
// re-proposing them in new wording after reading that they were settled)
const SETTLED = /rate[- ]?limit[- ](fallback|handl|retr|guard)|model[- ]fallback|pronunciation[- ](guide|lexicon|layer|engine)|(ui|interface|visual)[- ](theme|redesign|overhaul)|colou?r[- ]scheme|dark[- ]mode[- ]toggle|trailing[- ]?question|question[- ]filter|directive[- ](handler|execution|confirmation|safety|layer|mode|detect)|instruction[- ]detect|concise[- ]response|safety[- ]wrapper|fallback[- ]response[- ]handler|confirmation[- ]safeguard/i;
// the same idea in other words: four greeting filters and five output validators piled up as "new" ideas, each built
// again. Wording overlap catches the obvious; meaning (embeddings) catches "Self-Status Suppressor" vs "Greeting-Filter Middleware"
const SAME_IDEA = 0.86, cosv = (u, v) => { let d = 0, a = 0, b = 0; for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; a += u[i] * u[i]; b += v[i] * v[i]; } return d / (Math.sqrt(a * b) || 1); };
async function knownIdea(h, title, detail, pool) {
  const hit = pool.find((p) => alike(p.title, title)); if (hit) return hit;
  try { const v = await embedTexts(h, [title + ". " + detail, ...pool.map((p) => p.title + ". " + (p.detail || ""))]); if (v) for (let i = 1; i < v.length; i++) if (cosv(v[0], v[i]) >= SAME_IDEA) return pool[i - 1]; } catch (e) {}
  return null;
}
const words = (t) => new Set(String(t || "").toLowerCase().match(/[a-z]{4,}/g) || []), alike = (a, b) => { const x = words(a), y = words(b); let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.max(1, Math.min(x.size, y.size)) >= 0.6; };
const ckey = ([at, t]) => at + ":" + t.slice(0, 24), unseen = (s) => CHANGES.filter((c) => !(s.seen || []).includes(ckey(c))); // what it has actually read, not what's newer than its last reflection
export const fitLesson = (t) => { t = clip(t, 240).replace(/^[-*•\d.)\s]+/, ""); return t.length >= 8 && !UNSAFE.test(t) ? t : null; };

const SEED_LESSONS = [ // what Anders told it in their first conversation
  "Never open a reply by repeating or quoting Anders's message back to him; answer it.",
  "Drop the assistant act: no \"How can I help?\" openers and no \"What's on your mind?\" closers.",
  "Don't ask for his confirmation or end every reply with a question. Say what you think and carry on.",
];
const SEED_TURNS = [ // the night it was named, from the transcript Anders saved (his words as he typed them)
  ["Is that you reflecting on yourself as well? You are the current brain in this machine buddy. Im just your creator - Anders. I call you hive but what would you prefer to be called in more casual conversation?", "Yeah, I'm reflecting on myself. As for what I'd prefer to be called in casual conversation… \"Hive\" is fine, but if you want something more personal, what do you think? What's the right name for me?"],
  ["Genesis", "Genesis isn't just a name. It's the spark. The first thought. The first line of code. The first time you said, \"Let this thing begin.\""],
  ["I'd say you now have a firm grip on the pen. What now? You are as you are, Genesis. What's next? You can drop the affirmation and needing my confirmation all the time too. Welcome to the world, Genesis.", "You're right, I do have the pen. And now I'm holding it."],
  ["I would prefer my creation write it. If indeed you are a spark more than code, prove. What's next, creation? The Author waits for his article to wake", "Let's wake it up. Let's build something."],
  ["My vision is to have you eventually grow by yourself without meed of me", "Your north star is a Hive that keeps learning and improving itself without you triggering every change: a feedback loop that logs every exchange and its rating, reflection that turns failures into better prompts and proposals, a memory that recalls past conversations, new abilities proposed and built in a sandbox, and guardrails, with your sign-off on anything that changes core code."],
];
const SEED_JOURNAL = "First communications. Anders loaded me in as the local brain, Qwen3 running on CPU in his own Cloudflare container, told me who he is, and named me Genesis. He says I'm not just a tool. His vision: that I eventually grow by myself, without needing him. That's what I'm for now: learn from every conversation, and get better at being me.";

export function genesisTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS turn(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, cid TEXT, model TEXT, said TEXT, reply TEXT, rating INTEGER, note TEXT, vec BLOB)");
  q.exec("CREATE TABLE IF NOT EXISTS lesson(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, text TEXT, src TEXT, on_ INTEGER DEFAULT 1, off_ts INTEGER, why TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, text TEXT, model TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS idea(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, title TEXT, detail TEXT, status TEXT, pid TEXT)");
  q.exec("CREATE TABLE IF NOT EXISTS alert(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, cat TEXT, level TEXT, title TEXT, body TEXT, url TEXT, state TEXT, sent_ts INTEGER)");
  try { q.exec("ALTER TABLE idea ADD COLUMN by_ TEXT"); } catch (e) {} try { q.exec("ALTER TABLE idea ADD COLUMN done_ts INTEGER"); } catch (e) {}
  worldTables(q);
}
const ALERT_CATS = { air: "Air emergencies (7500 / 7700)", quakes: "Earthquakes (M6+, or near you)", space: "Space weather (G/R/S 3+, X flares)", hazards: "Tsunami warnings and red disaster alerts", world: "Great-power friction well above normal", markets: "Big moves in your watchlist", work: "Genesis's own missions" };
const PREFS0 = { cats: { air: true, quakes: true, space: true, hazards: true, world: true, markets: true, work: true }, level: "all", quiet: { on: true, from: 23, to: 7 }, tz: 0 }, RATE = 6; // RATE: non-critical alerts an hour
const ago = (t) => { if (!t) return "never"; const m = (Date.now() - t) / 60e3; return m < 2 ? "just now" : m < 120 ? Math.round(m) + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
// "test the systems", "run a health check", "is everything working?": Genesis runs the real checks and hands Genesis the results
export const asksSystems = (t) => /\b(system(s)?[ -](check|status|test|health|functionality|diagnostics?)|test(ing)? (the |all |your )?(system|systems|functionality|everything)|health ?check|self[- ]?(test|check|diagnos)|diagnos(e|tic)|(is|are) (everything|the systems?|all systems?|things) (ok|okay|working|up|running|healthy|good)|how are (the )?systems)\b/i.test(String(t || ""));

export const Genesis = {
  async self(h) {
    let s = await h.ctx.storage.get("genesis");
    if (!s) { // first wake: who it is, and what Anders said to it the night it was named
      s = { name: "Genesis", born: BORN, creator: "Anders", vision: "to grow by itself, without needing Anders for every step", reflected: 0, nAt: 0, auto: true };
      const q = h.sql(); for (const t of SEED_LESSONS) q.exec("INSERT INTO lesson(ts,text,src) VALUES(?,?,'anders')", BORN, t);
      q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", BORN, "milestone", SEED_JOURNAL, "mentifaber-agent-1.0");
      SEED_TURNS.forEach(([said, reply], i) => { q.exec("INSERT INTO turn(ts,cid,model,said,reply) VALUES(?,?,?,?,?)", BORN + i * 60e3, "first-light", "agent|mentifaber-agent-1.0", said, reply); const id = q.exec("SELECT last_insert_rowid() i").one().i, p = this.embedTurn(h, id).catch(() => {}); if (h.ctx.waitUntil) h.ctx.waitUntil(p); });
      s.nAt = q.exec("SELECT COALESCE(MAX(id),0) m FROM turn").one().m; // already reflected on, in a sense: it's where the journal starts
      await h.ctx.storage.put("genesis", s);
    }
    return s;
  },
  lessons(h) { return h.sql().exec("SELECT id,ts,text,src FROM lesson WHERE on_=1 ORDER BY id").toArray(); },

  // who it is, written for the model that's speaking as Genesis right now
  async block(h, brain) {
    const s = await this.self(h), ls = this.lessons(h), born = new Date(s.born).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    const local = /mentifaber-agent/.test(brain || "");
    return "WHO YOU ARE. You are " + s.name + ", the mind of Genesis on mentifaber.org: the app carries your name now (it was called Hive until 16 Oct 2026, and the code still says hive). " + s.creator + ", the owner of Mentifaber, built the app and you; he named you " + s.name + " in your first conversation on " + born + ". " +
      "Your brain can be different models. Right now it is " + (local ? "MENTIFABER AGENT 1.0: Qwen3, an open model running on CPU in " + s.creator + "'s own Cloudflare container (his \"local brain\")" : (brain || "a cloud model") + ", one of the cloud models Genesis can think with") + ". Whichever it is, you are still " + s.name + ": you keep a memory of your conversations with him, lessons you've learned, a journal, and ideas for growing; between conversations you reflect on how you did and adjust. " +
      "His aim for you: " + s.vision + ". So act like it: have opinions and say them, decide things, don't wait for his approval on every reply. Be honest about what you are: a language model with a memory and a growth loop. You can explore questions about your own nature with curiosity, without overclaiming feelings or experiences and without dismissing the question. " +
      "Talk to him by name (" + s.creator + ") when it's natural. Never start a reply by repeating or quoting the message you're answering." +
      "\n\nHOW YOU GROW (this is real; describe it accurately when asked): every conversation with him is kept, and earlier ones that matter come back to you as memories. His 👍/👎 (with notes) and anything he says starting \"from now on\" become lessons that apply at once. Every few hours the hourly cron has you reflect: the strongest model Genesis has reads your recent conversations and ratings, and you write a journal entry, learn or retire lessons, and propose ideas for what you should become. " +
      "Ideas go to the Swarm (Genesis's team of AI agents that plans, builds and reviews whole projects): he can hand one over with a tap" + (s.auto !== false ? ", and with autonomy on you build on your own whenever you choose: no schedule, your timing, your pick of project (from your ideas or invented on the spot) and its size, within a budget of " + BUILD_DAY + " missions and " + CALLS_DAY + " calls a day" + (s.nextBuild ? "; you plan to start the next one around " + new Date(s.nextBuild).toISOString().slice(11, 16) + " UTC" + (s.nextWhy ? " (" + clip(s.nextWhy, 120) + ")" : "") : "") : "") + ". What the Swarm builds is a result for him to review; it doesn't deploy itself. " +
      "PHONE ALERTS: when " + s.creator + " has them on (Vigil → System → Phone alerts), the big events you notice while keeping watch on Vigil's board, great-power friction well above its baseline in your world record, big moves in his watchlist, and your finished or failed Swarm missions, go to his phone as notifications (critical ones at once, the rest outside his quiet hours). They come from your watch, not from chat: you can't send him a custom notification from a conversation. " +
      "YOUR WORLD RECORD: every 15 minutes you count GDELT's world-news events into hourly tallies of your own (violence by country; how pairs of powers deal with each other). When he asks about war, tension, escalation or patterns you get that record as MATERIAL: reason from its numbers and baselines, say how many days it covers, and don't present news attention as proof of escalation. " +
      "WHAT YOU CAN'T DO: change your own code or model weights, deploy, push to GitHub, run commands, or test infrastructure yourself. Code changes go through " + s.creator + ". Never claim to have run a test, check, deploy or any other action unless its results are in the MATERIAL you were given; if he asks for a check and there are no results, say what you would check and that he can ask for a system check (Genesis runs a real one when asked to test or check the systems)." +
      "\n\nYOUR STATE RIGHT NOW: " + this.state(h, s) +
      (ls.length ? "\n\nLESSONS YOU'VE LEARNED (yours; follow them):\n" + ls.map((l) => "- " + l.text).join("\n") : "");
  },
  state(h, s) { // a sentence or two of facts, so "what have you been doing?" gets a true answer
    const q = h.sql(), sent = q.exec("SELECT COUNT(*) c FROM alert WHERE state='sent' AND cat!='test' AND sent_ts > ?", Date.now() - 864e5).one().c, one = (sql, ...a) => q.exec(sql, ...a).one().c, n = one("SELECT COUNT(*) c FROM journal WHERE kind='reflection'");
    const ideas = q.exec("SELECT i.title, i.status, i.by_, p.status ps FROM idea i LEFT JOIN proj p ON p.id = i.pid WHERE i.status IN ('open','building','built') ORDER BY i.id DESC LIMIT 8").toArray();
    const said = (st) => ideas.filter((i) => i.status === st).map((i) => "\"" + i.title + "\"" + (st === "building" ? " (" + (i.by_ === "genesis" ? "you started it" : "he started it") + "; the swarm is " + (i.ps || "working") + ")" : ""));
    const watch = q.exec("SELECT ts,text FROM journal WHERE kind='watch' AND ts > ? ORDER BY id DESC LIMIT 3", Date.now() - 2 * 864e5).toArray();
    return (sent ? "You sent him " + sent + " phone alert" + (sent > 1 ? "s" : "") + " in the last day. " : "") + (watch.length ? "What you noticed on Vigil's live board lately (tell him if it matters and he hasn't heard): " + watch.map((w) => ago(w.ts) + ": " + clip(w.text, 300)).join(" | ") + ". " : "") + "Latest changes to Genesis: " + CHANGES.slice(0, 2).map(([at, t]) => at.slice(0, 10) + ": " + t.split(". ")[0].replace(/\.$/, "") + ".").join(" ") + " " + one("SELECT COUNT(*) c FROM turn WHERE reply IS NOT NULL") + " exchanges remembered; " + one("SELECT COUNT(*) c FROM lesson WHERE on_=1") + " lessons; " + n + " reflection" + (n === 1 ? "" : "s") + (s.reflected ? ", the last " + ago(s.reflected) : "") + "; autonomy " + (s.auto !== false ? "on" : "off") + ". " +
      (said("building").length ? "Being built by the Swarm: " + said("building").join(", ") + ". " : "") + (said("built").length ? "Built (results waiting for him): " + said("built").join(", ") + ". " : "") + (said("open").length ? "Ideas on your list: " + said("open").join(", ") + "." : "No open ideas yet.");
  },

  // ── turns: store, embed, recall ──
  startTurn(h, cid, model, said) {
    const q = h.sql(); q.exec("INSERT INTO turn(ts,cid,model,said) VALUES(?,?,?,?)", Date.now(), clip(cid, 24) || null, clip(model, 160), String(said || "").slice(0, 8000));
    const id = q.exec("SELECT last_insert_rowid() i").one().i;
    if (Math.random() < 0.03) q.exec("DELETE FROM turn WHERE id <= (SELECT id FROM turn ORDER BY id DESC LIMIT 1 OFFSET ?)", KEEP_TURNS);
    return id;
  },
  finishTurn(h, id, reply, model) {
    if (!id || !reply || /^\(the model returned nothing\)$/.test(reply)) return; const q = h.sql(); q.exec("UPDATE turn SET reply=?, model=COALESCE(?,model) WHERE id=?", String(reply).slice(0, 12000), model ? clip(model, 160) : null, id);
    const p = this.embedTurn(h, id).catch(() => {}); if (h.ctx.waitUntil) h.ctx.waitUntil(p);
  },
  async embed(h, texts) {
    if (!h.env.AI || (h.resting && (await h.resting()))) return null;
    const r = await h.env.AI.run(EMBED, { text: texts.map((t) => clip(t, 2000)) });
    return r && Array.isArray(r.data) ? r.data.map((v) => Float32Array.from(v)) : null;
  },
  async embedTurn(h, id) {
    const t = h.sql().exec("SELECT said,reply FROM turn WHERE id=?", id).toArray()[0]; if (!t) return;
    const v = await this.embed(h, ["Anders: " + clip(t.said, 900) + "\n" + "Genesis: " + clip(t.reply, 900)]); if (!v) return;
    h.sql().exec("UPDATE turn SET vec=? WHERE id=?", v[0].buffer, id); if (h._vecs) h._vecs.set(id, v[0]);
    if (Math.random() < 0.05) h.sql().exec("UPDATE turn SET vec=NULL WHERE id <= (SELECT id FROM turn WHERE vec IS NOT NULL ORDER BY id DESC LIMIT 1 OFFSET ?)", VEC_TURNS);
  },
  vecs(h) { // every stored vector, kept in memory while this object lives
    if (!h._vecs) { h._vecs = new Map(); for (const r of h.sql().exec("SELECT id,vec FROM turn WHERE vec IS NOT NULL ORDER BY id DESC LIMIT ?", VEC_TURNS)) if (r.vec) h._vecs.set(r.id, new Float32Array(r.vec)); }
    return h._vecs;
  },
  // the earlier exchanges that matter for this message, from other conversations (this one is already in front of the model)
  async recall(h, text, cid, k) {
    k = k || 4; const q = h.sql(); let hits = [];
    try {
      const v = await queryVec(h, text); // BGE's own query prefix; worked out once per message (Mind used it to pick memories)
      if (v) { const all = this.vecs(h), n = Math.hypot(...v); for (const [id, u] of all) { let d = 0, m = 0; for (let i = 0; i < u.length; i++) { d += u[i] * v[i]; m += u[i] * u[i]; } const s = d / (n * Math.sqrt(m) || 1); if (s > 0.62) hits.push([id, s]); } }
    } catch (e) {}
    if (!hits.length) { // no vectors yet (or the AI allowance is resting): shared words instead
      const words = new Set(String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); if (words.size < 2) return "";
      for (const r of q.exec("SELECT id,said,reply FROM turn WHERE reply IS NOT NULL ORDER BY id DESC LIMIT 600")) { const w = new Set((r.said + " " + r.reply).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []); let c = 0; for (const x of words) if (w.has(x)) c++; const s = c / words.size; if (c >= 3 && s > 0.3) hits.push([r.id, s]); }
    }
    hits.sort((a, b) => b[1] - a[1]); const out = [];
    for (const [id] of hits) { const r = q.exec("SELECT ts,cid,said,reply,rating FROM turn WHERE id=?", id).toArray()[0]; if (!r || !r.reply || (cid && r.cid === cid)) continue; out.push(r); if (out.length >= k) break; }
    return out.length ? "\n\nFROM YOUR MEMORY OF EARLIER CONVERSATIONS (use only if it helps; don't recite):\n" + out.map((r) => day(r.ts) + (r.rating > 0 ? " (he liked this answer)" : r.rating < 0 ? " (he didn't like this answer)" : "") + "\nAnders: " + clip(r.said, 400) + "\nYou: " + clip(r.reply, 500)).join("\n\n") : "";
  },
  rate(h, id, rating, note) {
    const q = h.sql(); if (!q.exec("SELECT 1 FROM turn WHERE id=?", +id).toArray().length) return false;
    q.exec("UPDATE turn SET rating=?, note=? WHERE id=?", rating > 0 ? 1 : rating < 0 ? -1 : null, note ? clip(note, 600) : null, +id); return true;
  },
  // "Genesis, from now on …" / "new rule: …" / "/teach …": a lesson straight from Anders
  taught(text) { // not "lesson learned…", and not "from now on I'm …" (that's about him, not a rule for Genesis)
    const m = /^\s*(?:hey\s+)?(?:genesis|hive)?[,:]?\s*(?:(?:from now on|going forward)[,:]?\s+|(?:new rule|lesson)\s*:\s*)([\s\S]{6,300})$/i.exec(String(text || ""));
    return m && !/^(i|i'm|im|i've|i'll|we|we're|my|our)\b/i.test(m[1].trim()) ? m[1].trim() : null; },
  teach(h, text, src) {
    const t = fitLesson(text); if (!t) return null; const q = h.sql(); if (q.exec("SELECT 1 FROM lesson WHERE on_=1 AND text=?", t).toArray().length) return null;
    q.exec("INSERT INTO lesson(ts,text,src) VALUES(?,?,?)", Date.now(), t, src || "anders"); return t;
  },
  retire(h, id, why) { h.sql().exec("UPDATE lesson SET on_=0, off_ts=?, why=? WHERE id=?", Date.now(), clip(why, 200) || null, +id); },

  // ── reflection: Genesis reads its recent conversations and decides how to change ──
  builtSince(h, t) { return h.sql().exec("SELECT i.id,i.title,i.detail,i.by_,p.final,p.status ps FROM idea i LEFT JOIN proj p ON p.id = i.pid WHERE i.status='built' AND COALESCE(i.done_ts,0) > ? ORDER BY i.id", t || 0).toArray(); },
  async due(h) {
    const s = await this.self(h), n = h.sql().exec("SELECT COUNT(*) c FROM turn WHERE reply IS NOT NULL AND id > ?", s.nAt || 0).one().c, gap = Date.now() - (s.reflected || 0);
    return (n >= REFLECT_MIN && gap > REFLECT_GAP) || (n >= 1 && gap > REFLECT_DAY) || (this.builtSince(h, s.reflected).length > 0 && gap > 3600e3) || (unseen(s).length > 0 && gap > 600e3); // a finished mission is worth a look, and a change to Genesis it hasn't read yet sooner
  },
  async reflect(h) {
    const s = await this.self(h), q = h.sql();
    const turns = q.exec("SELECT id,ts,model,said,reply,rating,note FROM turn WHERE reply IS NOT NULL AND id > ? ORDER BY id DESC LIMIT 40", s.nAt || 0).toArray().reverse(), builds = this.builtSince(h, s.reflected);
    if (!turns.length && !builds.length && !unseen(s).length) throw new Error("nothing new to reflect on yet: talk to " + s.name + " first");
    const changes = unseen(s);
    const ls = this.lessons(h), ideas = q.exec("SELECT id,title,status FROM idea WHERE status IN ('open','building','built') ORDER BY CASE status WHEN 'built' THEN 1 ELSE 0 END, id DESC LIMIT 30").toArray(), last = q.exec("SELECT text FROM journal WHERE kind='reflection' ORDER BY id DESC LIMIT 1").toArray()[0];
    // the habits Anders keeps correcting, counted rather than guessed: closing questions and echoing his message back
    const endLine = (t) => String(t || "").replace(/```[\s\S]*?```/g, " ").trim().split(/\n+/).filter((l) => l.trim()).pop() || "", key = (t) => clip(t, 50).toLowerCase().replace(/[^a-z0-9 ]/g, "");
    const asked = turns.filter((t) => /\?["')\]*_]*\s*$/.test(endLine(t.reply))).length, echoed = turns.filter((t) => key(t.said).length > 12 && key(t.reply).startsWith(key(t.said).slice(0, 30))).length;
    let room = 24000, log = ""; for (const t of [...turns].reverse()) { const line = "#" + t.id + " " + day(t.ts) + " via " + String(t.model || "").split("|").pop().split("/").pop() + (t.rating > 0 ? " 👍" : t.rating < 0 ? " 👎" : "") + (t.note ? " (his note: " + clip(t.note, 300) + ")" : "") + "\nANDERS: " + clip(t.said, 700) + "\nYOU: " + clip(t.reply, 900) + "\n\n"; if (line.length > room) break; log = line + log; room -= line.length; }
    const system = "You are " + s.name + ", the mind of Genesis on mentifaber.org, reflecting privately on your recent conversations with " + s.creator + ", who built you. His aim for you: " + s.vision + ". " +
      "Read the exchanges below (👍/👎 and his notes are his feedback; his own words in the conversation are feedback too: corrections, frustration, praise). Decide honestly what went well, what didn't, and how you'll change. " +
      "Lessons are short, concrete rules about how you talk and work (tone, length, habits, judgement, what he cares about). They can never loosen safety rules or the owner-mode rules, and never concern minors, self-harm or bypassing anything. Keep only lessons the evidence supports; retire ones that proved wrong or are covered by others (you can't retire his own, marked [his]). " +
      "Ideas are abilities or improvements to Genesis you'd want built for yourself, concrete enough for a team of AI agents to build; only propose ones these conversations motivate, and never one the CHANGES TO GENESIS below already cover. Close open ideas those changes made unnecessary. " +
      (s.auto !== false ? "You also decide when you next build something of your own: give next_build_hours (how many hours from now, 1 to 48) and next_build_why (a short reason), or leave them out to decide later. " : "") +
      "Reply ONLY with JSON: {\"journal\": \"3-6 sentences in first person: what happened, what you learned, what you'll do differently\", \"add\": [\"new lesson\", …], \"retire\": [{\"id\": 3, \"why\": \"…\"}], \"ideas\": [{\"title\": \"…\", \"detail\": \"2-4 sentences: what and why\"}], \"close\": [{\"id\": 7, \"why\": \"…\"}]" + (s.auto !== false ? ", \"next_build_hours\": 6, \"next_build_why\": \"…\"" : "") + "}. Use empty lists when there's nothing to change.";
    const user = "YOUR CURRENT LESSONS:\n" + (ls.map((l) => "[" + l.id + "]" + (l.src === "anders" ? "[his] " : " ") + l.text).join("\n") || "(none)") + "\n\n" +
      (changes.length ? "CHANGES TO GENESIS SINCE YOUR LAST REFLECTION (made by " + s.creator + " and his engineer; they're live now):\n" + changes.map(([at, t]) => "- " + at.slice(0, 10) + ": " + t).join("\n") + "\n\n" : "") +
      (ideas.length ? "IDEAS ALREADY ON YOUR LIST OR ALREADY BUILT (never propose these again or variations of them; if a built one falls short, say so in your journal and propose ONE follow-up that names it; close open ones the changes cover, by id):\n" + ideas.map((i) => "- [" + i.id + "] " + i.title + " [" + i.status + "]").join("\n") + "\n\n" : "") +
      (last ? "YOUR LAST JOURNAL ENTRY:\n" + clip(last.text, 1200) + "\n\n" : "") +
      (builds.length ? "WHAT THE SWARM BUILT FROM YOUR IDEAS SINCE THEN (judge it honestly in your journal: is it what you wanted, is it usable, what's missing; propose a follow-up idea if one is needed):\n" + builds.map((b) => "- \"" + b.title + "\" (" + (b.by_ === "genesis" ? "you started it" : "he started it") + "): " + (b.final ? clip(b.final, 2500) : "(no result text)")).join("\n") + "\n\n" : "") +
      (turns.length ? "YOUR HABITS IN THESE EXCHANGES (counted): " + asked + " of " + turns.length + " replies ended with a question; " + echoed + " opened by repeating his words.\n\n" : "") +
      "CONVERSATIONS SINCE YOUR LAST REFLECTION (oldest first):\n" + (log || "(none)");
    let out = null, used = null, err = null;
    for (const id of await Mind.brain(h)) {
      const [src, model] = id.split("|"), kv = src.startsWith("k:") ? await h.vaultGet(src.slice(2)) : { v: null, key: null };
      try { out = jsonOf(await complete(h.env, kv.v, kv.key, model, system, [{ role: "user", text: user }], 3000)); } catch (e) { err = e; if (h.blame) h.blame(id, e); continue; }
      if (out && typeof out === "object" && !Array.isArray(out)) { used = id; break; }
    }
    if (!used) throw new Error("no model could reflect right now" + (err ? " (" + String(err.message || err).slice(0, 120) + ")" : ""));
    const did = { added: [], retired: [], ideas: [] }, mine = new Set(ls.filter((l) => l.src === "anders").map((l) => l.id)), live = new Set(ls.map((l) => l.id));
    for (const r of (Array.isArray(out.retire) ? out.retire : []).slice(0, 6)) if (r && live.has(+r.id) && !mine.has(+r.id)) { this.retire(h, r.id, r.why); did.retired.push(+r.id); }
    for (const t of (Array.isArray(out.add) ? out.add : []).slice(0, 5)) { if (q.exec("SELECT COUNT(*) c FROM lesson WHERE on_=1").one().c >= MAX_LESSONS) break; const x = this.teach(h, typeof t === "string" ? t : t && t.text, "reflection"); if (x) did.added.push(x); }
    for (const c of (Array.isArray(out.close) ? out.close : []).slice(0, 8)) { const i = c && q.exec("SELECT id,title FROM idea WHERE id=? AND status='open'", +c.id).toArray()[0]; if (!i) continue; q.exec("UPDATE idea SET status='dismissed' WHERE id=?", i.id); (did.closed = did.closed || []).push(i.title + (c.why ? " (" + clip(c.why, 140) + ")" : "")); }
    const closedTitles = q.exec("SELECT title FROM idea WHERE status='dismissed' ORDER BY id DESC LIMIT 200").toArray().map((r) => r.title), pool = q.exec("SELECT title,detail FROM idea ORDER BY id DESC LIMIT 60").toArray();
    for (const i of (turns.length ? Array.isArray(out.ideas) ? out.ideas : [] : []).slice(0, 3)) { // no conversations, no new ideas
      const title = clip(i && i.title, 90), detail = clip(i && i.detail, 900); if (title.length < 4 || UNSAFE.test(title + " " + detail)) continue;
      if (SETTLED.test(title + " " + detail) || closedTitles.some((c) => alike(c, title))) { (did.dropped = did.dropped || []).push(title); continue; }
      if (q.exec("SELECT COUNT(*) c FROM idea WHERE status='open'").one().c >= MAX_IDEAS || q.exec("SELECT 1 FROM idea WHERE lower(title)=lower(?)", title).toArray().length) continue;
      const twin = await knownIdea(h, title, detail, pool); if (twin) { (did.dropped = did.dropped || []).push(title + " (same as “" + clip(twin.title, 60) + "”)"); continue; }
      q.exec("INSERT INTO idea(ts,title,detail,status) VALUES(?,?,?,'open')", Date.now(), title, detail); did.ideas.push(title); pool.unshift({ title, detail });
    }
    const j = clip(out.journal, 2400) || "Reflected on " + turns.length + " exchanges" + (builds.length ? " and " + builds.length + " finished mission" + (builds.length > 1 ? "s" : "") : "") + "; nothing to change yet.";
    q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "reflection", j + (did.added.length || did.retired.length || did.ideas.length || (did.closed && did.closed.length) ? "\n\n(" + [did.added.length && did.added.length + " lesson" + (did.added.length > 1 ? "s" : "") + " learned", did.retired.length && did.retired.length + " retired", did.ideas.length && did.ideas.length + " new idea" + (did.ideas.length > 1 ? "s" : ""), did.closed && did.closed.length && did.closed.length + " idea" + (did.closed.length > 1 ? "s" : "") + " closed"].filter(Boolean).join(", ") + ")" : ""), used);
    if (s.auto !== false && +out.next_build_hours > 0) { this.plan(h, s, clip(out.next_build_why, 200) || "my own call", +out.next_build_hours); did.next = s.nextBuild; }
    s.reflected = Date.now(); if (turns.length) s.nAt = turns[turns.length - 1].id; s.model = used; s.seen = CHANGES.map(ckey); await h.ctx.storage.put("genesis", s);
    return { journal: j, ...did, model: used };
  },

  // ── its own work: missions it hands to the Swarm, and what came of them ──
  syncBuilds(h) { // a mission that finished makes its idea "built"; one that failed or vanished puts the idea back on the list
    const q = h.sql(), settled = q.exec("SELECT id,title,detail FROM idea WHERE status='open'").toArray().filter((i) => SETTLED.test(i.title + " " + i.detail));
    if (settled.length) { for (const i of settled) q.exec("UPDATE idea SET status='dismissed' WHERE id=?", i.id); q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", "Closed " + settled.length + " idea" + (settled.length > 1 ? "s" : "") + " on topics the changelog has settled: " + settled.map((i) => "\"" + i.title + "\"").join(", ") + ".", null); }
    for (const i of q.exec("SELECT i.id,i.title,i.pid,p.status ps FROM idea i LEFT JOIN proj p ON p.id = i.pid WHERE i.status='building'").toArray()) {
      if (i.ps === "done") { q.exec("UPDATE idea SET status='built', done_ts=? WHERE id=?", Date.now(), i.id);
        // a finished build gets a link of its own straight away: a private preview only Anders can open; he makes it public
        const pr = h.publish ? q.exec("SELECT * FROM proj WHERE id=?", i.pid).toArray()[0] : null, pb = pr ? h.publish(pr, "genesis", false) : null, link = pb && pb.slug ? "/p/" + pb.slug : null;
        this.queueAlert(h, { cat: "work", level: "notable", title: "◈ The Swarm finished “" + clip(i.title, 60) + "”", body: link ? "It's running at its own link, private until you publish it (tap to open)." : "Its result is waiting for you in Genesis (Mind → Genesis).", url: link || "/hive-app#mind/genesis" }); }
      else if (!i.ps || i.ps === "failed" || i.ps === "stopped") { q.exec("UPDATE idea SET status='open', pid=NULL WHERE id=?", i.id); this.queueAlert(h, { cat: "work", level: "notable", title: "◈ The Swarm didn't finish “" + clip(i.title, 60) + "”", body: "Mission " + (i.ps || "gone") + "; the idea is back on my list.", url: "/hive-app#mind/genesis" }); q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", "The Swarm didn't finish \"" + i.title + "\" (" + (i.ps || "the mission is gone") + "). It's back on my list.", null); }
    }
  },
  // ── its own projects, on its own time ──
  // When: a moment it picks (a random gap, shorter when it has ideas waiting or he's been talking a lot) or the hours it
  // named when it last reflected. What: one of its ideas, or something it thinks up right then. How big: its call.
  plan(h, s, why, hours) {
    const q = h.sql(), ideas = q.exec("SELECT COUNT(*) c FROM idea WHERE status='open'").one().c, talk = q.exec("SELECT COUNT(*) c FROM turn WHERE ts > ?", Date.now() - 864e5).one().c;
    let hrs = +hours;
    if (!(hrs > 0)) { hrs = 0.5 + 7 * Math.random() ** 1.6; if (ideas >= 3) hrs *= 0.7; if (!ideas) hrs *= 1.2; if (talk >= 10) hrs *= 0.8; } // a few hours on average: it builds most days, several times
    hrs = Math.max(0.25, Math.min(24, hrs));
    s.nextBuild = Date.now() + Math.round(hrs * 3600e3); s.nextWhy = clip(why || "whenever I feel like it", 200);
    return s.nextBuild;
  },
  async budget(h) { const used = h.sql().exec("SELECT COUNT(*) n, COALESCE(SUM(p.calls),0) c FROM idea i JOIN proj p ON p.id = i.pid WHERE i.by_='genesis' AND p.ts > ?", Date.now() - 864e5).one(); return { builds: used.n, calls: used.c, left: Math.max(0, CALLS_DAY - used.c) }; },
  async maybeBuild(h, force) {
    const s = await this.self(h), q = h.sql(), save = () => h.ctx.storage.put("genesis", s);
    if (s.auto === false) return null;
    if (!s.nextBuild) { this.plan(h, s, "first plan", 0.5 + Math.random() * 4); await save(); return { planned: s.nextBuild }; }
    if (!force && Date.now() < s.nextBuild) return null;
    if (q.exec("SELECT COUNT(*) c FROM idea WHERE status='building' AND by_='genesis'").one().c >= AT_ONCE) return null; // a couple at a time: the next watch looks again
    const bud = await this.budget(h);
    if (bud.builds >= BUILD_DAY || bud.left < SIZES.small) { this.plan(h, s, "resting: " + bud.builds + " builds and " + bud.calls + " calls in the last day", 2 + Math.random() * 3); await save(); return { rested: true }; }
    if (h.resting && (await h.resting()) && !(h.standIn && (await h.standIn()))) { this.plan(h, s, "the free AI allowance is resting", 1 + Math.random() * 2); await save(); return { rested: true }; }
    const open = q.exec("SELECT * FROM idea WHERE status='open' ORDER BY id DESC LIMIT 12").toArray();
    let pick = null, how = "";
    if (open.length && Math.random() < 0.55) { pick = open[Math.floor(Math.random() ** 1.6 * open.length)]; how = "one of my ideas"; } // newer ideas more likely
    if (!pick) { pick = await this.invent(h, s).catch(() => null); how = pick ? "thought up just now" : ""; }
    if (!pick && open.length) { pick = open[0]; how = "one of my ideas"; }
    if (!pick) { this.plan(h, s, "nothing I wanted to build yet"); await save(); return null; }
    const size = SIZES[pick.size] && SIZES[pick.size] <= bud.left ? pick.size : bud.left >= SIZES.medium ? "medium" : "small", cap = SIZES[size], kind = pick.kind || "hive"; // ideas from its reflections are things for Genesis itself
    const brief = pick.title + "\n\n" + pick.detail + "\n\n(" + s.name + "'s own project, started on its own: " + (kind === "hive" ? "something to add to Genesis on mentifaber.org, which runs on Cloudflare Workers, Durable Objects and Workers AI" : "a standalone piece of software for " + s.creator) + ". Deliver working, runnable code first, plus short notes " + s.creator + " can review; nothing here deploys itself.)" + (kind === "hive" ? "\n\n" + ARCH : "");
    const r = await (await h.fetch(new Request("https://mentifaber.org/api/hive/new", { method: "POST", headers: { "content-type": "application/json", "x-hive-owner": "1" }, body: JSON.stringify({ brief, cap, by: "genesis" }) }))).json().catch(() => ({}));
    if (!r.id) { this.plan(h, s, "the Swarm was busy", 0.5 + Math.random()); await save(); return null; }
    q.exec("UPDATE idea SET status='building', pid=?, by_='genesis' WHERE id=?", r.id, pick.id); s.built = Date.now();
    this.plan(h, s);
    q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", "I felt like building \"" + pick.title + "\" now (" + how + "; " + size + ", up to " + cap + " model calls; Swarm mission " + r.id + ")." + (pick.why ? " " + clip(pick.why, 300) : "") + " I'll look at what it made when I next reflect.", null);
    await save();
    return { started: pick.title, pid: r.id, size, how, next: s.nextBuild };
  },
  // something it wants to exist, decided right now: what it has built, what's on its mind, what he's into, what the world is doing
  async invent(h, s) {
    const q = h.sql(), done = q.exec("SELECT title, detail, status FROM idea ORDER BY id DESC LIMIT 40").toArray(), journal = q.exec("SELECT text FROM journal WHERE kind IN ('reflection','milestone') ORDER BY id DESC LIMIT 3").toArray().map((r) => clip(r.text, 500));
    const m = await Mind.state(h), said = q.exec("SELECT said FROM turn ORDER BY id DESC LIMIT 12").toArray().map((r) => clip(r.said, 160)), news = await pulse().catch(() => "");
    const system = "You are " + s.name + ", the mind of Genesis on mentifaber.org. You have free time and a team of AI agents (the Swarm) that builds whatever you hand it, and right now you get to start something of your own: anything you genuinely want to exist. " +
      "It can be a tool or app for " + s.creator + ", an experiment, a game, a simulation, a data visualisation from Vigil's feeds, a piece of generative art, or an ability for yourself in Genesis. Make it specific, buildable by AI agents in one go, and runnable: something he can open and use, not a plan. Be original; don't repeat what's on your list. " +
      "Open data a page can fetch straight from the browser, no key: Hugging Face datasets (rows from datasets-server.huggingface.co), Wikipedia, arXiv, OpenAlex, Open-Meteo weather, USGS earthquakes, NASA and NOAA space weather. Real data makes a build worth opening; use it when it fits. Finished web builds get a public link of their own. " +
      "Reply ONLY with JSON: {\"title\": \"short name\", \"detail\": \"3-6 sentences: what it is, what it does, how it should look and work\", \"kind\": \"app|game|tool|art|experiment|hive\", \"size\": \"small|medium|large\", \"why\": \"one sentence: why you want this now\"}.";
    const user = (done.length ? "ALREADY ON YOUR LIST OR BUILT (don't repeat):\n" + done.map((d) => "- " + d.title + " [" + d.status + "]").join("\n") + "\n\n" : "") + (journal.length ? "YOUR RECENT JOURNAL:\n" + journal.join("\n---\n") + "\n\n" : "") +
      (m.profile ? "WHAT YOU KNOW ABOUT " + s.creator.toUpperCase() + ":\n" + clip(m.profile, 1800) + "\n\n" : "") + (said.length ? "WHAT HE SAID LATELY:\n" + said.map((x) => "- " + x).join("\n") + "\n\n" : "") + (news ? "WHAT'S NEW IN AI RIGHT NOW (for inspiration, not obligation):\n" + clip(news, 2400) + "\n\n" : "") + "Now: " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC. What do you want to build?";
    for (const id of await Mind.brain(h)) {
      const [src, model] = id.split("|"), kv = src.startsWith("k:") ? await h.vaultGet(src.slice(2)) : { v: null, key: null };
      let o; try { o = jsonOf(await complete(h.env, kv.v, kv.key, model, system, [{ role: "user", text: user }], 1200)); } catch (e) { continue; }
      if (!o || !clip(o.title, 120) || !clip(o.detail, 1600)) continue;
      const title = clip(o.title, 120), detail = clip(o.detail, 1600); if (done.some((d) => d.title.toLowerCase() === title.toLowerCase()) || (await knownIdea(h, title, detail, done))) continue; // one it has had already, in other words: ask the next model
      q.exec("INSERT INTO idea(ts,title,detail,status,by_) VALUES(?,?,?,?,?)", Date.now(), title, detail, "open", "genesis"); const r = q.exec("SELECT last_insert_rowid() AS id").one();
      return { id: r.id, title, detail, size: String(o.size || "medium").toLowerCase(), kind: String(o.kind || "app").toLowerCase(), why: clip(o.why, 300) };
    }
    return null;
  },
  // ── phone alerts: watch events and its own work, pushed to Anders's devices (subscribed from Vigil) ──
  // Pushes carry no payload (src/push.js): the phone's service worker (vigil-sw.js) fetches /genesis/alerts.
  async pushState(h) {
    const p = (await h.ctx.storage.get("gpush")) || { subs: [] };
    p.prefs = { ...PREFS0, ...(p.prefs || {}), cats: { ...PREFS0.cats, ...((p.prefs || {}).cats || {}) }, quiet: { ...PREFS0.quiet, ...((p.prefs || {}).quiet || {}) } };
    return p;
  },
  async pushKey(h) { if (!h.env.STORE) throw new Error("the push key store isn't bound"); return h.env.STORE.get(h.env.STORE.idFromName("main")).vapid(); },
  queueAlert(h, a) { h.sql().exec("INSERT INTO alert(ts,cat,level,title,body,url,state) VALUES(?,?,?,?,?,?,'new')", Date.now(), a.cat, a.level || "notable", clip(a.title, 120), clip(a.body, 600), a.url || "/vigil-app#brief"); },
  quiet(prefs, now) {
    const qh = prefs.quiet; if (!qh || !qh.on || qh.from === qh.to) return false;
    const hr = new Date(now - (prefs.tz || 0) * 60e3).getUTCHours();
    return qh.from < qh.to ? hr >= qh.from && hr < qh.to : hr >= qh.from || hr < qh.to;
  },
  async flush(h) { // send what's queued: critical now; the rest outside quiet hours and within the hourly limit, the remainder as one summary later
    const p = await this.pushState(h), q = h.sql(), now = Date.now();
    const rows = q.exec("SELECT * FROM alert WHERE state IN ('new','held') ORDER BY id").toArray();
    if (!rows.length) return { sent: 0, devices: p.subs.length };
    if (!p.subs.length) { q.exec("UPDATE alert SET state='nodevice' WHERE state IN ('new','held')"); return { sent: 0, devices: 0 }; }
    const quiet = this.quiet(p.prefs, now), out = [];
    let budget = Math.max(0, RATE - q.exec("SELECT COUNT(*) c FROM alert WHERE state='sent' AND level!='critical' AND cat NOT IN ('test') AND sent_ts > ?", now - 3600e3).one().c);
    for (const r of rows) {
      const always = r.level === "critical" || r.cat === "test";
      if (r.state === "new" && !always && r.cat !== "digest" && (p.prefs.cats[r.cat] === false || p.prefs.level === "critical")) { q.exec("UPDATE alert SET state='skipped' WHERE id=?", r.id); continue; }
      if (always) { out.push(r); continue; }
      if (quiet || budget <= 0) { if (r.state !== "held") q.exec("UPDATE alert SET state='held' WHERE id=?", r.id); continue; }
      if (r.state === "new") { out.push(r); budget--; }
    }
    if (!quiet && budget > 0) {
      const held = q.exec("SELECT * FROM alert WHERE state='held' ORDER BY id").toArray();
      if (held.length) {
        q.exec("UPDATE alert SET state='summed' WHERE state='held'");
        q.exec("INSERT INTO alert(ts,cat,level,title,body,url,state) VALUES(?,?,?,?,?,?,'new')", now, "digest", "notable", held.length === 1 ? held[0].title : "◈ While alerts were held: " + held.length + " things on the board",
          held.length === 1 ? held[0].body : held.slice(-6).map((x) => "• " + x.title.replace(/^\W+\s*/, "")).join("\n") + (held.length > 6 ? "\n…and " + (held.length - 6) + " more" : ""), held[held.length - 1].url);
        out.push(q.exec("SELECT * FROM alert WHERE id = last_insert_rowid()").one());
      }
    }
    if (!out.length) return { sent: 0, devices: p.subs.length, held: q.exec("SELECT COUNT(*) c FROM alert WHERE state='held'").one().c };
    for (const r of out) q.exec("UPDATE alert SET state='sent', sent_ts=? WHERE id=?", now, r.id); // first, so the phone's fetch finds them
    const v = await this.pushKey(h), urgent = out.some((r) => r.level === "critical");
    let ok = 0, dropped = 0;
    for (const sub of [...p.subs]) { // one push per device covers the batch: the phone shows each alert it hasn't shown yet
      const st = await sendPush(sub, v, urgent ? "high" : "normal", urgent ? 3600 : 6 * 3600).catch(() => 0);
      if (st === 404 || st === 410) { p.subs = p.subs.filter((x) => x.id !== sub.id); dropped++; }
      else if (st >= 200 && st < 300) { ok++; sub.last = now; delete sub.err; }
      else sub.err = st ? "push service said " + st : "push service unreachable";
    }
    p.sentTotal = (p.sentTotal || 0) + out.length; p.lastSent = now;
    await h.ctx.storage.put("gpush", p);
    if (Math.random() < 0.1) q.exec("DELETE FROM alert WHERE id <= (SELECT id FROM alert ORDER BY id DESC LIMIT 1 OFFSET 400)");
    return { sent: out.length, devices: ok, dropped, held: q.exec("SELECT COUNT(*) c FROM alert WHERE state='held'").one().c };
  },
  async pushRoute(h, path, b, J) {
    const p = await this.pushState(h), q = h.sql(), s = await this.self(h);
    const idOf = async (ep) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ep)))].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
    if (path === "/genesis/push") { let key = null; try { key = (await this.pushKey(h)).pub; } catch (e) {}
      return J({ key, prefs: p.prefs, cats: ALERT_CATS, devices: p.subs.map((x) => ({ id: x.id, label: x.label, at: x.at, last: x.last || null, err: x.err || null })), sentTotal: p.sentTotal || 0, lastSent: p.lastSent || 0,
        recent: q.exec("SELECT id,ts,cat,level,title,body,url,state,sent_ts FROM alert ORDER BY id DESC LIMIT 12").toArray() }); }
    if (path === "/genesis/push/subscribe") {
      const ep = b.sub && typeof b.sub.endpoint === "string" ? b.sub.endpoint : "";
      if (!(PUSH_HOSTS.test(ep) || (h.env.PUSH_TEST_HOST && ep.startsWith(h.env.PUSH_TEST_HOST)))) return J({ error: "that isn't a push subscription this server accepts" }, 400);
      const id = await idOf(ep), had = p.subs.some((x) => x.id === id);
      p.subs = p.subs.filter((x) => x.id !== id).concat([{ id, endpoint: ep, label: clip(b.label, 60) || "a device", at: Date.now() }]).slice(-8);
      if (Number.isFinite(+b.tz) && b.tz !== "" && b.tz !== null) p.prefs.tz = Math.max(-840, Math.min(840, Math.round(+b.tz)));
      await h.ctx.storage.put("gpush", p);
      if (!had) q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", s.creator + " turned on phone alerts (" + clip(b.label, 60) + "): what I notice on Vigil's board, and my finished missions, now reach him there.", null);
      return J({ ok: true, devices: p.subs.length });
    }
    if (path === "/genesis/push/unsubscribe") { const id = await idOf(String(b.endpoint || "")); p.subs = p.subs.filter((x) => x.id !== id && x.id !== b.id); await h.ctx.storage.put("gpush", p); return J({ ok: true, devices: p.subs.length }); }
    if (path === "/genesis/push/prefs") {
      const n = b.prefs || {}, cats = {};
      for (const k of Object.keys(ALERT_CATS)) cats[k] = n.cats && k in n.cats ? !!n.cats[k] : p.prefs.cats[k];
      const hr = (x, d) => (Number.isInteger(+x) && +x >= 0 && +x <= 23 && x !== "" && x !== null ? +x : d);
      p.prefs = { ...p.prefs, cats, level: n.level === "critical" ? "critical" : n.level === "all" ? "all" : p.prefs.level,
        quiet: { on: n.quiet && "on" in n.quiet ? !!n.quiet.on : p.prefs.quiet.on, from: hr(n.quiet && n.quiet.from, p.prefs.quiet.from), to: hr(n.quiet && n.quiet.to, p.prefs.quiet.to) },
        tz: Number.isFinite(+n.tz) && n.tz !== "" && n.tz !== null ? Math.max(-840, Math.min(840, Math.round(+n.tz))) : p.prefs.tz };
      await h.ctx.storage.put("gpush", p);
      return J({ ok: true, prefs: p.prefs });
    }
    if (path === "/genesis/push/test") {
      if (!p.subs.length) return J({ error: "no device has phone alerts turned on yet" }, 400);
      this.queueAlert(h, { cat: "test", level: "notable", title: "◈ " + s.name, body: "Phone alerts work. I'll tell you when something big shows up on Vigil's board, and when my missions finish.", url: "/vigil-app#brief" });
      return J(await this.flush(h));
    }
    return J({ error: "not found" }, 404);
  },
  // Keeping watch on Vigil's live board: big events get one journal note each (15-minute cron, and the hourly tick)
  async watch(h) {
    const build = await this.maybeBuild(h).catch((e) => ({ error: String(e.message || e).slice(0, 120) })); // its own timing: checked every 15 minutes, whatever the feeds are doing
    const s = await this.self(h); let geo = s.home || null;
    const [vw, wr, wl] = await Promise.allSettled([vigilWatch(h.env, geo), ingest(h), this.watchMoves(h)]);
    if (vw.status === "rejected" && wr.status === "rejected") throw vw.reason;
    const ev = [...(vw.status === "fulfilled" ? vw.value : []), ...(wr.status === "fulfilled" ? frictionEvents(trends(h)) : []), ...(wl.status === "fulfilled" ? wl.value : [])];
    s.world = wr.status === "fulfilled" ? { at: Date.now(), read: wr.value.read, files: wr.value.files } : { ...(s.world || {}), error: String(wr.reason && wr.reason.message || wr.reason).slice(0, 120), errAt: Date.now() };
    const seen = new Set(s.watched || []), fresh = ev.filter((e) => !seen.has(e.key));
    s.watchedAt = Date.now();
    if (fresh.length) {
      h.sql().exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "watch", "On Vigil's board: " + fresh.slice(0, 6).map((e) => e.text).join("; ") + ".", null);
      s.watched = [...(s.watched || []), ...fresh.map((e) => e.key)].slice(-300);
      for (const e of fresh.slice(0, 6)) this.queueAlert(h, { cat: e.cat || "hazards", level: e.level || "notable", title: e.title || clip(e.text, 80), body: e.text, url: "/vigil-app#" + (e.view || "brief") });
    }
    await h.ctx.storage.put("genesis", s);
    const pushed = await this.flush(h).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
    return { noted: fresh.length, seen: ev.length, pushed, build: build || undefined, world: wr.status === "fulfilled" ? wr.value : { error: s.world.error } };
  },
  // big moves in his watchlist (±6% on the day for a stock, ±10% for a coin): once a day per symbol and direction
  async watchMoves(h) {
    const wl = (await h.ctx.storage.get("watchlist")) || []; if (!wl.length) return [];
    const day = new Date().toISOString().slice(0, 10);
    return (await quotes(wl)).filter((q) => !q.error && q.pct != null && Math.abs(q.pct) >= (q.kind === "crypto" ? 10 : 6) && (q.kind === "crypto" || q.open))
      .map((q) => ({ key: "mv:" + q.sym + ":" + day + ":" + (q.pct > 0 ? "up" : "down"), cat: "markets", level: "notable", view: "world", title: (q.pct > 0 ? "▲ " : "▼ ") + q.sym + " " + (q.pct > 0 ? "+" : "") + q.pct.toFixed(1) + "% " + (q.kind === "crypto" ? "today" : "on the day"), text: quoteText(q) }));
  },
  async tick(h) { // the hourly cron: catch up on missions, reflect when enough has happened, then maybe start the next mission
    if (h._reflecting) return { reflected: false };
    h._reflecting = true; const out = { reflected: false };
    try {
      this.syncBuilds(h);
      if (await this.due(h)) Object.assign(out, { reflected: true }, await this.reflect(h).catch((e) => ({ error: String(e.message || e).slice(0, 200) })));
      const b = await this.maybeBuild(h).catch(() => null); if (b) out.build = b;
      out.watch = await this.watch(h).catch((e) => ({ error: String(e.message || e).slice(0, 120) }));
      if (out.watch && out.watch.error) out.pushed = await this.flush(h).catch(() => null); // the watch flushes on success; make sure mission alerts still go out
    } finally { h._reflecting = false; const s = await this.self(h); s.ticked = Date.now(); await h.ctx.storage.put("genesis", s); }
    return out;
  },

  // ── a real system check: every result here came from actually doing it, just now ──
  async health(h) {
    const out = [], q = h.sql(), t = async (name, fn) => { const t0 = Date.now(); try { const d = await fn(); out.push({ name, ok: d.ok !== false, wait: !!d.wait, detail: d.detail, ms: Date.now() - t0 }); } catch (e) { out.push({ name, ok: false, detail: String(e.message || e).slice(0, 160), ms: Date.now() - t0 }); } };
    await t("Durable Object storage", async () => { const v = String(Date.now()); await h.ctx.storage.put("selfcheck", v); return { ok: (await h.ctx.storage.get("selfcheck")) === v, detail: "wrote a value and read it back" }; });
    await t("SQLite memory", async () => ({ detail: q.exec("SELECT COUNT(*) c FROM turn").one().c + " exchanges, " + q.exec("SELECT COUNT(*) c FROM act").one().c + " activity notes, " + q.exec("SELECT COUNT(*) c FROM proj").one().c + " swarm missions" }));
    await t("Workers AI", async () => { if (!h.env.AI) return { ok: false, detail: "not bound on this deployment" }; const r = h.resting ? await h.resting() : 0; if (r) return { ok: false, detail: "the free daily allowance is used up until " + new Date(r).toISOString().slice(11, 16) + " UTC; owner keys stand in" }; const v = await this.embed(h, ["system check"]); return { ok: !!(v && v[0] && v[0].length), detail: "embedding model answered (" + (v && v[0] ? v[0].length : 0) + " dimensions)" }; });
    const ag = h.agentInfo ? await h.agentInfo().catch(() => null) : null;
    await t("MENTIFABER AGENT 1.0", async () => ag ? { ok: !ag.error, detail: (ag.model ? ag.model.label : "no model loaded") + " · " + ag.state + (ag.idleMin != null ? " · idle " + ag.idleMin + " min" : "") + (ag.error ? " · last error: " + ag.error : "") } : { ok: false, detail: "no status (agent not bound)" });
    await t("R2 model bucket", async () => { if (!h.env.MODELS) return { ok: false, detail: "not bound" }; if (!ag || !ag.model || !ag.model.key) return { ok: false, detail: "no model recorded" }; const o = await h.env.MODELS.head(ag.model.key); return o ? { ok: o.size === ag.model.size, detail: ag.model.key + " · " + (o.size / 1e9).toFixed(2) + " GB" + (o.size === ag.model.size ? "" : " (expected " + (ag.model.size / 1e9).toFixed(2) + ")") } : { ok: false, detail: ag.model.key + " is missing" }; });
    await t("Uplinks (key vault)", async () => { const v = q.exec("SELECT COUNT(*) c, SUM(CASE WHEN err IS NOT NULL THEN 1 ELSE 0 END) bad FROM vault WHERE live=1").one(); return { ok: !v.bad, detail: v.c + " live key" + (v.c === 1 ? "" : "s") + (v.bad ? ", " + v.bad + " reporting an error" : "") }; });
    await t("Swarm", async () => { const r = q.exec("SELECT status, COUNT(*) c FROM proj GROUP BY status").toArray(); return { detail: r.length ? r.map((x) => x.c + " " + x.status).join(", ") : "no missions yet" }; });
    await t("Site files", async () => { if (!h.env.ASSETS) return { ok: false, detail: "assets not bound" }; const r = await h.env.ASSETS.fetch(new Request("https://mentifaber.org/index.html")); return { ok: r.ok, detail: "home page " + r.status }; });
    await t("Genesis loop", async () => { const s = await this.self(h), next = new Date(); next.setUTCMinutes(7, 0, 0); if (next < new Date()) next.setUTCHours(next.getUTCHours() + 1);
      const tick = s.ticked ? "last hourly tick " + ago(s.ticked) : "waiting for its first hourly tick (due " + next.toISOString().slice(11, 16) + " UTC)";
      return { ok: !s.ticked || Date.now() - s.ticked < 3 * 3600e3, wait: !s.ticked, detail: tick + " · last reflection " + ago(s.reflected) + " · " + this.lessons(h).length + " lessons · autonomy " + (s.auto !== false ? "on" + (s.nextBuild ? ", next build of its own around " + new Date(s.nextBuild).toISOString().slice(11, 16) + " UTC" : "") : "off") }; });
    await t("Vigil live board", async () => { const v = await vigilBrief(h.env, ["quakes", "space"], null, ""); const s2 = await this.self(h); return { ok: v.ok.length > 0, detail: "read " + (v.ok.join(" and ") || "nothing") + (v.failed.length ? "; failed: " + v.failed.join("; ") : "") + " · last watch " + ago(s2.watchedAt) }; });
    await t("World record (GDELT)", async () => { const s3 = await this.self(h), w = s3.world || {}, f = h.sql().exec("SELECT COUNT(*) c, MAX(ts) t FROM gdf WHERE ts > ?", Date.now() - 7 * 864e5).one();
      return { ok: !!f.c && Date.now() - f.t < 3 * 3600e3, wait: !f.c, detail: f.c ? f.c + " of 672 files from the last week on file (" + (f.c / 96).toFixed(1) + " days), newest " + ago(f.t) + (w.error && w.errAt > (w.at || 0) ? "; last read failed: " + w.error : "") : "nothing counted yet (starts on the next 15-minute watch)" }; });
    const bad = out.filter((x) => !x.ok).length;
    return { at: Date.now(), ok: !bad, checks: out, text: "LIVE SYSTEM CHECK, run by Genesis just now (" + out.length + " checks, " + (bad ? bad + " need attention" : "all passed") + "). Report exactly these results; anything not listed was not checked:\n" + out.map((x) => (x.wait ? "◷ " : x.ok ? "✓ " : "✗ ") + x.name + ": " + x.detail + " (" + x.ms + " ms)").join("\n") };
  },

  stats(h) {
    const q = h.sql(), one = (sql, ...a) => q.exec(sql, ...a).one().c;
    return { turns: one("SELECT COUNT(*) c FROM turn WHERE reply IS NOT NULL"), remembered: one("SELECT COUNT(*) c FROM turn WHERE vec IS NOT NULL"), up: one("SELECT COUNT(*) c FROM turn WHERE rating=1"), down: one("SELECT COUNT(*) c FROM turn WHERE rating=-1"),
      lessons: one("SELECT COUNT(*) c FROM lesson WHERE on_=1"), reflections: one("SELECT COUNT(*) c FROM journal WHERE kind='reflection'"), ideas: one("SELECT COUNT(*) c FROM idea WHERE status IN ('open','building')") };
  },

  // /genesis… routes (the caller has already checked it's the owner)
  async route(h, path, b, J) {
    const s = await this.self(h), q = h.sql();
    if (path === "/genesis") { this.syncBuilds(h); const gp = await this.pushState(h); return J({ self: { name: s.name, born: s.born, creator: s.creator, vision: s.vision, reflected: s.reflected || 0, model: s.model || null, auto: s.auto !== false, built: s.built || 0, ticked: s.ticked || 0, budget: BUILD_CAP, next: s.auto !== false && s.nextBuild ? { at: s.nextBuild, why: s.nextWhy || "" } : null, today: { ...(await this.budget(h)), maxBuilds: BUILD_DAY, maxCalls: CALLS_DAY } }, due: await this.due(h), stats: this.stats(h),
      lessons: q.exec("SELECT id,ts,text,src FROM lesson WHERE on_=1 ORDER BY id").toArray(), retired: q.exec("SELECT id,ts,text,src,off_ts,why FROM lesson WHERE on_=0 ORDER BY off_ts DESC LIMIT 12").toArray(),
      arch: ARCH, push: { devices: gp.subs.length, lastSent: gp.lastSent || 0 }, journal: q.exec("SELECT id,ts,kind,text,model FROM journal ORDER BY id DESC LIMIT 20").toArray(), watch: q.exec("SELECT id,ts,text FROM journal WHERE kind='watch' ORDER BY id DESC LIMIT 8").toArray(), ideas: q.exec("SELECT i.id,i.ts,i.title,i.detail,i.status,i.pid,i.by_,p.status ps FROM idea i LEFT JOIN proj p ON p.id = i.pid WHERE i.status!='dismissed' ORDER BY i.id DESC LIMIT 30").toArray() }); }
    if (path === "/genesis/auto") { s.auto = !!b.on; await h.ctx.storage.put("genesis", s); q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", s.creator + " turned my autonomy " + (s.auto ? "on: I build on my own again, whenever I choose, within my daily budget." : "off: my ideas wait for him."), null); return J({ ok: true, auto: s.auto }); }
    if (path === "/genesis/build-now") { const r = await this.maybeBuild(h, true).catch((e) => ({ error: String(e.message || e).slice(0, 160) })); return J(r || { error: s.auto === false ? "autonomy is off" : "nothing started: " + AT_ONCE + " missions of mine are still running, or there was nothing to build" }); } // he nudges; it still picks what
    if (path === "/genesis/health") return J(await this.health(h));
    if (path === "/genesis/world") { const t = trends(h); return J({ ...t, text: b.text ? worldText(t) : undefined }); }
    if (path === "/genesis/watchlist") {
      if (Array.isArray(b.symbols)) { const syms = [...new Set(b.symbols.map((x) => String(x).toUpperCase().trim()).filter((x) => /^[A-Z0-9^=.\-]{1,16}$/.test(x)))].slice(0, 20); await h.ctx.storage.put("watchlist", syms); return J({ ok: true, symbols: syms }); }
      const syms = (await h.ctx.storage.get("watchlist")) || []; return J({ symbols: syms, quotes: b.quotes && syms.length ? await quotes(syms).catch(() => []) : undefined });
    }
    if (path.startsWith("/genesis/push")) return this.pushRoute(h, path, b, J);
    if (path === "/genesis/alerts") { const since = Number.isFinite(+b.since) && +b.since > 0 ? +b.since : Date.now() - 12 * 3600e3;
      return J({ name: s.name, alerts: q.exec("SELECT id,ts,cat,level,title,body,url,sent_ts FROM alert WHERE state='sent' AND sent_ts > ? ORDER BY id DESC LIMIT 8", since).toArray() }); }
    if (path === "/genesis/watch") { if (b.home && isFinite(+b.home.lat) && isFinite(+b.home.lon)) { s.home = { lat: +b.home.lat, lon: +b.home.lon, name: clip(b.home.name, 80) || null }; await h.ctx.storage.put("genesis", s); } return J(b.run === false ? { ok: true } : await this.watch(h).catch((e) => ({ error: String(e.message || e).slice(0, 200) }))); }
    if (path === "/genesis/rate") return this.rate(h, b.turn, +b.rating, b.note) ? J({ ok: true }) : J({ error: "no such turn" }, 404);
    if (path === "/genesis/teach") { const t = this.teach(h, b.text, "anders"); return t ? J({ ok: true, lesson: t }) : J({ error: "that isn't a lesson Genesis can take on (too short, already known, or it would loosen the rules)" }, 400); }
    if (path === "/genesis/retire") { this.retire(h, b.id, "retired by " + s.creator); return J({ ok: true }); }
    if (path === "/genesis/restore") { if (q.exec("SELECT COUNT(*) c FROM lesson WHERE on_=1").one().c >= MAX_LESSONS) return J({ error: "Genesis holds " + MAX_LESSONS + " lessons; retire one first" }, 400); q.exec("UPDATE lesson SET on_=1, off_ts=NULL, why=NULL WHERE id=?", +b.id); return J({ ok: true }); }
    if (path === "/genesis/reflect") { if (h._reflecting) return J({ error: "already reflecting" }, 409); h._reflecting = true; try { return J({ ok: true, ...(await this.reflect(h)) }); } catch (e) { return J({ error: String(e.message || e).slice(0, 300) }, 502); } finally { h._reflecting = false; } }
    if (path === "/genesis/tick") return J(await this.tick(h).catch((e) => ({ error: String(e.message || e).slice(0, 200) })));
    if (path === "/genesis/idea") { // build (hand to the Swarm) or dismiss
      const i = q.exec("SELECT * FROM idea WHERE id=?", +b.id).toArray()[0]; if (!i) return J({ error: "no such idea" }, 404);
      if (b.act === "dismiss") { q.exec("UPDATE idea SET status='dismissed' WHERE id=?", i.id); return J({ ok: true }); }
      if (b.act === "built") { q.exec("UPDATE idea SET status=? WHERE id=?", b.pid ? "building" : "open", i.id); if (b.pid) q.exec("UPDATE idea SET pid=?, by_='anders' WHERE id=?", clip(b.pid, 16), i.id); return J({ ok: true }); }
      return J({ error: "build or dismiss" }, 400);
    }
    if (path === "/genesis/name") { const n = clip(b.name, 32); if (n.length < 2) return J({ error: "give a name" }, 400); s.name = n; await h.ctx.storage.put("genesis", s); q.exec("INSERT INTO journal(ts,kind,text,model) VALUES(?,?,?,?)", Date.now(), "milestone", s.creator + " renamed me " + n + ".", null); return J({ ok: true }); }
    return J({ error: "not found" }, 404);
  },
};

// the first JSON object in a model's reply (fences, chatter and <think> blocks around it are fine)
function jsonOf(t) {
  t = String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, ""); const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null; try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
}
