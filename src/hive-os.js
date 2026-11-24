// FaberOS asks AutoFaber to act (assets/os/os.js): a sentence ("put the satellite tracker next to the conflict atlas")
// becomes a short list of FaberOS actions. AutoFaber only proposes; nothing here touches anyone's data. Every action is
// checked against a fixed set of verbs and the apps the request named, and FaberOS checks them again against its own
// manifest before it does anything. A sentence that isn't about arranging apps comes back as one "ask" action, which
// FaberOS hands to the AutoFaber chat as a question.
// Faber Verbs: an app can declare things it does (Ballast: add a transaction). AutoFaber may name one, with arguments;
// only a verb the request listed for that app passes, its arguments must be a small flat object, and FaberOS checks
// them again against the app's manifest and asks the person before any verb that changes their data.
const VERBS = new Set(["open", "close", "snap", "tile", "desktop", "maximize", "ask", "verb"]);
const MAX_ACTIONS = 6;
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const OS_DAY = 30; // a visitor's FaberOS plans a day (each is one small model call)

const SYSTEM = (apps, open) => `You turn one request into actions for FaberOS, a desktop of apps in windows.
Reply with JSON only: {"actions":[...]} and nothing else. At most ${MAX_ACTIONS} actions, in order. The actions:
{"do":"open","app":ID}                    open an app (or bring it to the front)
{"do":"close","app":ID}                   close an open app
{"do":"snap","app":ID,"side":"left"|"right"}  put an app's window on the left or right half
{"do":"maximize","app":ID}                make an app's window fill the screen
{"do":"tile"}                             lay out every open window
{"do":"desktop"}                          hide the windows and show the desktop
{"do":"ask","text":TEXT}                  hand a question to the AutoFaber chat
{"do":"verb","app":ID,"verb":NAME,"args":{...}}  have an app do one of its verbs (listed under the app below)
Rules: use only these IDs. "Next to", "beside", "side by side" or "compare" two apps means open both, snap the first
left and the second right. When the request is something an app's verb does (logging money, a balance, a search,
tracking a satellite, showing a conflict), use that verb with its arguments filled from the request; a verb opens its
app by itself. Amounts are plain numbers; dates are YYYY-MM-DD; leave out optional arguments you weren't given. If the
request is a question or anything else, reply with one ask action holding the request as written. Never invent an app
or a verb.
The apps (ID: name, what it is):
${apps.map((a) => a.id + ": " + a.name + (a.desc ? ", " + a.desc : "") + (a.verbs || []).map((v) => "\n  verb " + v.name + " " + JSON.stringify(v.args) + (v.desc ? ": " + v.desc : "")).join("")).join("\n")}
Open now: ${open.length ? open.join(", ") : "nothing"}
Today is ${new Date().toISOString().slice(0, 10)}.`;

const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

const flatArgs = (x) => { // a small flat object of plain values, or null
  if (x == null) return {}; if (typeof x !== "object" || Array.isArray(x)) return null;
  const out = {}; for (const [k, v] of Object.entries(x).slice(0, 8)) { if (!/^[a-z][a-zA-Z0-9]{0,20}$/.test(k)) continue;
    if (typeof v === "number" && isFinite(v)) out[k] = v; else if (typeof v === "boolean") out[k] = v; else if (typeof v === "string") out[k] = clean(v, 200); }
  return JSON.stringify(out).length <= 800 ? out : null; };

export function checkActions(raw, ids, verbsOf = new Map()) {
  let j = raw; if (typeof raw === "string") { const m = raw.match(/\{[\s\S]*\}/); if (!m) return null; try { j = JSON.parse(m[0]); } catch (e) { return null; } }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.actions) ? j.actions : null; if (!list) return null;
  const out = [];
  for (const a of list.slice(0, MAX_ACTIONS)) {
    if (!a || !VERBS.has(a.do)) continue;
    if (["open", "close", "snap", "maximize"].includes(a.do) && !ids.has(a.app)) continue;
    if (a.do === "snap" && !["left", "right"].includes(a.side)) continue;
    if (a.do === "ask" && !clean(a.text, 2000)) continue;
    if (a.do === "verb") { const vs = verbsOf.get(a.app), args = flatArgs(a.args); if (!vs || !vs.has(a.verb) || !args) continue; out.push({ do: "verb", app: a.app, verb: a.verb, args }); continue; }
    out.push(a.do === "ask" ? { do: "ask", text: clean(a.text, 2000) } : a.do === "snap" ? { do: "snap", app: a.app, side: a.side } : a.app ? { do: a.do, app: a.app } : { do: a.do });
  }
  return out.length ? out : null;
}

export async function osPlan(h, body) {
  const text = clean(body.text, 500); if (!text) throw Object.assign(new Error("say what you'd like FaberOS to do"), { status: 400 });
  const verbList = (vs) => (Array.isArray(vs) ? vs : []).slice(0, 8).map((v) => ({ name: clean(v && v.name, 40), desc: clean(v && v.desc, 160),
    args: Object.fromEntries(Object.entries(v && v.args && typeof v.args === "object" ? v.args : {}).slice(0, 8).filter(([k, t]) => /^[a-z][a-zA-Z0-9]{0,20}\??$/.test(k) && typeof t === "string").map(([k, t]) => [k, clean(t, 160)])) })).filter((v) => /^[a-z][a-z0-9-]{0,39}$/.test(v.name));
  const apps = (Array.isArray(body.apps) ? body.apps : []).slice(0, 80).map((a) => ({ id: clean(a && a.id, 40), name: clean(a && a.name, 60), desc: clean(a && a.desc, 90), verbs: verbList(a && a.verbs) })).filter((a) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(a.id) && a.name);
  if (!apps.length) throw Object.assign(new Error("no apps to choose from"), { status: 400 });
  const ids = new Set(apps.map((a) => a.id)), open = (Array.isArray(body.open) ? body.open : []).map((x) => clean(x, 40)).filter((x) => ids.has(x)).slice(0, 20);
  const verbsOf = new Map(apps.filter((a) => a.verbs.length).map((a) => [a.id, new Set(a.verbs.map((v) => v.name))]));
  const t0 = Date.now(), reply = await h.cheap(MODEL, SYSTEM(apps, open), [{ role: "user", text }], 400);
  const actions = checkActions(reply, ids, verbsOf) || [{ do: "ask", text }]; // a reply that isn't usable: the request goes to the chat as written
  return { actions, ms: Date.now() - t0 };
}
