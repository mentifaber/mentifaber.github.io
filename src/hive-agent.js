// Genesis · agent: Genesis decides which tools a message needs. A quick planning call reads the message (and what was
// already gathered by the automatic triggers), picks tools from the registry below, and after seeing the results can
// ask for one more round (for example: read the page a search turned up). The tools themselves run in hive.js (useTool).
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);

// name → [what it's for, its argument, owner only]
export const TOOLS = {
  web: ["search the web for current or specific information (news, recent events, products, people, anything that changes or that you might misremember)", "search query"],
  read: ["read one web page in full (a link the user gave, or a result from an earlier search worth reading closely)", "https URL"],
  wiki: ["read Wikipedia's summary of a topic, person, place or concept", "topic"],
  papers: ["find research papers (arXiv and OpenAlex: titles, authors, years, citations, abstracts)", "research question or keywords"],
  hf: ["search the Hugging Face Hub for datasets and AI models", "keywords"],
  rows: ["read actual rows from a Hugging Face dataset, optionally searching inside it", "owner/dataset, then optional words to search for, separated by |"],
  weather: ["current weather and forecast for a place", "town or city"],
  quotes: ["live prices for stocks, crypto, indices or currencies", "tickers or names, comma-separated"],
  vigil: ["the owner's live board: aircraft and emergency squawks, earthquakes, space weather, conflict, alerts, volcanoes, launches, the ISS, markets", "topics, comma-separated: air, quakes, space, conflict, alerts, volcanoes, launches, iss, markets, summary", true],
  world: ["Genesis's own hourly record of world conflict and great-power tension, with trends over days", "", true],
  site: ["the owner's projects as listed on mentifaber.org (names, status, what each is)", "", true],
};
export const toolsFor = (owner) => Object.keys(TOOLS).filter((k) => owner || !TOOLS[k][2]);

// Small talk, thanks, and commands that are about the app itself don't need a planner call.
export function worthPlanning(text) {
  const t = String(text || "").trim();
  if (t.length < 12 || !/[a-z]{3}/i.test(t)) return false;
  return !/^(hi|hey|hello|yo|thanks?|thank you|cheers|ok(ay)?|cool|nice|great|lol|haha|good (morning|night|evening))\b[\s!.,?]*$/i.test(t);
}

export function plannerPrompt(owner, now) {
  return "You decide which tools Genesis (an AI assistant) uses before it answers. You never answer the user yourself. " +
    "Tools:\n" + toolsFor(owner).map((k) => "- " + k + (TOOLS[k][1] ? " (" + TOOLS[k][1] + ")" : "") + ": " + TOOLS[k][0]).join("\n") +
    "\n\nUse tools when the answer depends on facts that change (news, prices, weather, live events), specific facts or numbers that could be misremembered, sources or citations the user wants, or a link they gave. Use none for conversation, opinions, advice, creative writing, explaining well-known ideas, or writing code from scratch. " +
    "Prefer few, precise calls: at most 4. Write arguments as a good search engine query, not a sentence. Never repeat a call listed under ALREADY GATHERED. " +
    "Reply with ONLY JSON: {\"calls\": [{\"tool\": \"wiki\", \"arg\": \"...\"}]} (an empty list when nothing is needed). Now: " + now + ".";
}

// what the planner sees: the recent conversation, the newest message, and what's already in hand
export function plannerInput(msgs, gathered, round) {
  const hist = msgs.slice(-5, -1).map((m) => (m.role === "user" ? "USER: " : "GENESIS: ") + clip(m.text, 400)).join("\n");
  const last = msgs[msgs.length - 1];
  return (hist ? "EARLIER IN THE CONVERSATION:\n" + hist + "\n\n" : "") + "THE MESSAGE TO ANSWER:\n" + clip(last.text, 2000) +
    (gathered.length ? "\n\nALREADY GATHERED" + (round > 1 ? " (round " + (round - 1) + " results; add calls only if something essential is still missing, e.g. read the most relevant page in full)" : "") + ":\n" + gathered.map((g) => "- " + clip(g, 300)).join("\n") : "");
}

// the planner's reply → valid calls only (known tools, allowed for this user, not already made, at most 4)
export function parseCalls(out, owner, made) {
  const t = String(out || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  let j = null; const i = t.indexOf("{"), k = t.lastIndexOf("}"); if (i >= 0 && k > i) try { j = JSON.parse(t.slice(i, k + 1)); } catch (e) {}
  const ok = new Set(toolsFor(owner)), seen = new Set(made || []), calls = [];
  for (const c of (j && Array.isArray(j.calls) ? j.calls : [])) {
    const tool = String(c && c.tool || "").toLowerCase().trim(), arg = clip(c && (c.arg ?? c.query ?? c.args ?? ""), 300), key = tool + ":" + arg.toLowerCase();
    if (!ok.has(tool) || seen.has(key) || seen.has(tool + ":*")) continue;
    if (TOOLS[tool][1] && !arg) continue; // a tool that needs an argument didn't get one
    if (tool === "read" && !/^https?:\/\/\S+\.\S+/.test(arg)) continue;
    seen.add(key); calls.push({ tool, arg }); if (calls.length >= 4) break;
  }
  return calls;
}
