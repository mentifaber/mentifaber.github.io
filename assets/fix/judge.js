// Fix or Replace's sums (game plan GP-4.3), shared by /fix and the Repair Café's door queue (/repair): what a repair
// should cost, what the device is worth, and the call. judge(o) takes { kind, fault, age, price, warr, rate } and gives the
// verdict (v: fix, rep, mid or war), why (HTML), the figures and tips.
(() => {
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Each kind: usual life in years, a typical price new, how much of that it keeps by age (years 0, 1, 2…), whether a
  // technician comes to you (a call-out fee) and whether it can go to the workshop by mail. Each fault: parts low/high ($),
  // labour low/high (hours), and flags: dx = needs a diagnosis (the range is wide), data = back it up first, hv = not a DIY job.
  const K = {
    phone: { n: "Phone", life: 5, newp: 800, ret: [1, .6, .45, .33, .23, .15, .1, .07], mail: true, words: /phone|iphone|pixel|galaxy|android|moto/, faults: [
      ["screen", "Cracked or dead screen", 50, 250, .5, 1], ["battery", "Battery dies fast or swells", 25, 90, .5, .75], ["charge", "Won't charge", 15, 60, .75, 1.5, "dx"],
      ["camera", "Camera broken or blurry", 30, 150, .5, 1], ["audio", "Can't hear calls, mic or speaker", 15, 60, .75, 1], ["water", "Got wet", 0, 200, 1, 3, "dx data"],
      ["dead", "Won't turn on", 20, 250, 1, 3, "dx data"], ["slow", "Slow, full or acting up", 0, 0, .5, 1.5, "data"]] },
    laptop: { n: "Laptop", life: 6, newp: 1000, ret: [1, .65, .5, .38, .28, .2, .14, .1], mail: true, words: /laptop|macbook|notebook|chromebook|thinkpad|surface/, faults: [
      ["screen", "Cracked or dead screen", 80, 320, 1, 2], ["battery", "Battery won't hold a charge", 50, 150, .5, 1], ["keyboard", "Keys or trackpad not working", 40, 180, 1, 2.5],
      ["charge", "Won't charge", 20, 120, 1, 3, "dx"], ["slow", "Slow (an SSD or memory helps)", 0, 120, 1, 2, "data"], ["disk", "Drive failing or clicking", 50, 150, 1, 2, "data"],
      ["hinge", "Broken hinge", 20, 110, 1, 2], ["hot", "Overheats or fan roars", 0, 50, 1, 1.5], ["water", "Got a drink spilled on it", 0, 400, 2, 4, "dx data"], ["dead", "Won't turn on", 0, 400, 1.5, 4, "dx data"]] },
    tablet: { n: "Tablet", life: 5, newp: 500, ret: [1, .65, .5, .38, .28, .2, .13, .09], mail: true, words: /tablet|ipad|kindle|fire hd/, faults: [
      ["screen", "Cracked or dead screen", 60, 250, 1, 2], ["battery", "Battery dies fast", 30, 90, 1, 1.5], ["charge", "Won't charge", 15, 60, 1, 1.5, "dx"],
      ["dead", "Won't turn on", 20, 200, 1, 3, "dx data"], ["slow", "Slow or acting up", 0, 0, .5, 1.5, "data"]] },
    desktop: { n: "Desktop PC", life: 7, newp: 1000, ret: [1, .6, .45, .33, .25, .18, .13, .1], mail: true, words: /desktop|imac|tower|gaming pc|\bpc\b/, faults: [
      ["dead", "Won't turn on (often the power supply)", 50, 150, .5, 1.5, "dx"], ["slow", "Slow (an SSD or memory helps)", 50, 150, 1, 2, "data"], ["disk", "Drive failing", 50, 150, 1, 2, "data"],
      ["hot", "Overheats, shuts off, fans roar", 0, 60, 1, 1.5], ["virus", "Virus, pop-ups, acting up", 0, 0, 1, 2.5, "data"]] },
    console: { n: "Game console", life: 7, newp: 450, ret: [1, .75, .62, .52, .44, .36, .3, .25], mail: true, words: /console|xbox|playstation|ps5|ps4|switch|nintendo/, faults: [
      ["hdmi", "No picture (HDMI port)", 10, 30, 1, 2], ["drift", "Controller drifts", 10, 40, .5, 1], ["hot", "Overheats or loud", 0, 30, 1, 1.5],
      ["disc", "Won't read discs", 30, 100, 1, 1.5], ["dead", "Won't turn on", 40, 100, 1, 2, "dx"]] },
    tv: { n: "TV", life: 8, newp: 600, ret: [1, .55, .42, .33, .26, .2, .16, .12, .1], call: [75, 150], words: /\btv\b|television|oled|qled/, faults: [
      ["backlight", "Sound but no picture (backlight)", 20, 80, 1.5, 3], ["power", "Won't turn on (power board)", 30, 120, 1, 1.5, "dx"], ["panel", "Cracked screen", 300, 900, 1, 2],
      ["lines", "Lines or bands on the picture", 40, 250, 1, 2, "dx"], ["sound", "No sound", 20, 80, 1, 1.5]] },
    printer: { n: "Printer", life: 5, newp: 200, ret: [1, .5, .35, .25, .18, .12, .08], words: /printer|laserjet|inkjet/, faults: [
      ["jam", "Jams or won't take paper", 0, 40, .5, 1], ["streaks", "Streaks or faded prints", 10, 60, .5, 1], ["connect", "Won't connect", 0, 0, .5, 1]] },
    washer: { n: "Washer", life: 11, newp: 900, big: true, call: [75, 150], words: /washer|washing machine/, faults: [
      ["drain", "Won't drain (pump)", 30, 90, 1, 1.5], ["spin", "Won't spin (belt, lid switch)", 20, 120, 1, 2], ["leak", "Leaking", 15, 100, 1, 2],
      ["bearing", "Loud rumbling (drum bearing)", 60, 250, 3, 5], ["board", "Dead or error codes (control board)", 100, 300, 1, 1.5, "dx"]] },
    dryer: { n: "Dryer", life: 13, newp: 800, big: true, call: [75, 150], words: /dryer/, faults: [
      ["heat", "Runs but no heat", 15, 100, 1, 1.5], ["tumble", "Won't tumble (belt)", 15, 40, 1, 1.5], ["noise", "Squeals or thumps", 20, 60, 1, 1.5], ["dead", "Won't start", 10, 150, 1, 1.5, "dx"]] },
    fridge: { n: "Fridge", life: 13, newp: 1600, big: true, call: [75, 150], words: /fridge|refrigerator|freezer/, faults: [
      ["warm", "Not cold enough (fan, relay, defrost)", 30, 180, 1, 2, "dx"], ["compressor", "Compressor or sealed system", 300, 700, 4, 6, "hv"], ["ice", "Ice maker or water dispenser", 60, 180, 1, 1.5],
      ["leak", "Leaking water", 10, 60, 1, 1.5], ["noise", "Loud humming or clicking", 30, 150, 1, 1.5, "dx"]] },
    dishwasher: { n: "Dishwasher", life: 10, newp: 700, big: true, call: [75, 150], words: /dishwasher/, faults: [
      ["drain", "Won't drain", 30, 120, 1, 1.5], ["clean", "Dishes come out dirty", 0, 80, 1, 1.5], ["leak", "Leaking", 15, 80, 1, 1.5], ["board", "Dead or error codes (control board)", 100, 250, 1, 1.5, "dx"]] },
    microwave: { n: "Microwave", life: 9, newp: 200, big: true, call: [75, 150], words: /microwave/, faults: [
      ["heat", "Runs but doesn't heat", 60, 130, 1, 1.5, "hv"], ["turn", "Turntable doesn't turn", 10, 30, .5, 1], ["dead", "Won't start", 10, 60, 1, 1.5, "dx hv"]] },
  };
  const ORDER = ["phone", "laptop", "tablet", "desktop", "console", "tv", "printer", "washer", "dryer", "fridge", "dishwasher", "microwave"];
  const r5 = (x) => Math.max(0, Math.round(x / 5) * 5), usd = (x) => "$" + r5(x).toLocaleString("en-US");
  const keeps = (k, age) => { if (k.big) return Math.max(.08, 1 - .85 * age / k.life); const r = k.ret, i = Math.floor(age); if (i >= r.length - 1) return r[r.length - 1]; return r[i] + (r[i + 1] - r[i]) * (age - i); };
  const kindOf = (text) => { const t = String(text || "").toLowerCase(); if (/dishwasher/.test(t)) return "dishwasher"; return ORDER.find((k) => K[k].words.test(t)) || null; };
  const faultOf = (k, text) => { const t = String(text || "").toLowerCase(), fs = K[k].faults; if (!t) return null;
    const syn = [["screen", /screen|crack|display|glass|shatter/], ["battery", /battery|dies fast|swell/], ["charge", /charg|port|plug/], ["water", /water|wet|spill|drink|drop.*(toilet|pool)/],
      ["dead", /won.?t (turn|start|power)|dead|no power|nothing happens/], ["slow", /slow|lag|full|storage/], ["keyboard", /key|trackpad/], ["disk", /drive|disk|click/], ["hot", /hot|heat|fan|loud/],
      ["hdmi", /hdmi|no picture/], ["drift", /drift|stick|controller/], ["drain", /drain|standing water/], ["spin", /spin/], ["leak", /leak/], ["warm", /not cold|warm|cool/], ["ice", /ice|dispenser/],
      ["heat", /no heat|doesn.?t heat|not heating|cold/], ["clean", /dirty|clean/], ["jam", /jam|paper/], ["camera", /camera|photo/], ["audio", /hear|speaker|mic/], ["hinge", /hinge/], ["backlight", /backlight|black screen|no picture/], ["noise", /nois|squeal|thump|rumbl|hum/], ["bearing", /rumbl|bearing/]];
    for (const [id, re] of syn) if (re.test(t) && fs.some((f) => f[0] === id)) return id;
    return fs.find((f) => f[1].toLowerCase().split(/\W+/).some((w) => w.length > 3 && t.includes(w)))?.[0] || null; };

  // the sums: what a repair costs, what it's worth, and the call
  function judge(o) {
    const k = K[o.kind], f = k.faults.find((x) => x[0] === o.fault), flags = (f[6] || "").split(" "), rate = o.rate || 90, call = k.call || [0, 0];
    const lo = f[2] + f[4] * rate + call[0], hi = f[3] + f[5] * rate + call[1], mid = (lo + hi) / 2, age = o.age, newp = o.price || k.newp;
    const used = newp * keeps(k, age), asIs = used * .25, left = Math.max(0, k.life - age), dx = flags.includes("dx");
    let v, why;
    if (o.warr) { v = "war"; why = "It's still covered, so the repair should cost you nothing. Ask the maker or the plan first; if they turn it down, this is what a fair repair costs."; }
    else if (k.big) {
      // a big appliance: compare what the repair costs per year it has left with what a new one costs per year of its life
      const perYear = mid / Math.max(left, 1.5), newYear = newp / k.life;
      if (perYear <= newYear * .5 || mid <= newp * .15) { v = "fix"; why = "About <b>" + usd(lo) + "–" + usd(hi) + "</b> keeps a " + esc(k.n.toLowerCase()) + " going that " + (left >= 1 ? "should have about " + Math.round(left) + " more year" + (Math.round(left) === 1 ? "" : "s") + " in it" : "is past its usual years but this is a cheap fix") + ". A new one is about " + usd(newp) + "."; }
      else if (perYear >= newYear) { v = "rep"; why = (left < 1 ? "At " + age + " years it's past a " + esc(k.n.toLowerCase()) + "'s usual " + k.life + ", and" : "For the years it has left,") + " the repair (about <b>" + usd(mid) + "</b>) costs more than a new one would over the same time. Put the money toward a new one (about " + usd(newp) + ")."; }
      else { v = "mid"; why = "The repair (about <b>" + usd(lo) + "–" + usd(hi) + "</b>) is a fair part of a new one (about " + usd(newp) + "). " + (age < k.life / 2 ? "It's young for a " + esc(k.n.toLowerCase()) + ", so lean toward fixing it." : "It's past halfway through a " + esc(k.n.toLowerCase()) + "'s usual life, so lean toward replacing it if anything else is wearing out."); }
    } else {
      // a gadget: replacing it means buying a working one like it, used, less what this one fetches for parts; fixing it is
      // the better deal while it costs no more than that
      if (mid <= used - asIs && age < k.life) { v = "fix"; why = "About <b>" + usd(lo) + "–" + usd(hi) + "</b> brings back a " + esc(k.n.toLowerCase()) + " worth about " + usd(used) + " working" + (left >= 1 ? ", with about " + Math.round(left) + " good year" + (Math.round(left) === 1 ? "" : "s") + " left" : "") + "."; }
      else if (mid >= used || (age >= k.life && mid > used * .3)) { v = "rep"; why = "The repair (about <b>" + usd(lo) + "–" + usd(hi) + "</b>) is " + (mid >= used ? "more than a working one like it costs used (about " + usd(used) + ")" : "a lot to spend on a " + esc(k.n.toLowerCase()) + " past its usual " + k.life + " years") + ". Replace it, and sell this one for parts."; }
      else { v = "mid"; why = "The repair (about <b>" + usd(lo) + "–" + usd(hi) + "</b>) is a fair part of what it's worth working (about " + usd(used) + "). " + (age < k.life / 2 ? "It's young, so lean toward fixing it." : "It's getting on, so lean toward replacing it if it's slow or anything else is going."); }
    }
    const tips = [];
    if (dx) tips.push("This one needs a diagnosis first: it can be a cheap part or something terminal, which is why the range is wide. Most shops credit the diagnostic fee to the repair.");
    if (flags.includes("data")) tips.push("Back up what's on it before anyone opens it up" + (o.fault === "water" ? ", and don't try to switch it on again until it's been dried out and checked" : "") + ".");
    if (flags.includes("hv")) tips.push("Not a do-it-yourself job: it holds dangerous voltage or refrigerant even when it's unplugged.");
    if (v !== "war" && f[3] <= 60 && f[5] <= 1.5 && !flags.includes("hv") && !k.big) tips.push("A careful person can often do this one with a kit and a video, for the parts cost alone.");
    if (v === "rep") tips.push("Sold as-is for parts it might fetch about " + usd(asIs) + ". If you recycle it, take it to an e-waste drop-off; don't put it in the bin.");
    return { v, why, lo, hi, used, newp, asIs, left, age, rate, call, f, k, tips };
  }
  const STAMP = { fix: "Fix it", rep: "Replace it", mid: "Toss-up", war: "Use the warranty" };
  const verdictText = (j) => STAMP[j.v] + ": " + j.why.replace(/<[^>]+>/g, "");
  window.FixJudge = { K, ORDER, usd, keeps, kindOf, faultOf, judge, STAMP, verdictText };
})();
