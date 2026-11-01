// Auto: AutoFaber picks the best free model for each message, by what the message needs, with no extra model call (so it
// costs no time). The reason is shown with the answer. Speeds are from the Nov 1 stream captures: gpt-oss-20b's first word
// came in about 0.7 s, gpt-oss-120b's in about 1.8 s; 120b is the stronger reasoner and coder.
import { complete } from "./hive-kit.js";
export const AUTO = "auto|best";
const M = {
  deep: "@cf/openai/gpt-oss-120b",
  fast: "@cf/openai/gpt-oss-20b",
  eyes: "@cf/meta/llama-4-scout-17b-16e-instruct", // sees images itself
  prose: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};
const CODE = /```|\b(function|class|def|const|let|var|import|SELECT|regex|stack ?trace|exception|compile|bug|debug|refactor|typescript|javascript|python|rust|golang|java|c\+\+|sql|bash|css|html|api|endpoint|json|yaml|docker|kubernetes|git)\b|[{};]\s*$|=>/i;
const MATH = /\b(prove|proof|solve|derive|integral|derivative|equation|probability|theorem|calculate|optimi[sz]e|step by step|how many ways|logic puzzle|riddle)\b|[=^√∑∫]|\d\s*[-+*/×÷]\s*\d/i;
const PROSE = /\b(write|draft|rewrite|compose|story|poem|lyrics|essay|email|letter|speech|toast|caption|bio|slogan|tagline|blog post)\b/i;
const SMALL = /^(hi|hey|hello|yo|thanks?|thank you|cheers|ok(ay)?|cool|nice|great|lol|haha|good (morning|night|evening)|bye)\b[\s!.,?]*$/i;

// { model, why }: images → eyes; research → deep; voice or a quick ask → fast; code or math → deep; writing → prose; else deep.
// skip(model) says a model is resting (rate-limited, failing); the next best is used.
export function autoRoute({ text, images, research, voice, quick }, skip = () => false) {
  const t = String(text || "").trim(), pick = (list) => list.find(([m]) => !skip("workers-ai|" + m)) || list[list.length - 1];
  let order;
  if (images) order = [[M.eyes, "it can see your image"], [M.deep, "the image is described for it"]];
  else if (research) order = [[M.deep, "research needs the strongest reasoner"], [M.prose, "the strongest is resting"]];
  else if (voice) order = [[M.fast, "voice wants the quickest first word"], [M.prose, "the quickest is resting"]];
  else if (quick || SMALL.test(t)) order = [[M.fast, "a quick one: the fastest model answers"], [M.prose, "the fastest is resting"]];
  else if (CODE.test(t)) order = [[M.deep, "code: the strongest coder answers"], [M.prose, "the strongest is resting"]];
  else if (MATH.test(t)) order = [[M.deep, "math and reasoning: the strongest reasoner answers"], [M.prose, "the strongest is resting"]];
  else if (PROSE.test(t) && t.length < 600) order = [[M.prose, "writing: a fluent writer answers"], [M.deep, "the writer is resting"]];
  else order = [[M.deep, "a full answer from the strongest model"], [M.prose, "the strongest is resting"]];
  const [model, why] = pick(order);
  return { model, why };
}

// Follow-ups: after an answer, three short questions the user might ask next, written by a small fast model once the answer
// is done (so the answer itself is never slower). In the user's language; nothing comes back when they wouldn't help.
const FOLLOW = "@cf/meta/llama-3.2-3b-instruct";
export async function followUps(env, ask, answer, ms = 4000) {
  if (!env.AI || String(answer || "").length < 60) return [];
  const sys = "Suggest the three most useful follow-up questions the user might ask next, given their question and the answer. Each under 12 words, specific to this answer, written as the user would ask, in the user's language. " +
    "Reply with ONLY JSON: {\"q\": [\"...\", \"...\", \"...\"]}. If no follow-up would help (a greeting, a thank-you), reply {\"q\": []}.";
  const out = await Promise.race([complete(env, null, null, FOLLOW, sys, [{ role: "user", text: "QUESTION: " + String(ask || "").slice(0, 1500) + "\n\nANSWER: " + String(answer).slice(0, 3000) }], 160), new Promise((r) => setTimeout(() => r(""), ms))]).catch(() => "");
  try { const m = /\{[\s\S]*\}/.exec(String(out || "")), q = m ? JSON.parse(m[0]).q : []; return (Array.isArray(q) ? q : []).map((x) => String(x || "").replace(/\s+/g, " ").trim()).filter((x) => x.length > 4 && x.length < 120).slice(0, 3); } catch (e) { return []; }
}
