// Voice: Whisper made to skip silence and phantom words, names to listen for, the listen allowance, the spoken-reply rule
// at the end of the prompt, room for a reasoning model to think, an empty reply rescued, a cut-off flagged.
import assert from "node:assert/strict";
const H = await import("./harness.mjs"); const { call, calls, db, env } = H;
const ok = (m) => console.log("  ✓ " + m);
const base = env.AI.run.bind(env.AI), maxes = [], whisperIn = [];
let whisper = () => ({ text: "" }), empty = new Set(), cutStream = false;
env.AI.run = async (model, input, opts) => {
  if (/whisper/.test(model)) { whisperIn.push(input); return whisper(input); }
  if (input && input.messages) maxes.push({ model, max: input.max_tokens, sys: input.messages[0].content });
  if (empty.has(model)) return { response: "" };
  if (cutStream && input.stream) { const enc = new TextEncoder(); return new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"The cyclone is heading north and"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n')); c.close(); } }); }
  return base(model, input, opts);
};
const AUDIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

whisper = () => ({ text: " you", segments: [{ text: " you", no_speech_prob: 0.2, avg_logprob: -0.4 }], transcription_info: { duration: 3.2, duration_after_vad: 0.5 } });
let r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, ""); assert.match(r.dropped, /you/); ok("a lone “you” is never passed on as speech");
const inp = whisperIn[whisperIn.length - 1]; assert.equal(inp.vad_filter, true); assert.equal(inp.condition_on_previous_text, false); assert.equal(inp.language, "en"); assert.match(inp.initial_prompt, /Anders/); assert.match(inp.initial_prompt, /Vigil/); assert.match(inp.initial_prompt, /AutoFaber|Glossary: \w+/); ok("Whisper runs with its VAD on and the names it's likely to hear");
whisper = () => ({ text: " Thank you.", segments: [{ text: " Thank you.", no_speech_prob: 0.92, avg_logprob: -1.3 }], transcription_info: { duration: 2, duration_after_vad: 0.9 } });
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, ""); ok("segments Whisper itself judges to be silence are dropped");
whisper = () => ({ text: " Thanks for watching!", transcription_info: { duration: 4, duration_after_vad: 0.1 } });
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, ""); ok("nothing left after VAD: nothing heard");
whisper = (i) => ({ text: " " + i.initial_prompt, transcription_info: { duration: 2, duration_after_vad: 0.6 } });
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, ""); ok("the name hint read back over silence is dropped");
whisper = () => ({ text: " Good morning, AutoFaber. What's the world look like?", segments: [{ text: " Good morning, AutoFaber.", no_speech_prob: 0.01, avg_logprob: -0.2 }, { text: " What's the world look like?", no_speech_prob: 0.02, avg_logprob: -0.25 }], transcription_info: { duration: 3, duration_after_vad: 2.6 } });
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, "Good morning, AutoFaber. What's the world look like?"); assert.equal(r.dropped, undefined); ok("real speech comes through whole");
whisper = () => ({ text: " Thank you.", segments: [{ text: " Thank you.", no_speech_prob: 0.05, avg_logprob: -0.2 }], transcription_info: { duration: 1.5, duration_after_vad: 0.8 } });
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, "Thank you."); ok("a clearly spoken “Thank you.” is kept");
let n0 = whisperIn.length; whisper = (i) => { if (i.vad_filter) throw new Error("unknown property vad_filter"); return { text: "Hello there" }; };
r = await call("/stt", { audio: AUDIO, lang: "en" }); assert.equal(r.text, "Hello there"); assert.equal(whisperIn.length - n0, 2); assert.equal(whisperIn[whisperIn.length - 1].vad_filter, undefined); ok("an older Whisper schema still transcribes (plain retry)");
whisper = () => ({ text: "hi" }); r = await call("/stt", { audio: AUDIO, lang: "en" }, false); const vin = whisperIn[whisperIn.length - 1]; assert.doesNotMatch(vin.initial_prompt, /Anders/); assert.match(vin.initial_prompt, /AutoFaber/); ok("visitors' Whisper isn't told the owner's names");

r = await call("/listen-ok", {}); assert.equal(r.ok, true); const before = db.prepare("SELECT COALESCE(SUM(n),0) n FROM limits WHERE k LIKE 'stt:%'").get().n;
r = await call("/listen-ok", {}, false, { "cf-connecting-ip": "203.0.113.9" }); assert.equal(r.ok, true); assert.equal(db.prepare("SELECT COALESCE(SUM(n),0) n FROM limits WHERE k LIKE 'stt:%'").get().n, before + 1); ok("a visitor's live-listening turn counts against their voice allowance; the owner's doesn't");

const voice = (extra) => call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", voice: true, stream: true, messages: [{ role: "user", text: "What's the status of the world right now?" }], ...extra });
r = await voice(); const last = maxes.filter((m) => m.model === "@cf/openai/gpt-oss-120b").pop();
assert.equal(last.max, 2400); assert.match(last.sys, /SPOKEN REPLY[\s\S]*Never offer to fetch or check something later\.$/); ok("voice: room for the model's thinking, and the spoken-reply rule closes the prompt");
assert.match(last.sys, /can't act between messages: never offer to look something up/); ok("no promises to fetch things later, in any mode");
empty.add("@cf/openai/gpt-oss-120b"); r = await voice();
assert.match(r.sse, /Systems are steady tonight/); assert.match(r.sse, /gpt-oss-120b returned nothing; llama-3.3-70b answered/); ok("an empty reply is retried, then answered by another model");
empty.add("@cf/meta/llama-3.3-70b-instruct-fp8-fast"); r = await voice(); assert.match(r.sse, /Sorry, I lost that one\. Could you say it again\?/); assert.doesNotMatch(r.sse, /the model returned nothing/); ok("nothing from anyone: voice says so like a person, never “(the model returned nothing)”");
empty.clear(); cutStream = true; r = await voice(); assert.match(r.sse, /"cut":true/); ok("a reply stopped by the length limit is flagged as cut");
cutStream = false;
r = await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", stream: true, messages: [{ role: "user", text: "hello" }] }); const l2 = maxes.filter((m) => m.model === "@cf/openai/gpt-oss-120b").pop(); assert.equal(l2.max, 4096); assert.doesNotMatch(l2.sys, /SPOKEN REPLY/); ok("typed chat keeps its own limits and format");
console.log("all passed");
