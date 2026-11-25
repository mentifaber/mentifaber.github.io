/* Checks a FaberOS app manifest (format "faberos/1") the way FaberOS and Foundry read it: what's required, what's
   allowed, and the Faber Verbs an app declares. Used by the makers' page (/makers) and by Node tests.
     FaberValidate(obj) → { ok, errors: [..], warnings: [..] } */
(function (root) {
  const PERMS = ["fullscreen", "autoplay", "clipboard-write", "clipboard-read", "camera", "microphone", "geolocation", "screen-wake-lock", "web-share", "gyroscope", "accelerometer", "magnetometer", "xr-spatial-tracking"];
  const SENSITIVE = ["camera", "microphone", "geolocation", "clipboard-read", "gyroscope", "accelerometer", "magnetometer", "xr-spatial-tracking"];
  const CATS = ["signals", "ai", "tools", "world", "play", "craft"], STATUS = ["live", "invite", "soon", "android", "music"];
  const TYPES = /^(number|string|date|boolean|enum:[^|]{1,40}(\|[^|]{1,40}){0,29})$/;
  function check(m) {
    const errors = [], warnings = [], e = (x) => errors.push(x), w = (x) => warnings.push(x);
    if (!m || typeof m !== "object" || Array.isArray(m)) return { ok: false, errors: ["A manifest is one JSON object."], warnings };
    if (m.format !== undefined && m.format !== "faberos/1") e('format must be "faberos/1".');
    if (typeof m.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(m.id)) e("id: 2 to 40 characters, lowercase letters, digits and hyphens, starting with a letter or digit.");
    if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 40) e("name: what the app is called, at most 40 characters.");
    if (typeof m.desc !== "string" || m.desc.trim().length < 20 || m.desc.length > 600) e("desc: what it does, in a sentence or two (20 to 600 characters).");
    if (m.cat !== undefined && !CATS.includes(m.cat)) e("cat: one of " + CATS.join(", ") + ".");
    if (m.status !== undefined && !STATUS.includes(m.status)) e("status: one of " + STATUS.join(", ") + ".");
    if (typeof m.entry !== "string" || !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(m.entry)) e("entry: the https:// address FaberOS opens in a window.");
    else if (/^https:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(m.entry)) e("entry: has to be reachable on the internet, not a local address.");
    if (m.hue !== undefined && !(Number.isInteger(m.hue) && m.hue >= 0 && m.hue < 360)) e("hue: a colour wheel angle, 0 to 359.");
    const perms = m.permissions === undefined ? [] : m.permissions;
    if (!Array.isArray(perms)) e("permissions: a list.");
    else { for (const p of perms) if (!PERMS.includes(p)) e('permissions: "' + p + '" isn\'t one FaberOS grants (' + PERMS.join(", ") + ").");
      const s = perms.filter((p) => SENSITIVE.includes(p)); if (s.length) w("FaberOS will ask people before granting " + s.join(", ") + ". Ask only for what the app really uses."); }
    if (m.accepts !== undefined && (!Array.isArray(m.accepts) || m.accepts.some((a) => typeof a !== "string" || !/^(\.[a-z0-9]{1,8}|[a-z]+\/[a-z0-9.+*-]+)$/i.test(a)))) e('accepts: file types like ".pdf" or "image/*".');
    if (m.verbs !== undefined) {
      if (!Array.isArray(m.verbs)) e("verbs: a list.");
      else { if (m.verbs.length > 8) e("verbs: at most 8."); const seen = new Set();
        m.verbs.forEach((v, i) => { const at = "verbs[" + i + "]";
          if (!v || typeof v !== "object") return e(at + ": an object.");
          if (typeof v.name !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(v.name)) e(at + ".name: lowercase letters, digits and hyphens."); else if (seen.has(v.name)) e(at + ".name: \"" + v.name + "\" twice."); else seen.add(v.name);
          if (typeof v.label !== "string" || !v.label.trim() || v.label.length > 60) e(at + ".label: what it does, as a button would say it (at most 60 characters).");
          if (typeof v.changes !== "boolean") e(at + ".changes: true if it changes the person's data (FaberOS asks them first), false if it only reads.");
          const a = v.args === undefined ? {} : v.args;
          if (!a || typeof a !== "object" || Array.isArray(a)) e(at + ".args: an object of name → type.");
          else { const ks = Object.keys(a); if (ks.length > 8) e(at + ".args: at most 8.");
            for (const k of ks) { if (!/^[a-z][a-zA-Z0-9]{0,20}\??$/.test(k)) e(at + ".args: \"" + k + "\" isn't a usable name."); if (typeof a[k] !== "string" || !TYPES.test(a[k])) e(at + ".args." + k + ': number, string, date, boolean or "enum:a|b|c".'); } }
          if (v.changes === true && !/[a-z]/i.test(v.desc || "")) w(at + ": a verb that changes data should say what it changes in desc; it's shown on the question FaberOS asks."); });
        if (m.verbs.length && !m.kit) w("verbs need the Faber kit: load https://mentifaber.org/assets/os/faber.js and call Faber.verbs({...}).");
      }
    }
    return { ok: !errors.length, errors, warnings };
  }
  check.PERMS = PERMS;
  if (typeof module === "object" && module.exports) module.exports = check; else root.FaberValidate = check;
})(typeof window !== "undefined" ? window : globalThis);
