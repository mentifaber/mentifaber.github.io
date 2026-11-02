// Canvas: an answer opened as a document the user edits. Asked for a change, a model rewrites only the passage the user
// selected (or the whole document when nothing is selected) and leaves everything else exactly as it was. The passage goes
// to the model in place, between ⟦ ⟧, so the rewrite fits where it sits.
import { complete } from "./hive-kit.js";

const WRITERS = ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"], MAX_DOC = 40000;
export const PRESETS = {
  shorter: "Make it about half as long. Keep every point that matters; cut repetition, filler and hedging.",
  longer: "Make it about half again as long: add useful detail, examples or explanation where they help. No padding.",
  simpler: "Rewrite it in plain words a 12-year-old could follow: short sentences, no jargon (or explain it when it can't be avoided).",
  polish: "Fix spelling, grammar and awkward phrasing, and tighten it. Keep the meaning, the voice and the structure.",
  formal: "Make the tone formal and professional.",
  casual: "Make the tone friendly and conversational.",
  comments: "Add clear, brief comments to the code explaining what each part does and why. Don't change the code itself.",
  fix: "Find and fix bugs in the code. Keep its structure and style; add a short comment on each line you fixed saying what was wrong.",
};
const clip = (s, n) => String(s || "").slice(0, n);
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);

// what came back, as just the passage: no markers, no "Here's the rewrite:", no fences the original didn't have
export function cleanRewrite(out, part) {
  let t = String(out || "").replace(/[⟦⟧]/g, "").trim();
  t = t.replace(/^(?:sure[,!.]?\s*)?(?:here(?:'s| is)|below is)[^\n]{0,80}:\s*\n+/i, "");
  if (!/^\s*```/.test(part) && /^```[\w-]*\n[\s\S]*\n```$/.test(t)) t = t.replace(/^```[\w-]*\n/, "").replace(/\n```$/, "");
  if (!/^\s*["“]/.test(part) && /^["“][\s\S]*["”]$/.test(t) && !/\n/.test(t)) t = t.slice(1, -1);
  const lead = /^\s*/.exec(part)[0], trail = /\s*$/.exec(part)[0];
  return t.trim() ? lead + t.trim() + trail : "";
}

// { text, whole, model, ms } or { error }: text is the new passage (or the new document when whole)
export async function rewrite(h, { doc, start, end, how, preset }) {
  const t0 = Date.now(); doc = clip(doc, MAX_DOC);
  const ask = PRESETS[preset] || clip(String(how || "").trim(), 800);
  if (!doc.trim()) return { error: "there's nothing in the canvas to change" };
  if (!ask) return { error: "say what to change" };
  const s = Number.isInteger(start) ? Math.max(0, Math.min(start, doc.length)) : 0, e = Number.isInteger(end) ? Math.max(s, Math.min(end, doc.length)) : doc.length;
  const whole = e - s < 1 || (s === 0 && e === doc.length), part = whole ? doc : doc.slice(s, e);
  if (!part.trim()) return { error: "the selection is only blank space" };
  const sys = whole
    ? "You edit documents. Rewrite the whole document as the instruction says. Keep its language and its Markdown structure (headings, lists, tables, code blocks) unless the instruction asks otherwise. Reply with the new document only: no preamble, no notes about what you changed."
    : "You edit documents. In the document, one passage is marked ⟦like this⟧. Rewrite ONLY that passage as the instruction says, so it still fits where it sits: the same language and Markdown style, and no heading, greeting or closing line the passage didn't have. Reply with the new passage only: no ⟦ ⟧ markers, no quotes around it, no notes about what you changed.";
  const user = "INSTRUCTION: " + ask + "\n\n" + (whole ? "DOCUMENT:\n" + doc : "DOCUMENT (rewrite only the passage between ⟦ and ⟧):\n" + doc.slice(0, s) + "⟦" + part + "⟧" + doc.slice(e));
  const max = Math.min(6000, Math.round(part.length / 2.2) + 900);
  let why = "";
  for (const model of WRITERS) {
    try {
      const text = cleanRewrite(await timed(complete(h.env, null, null, model, sys, [{ role: "user", text: user }], max), 60000), part);
      if (text) return { text, whole, model: model.split("/").pop(), ms: Date.now() - t0 };
      why = "the model sent back nothing";
    } catch (x) { why = String(x.message || x).slice(0, 160); }
  }
  return { error: "couldn't rewrite it: " + why, ms: Date.now() - t0 };
}
