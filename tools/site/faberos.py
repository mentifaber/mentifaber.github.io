"""FaberOS's app manifest (assets/os/apps.json), generated from the one project registry (tools/site/site.json through
registry.py), so the workshop, FaberOS and Foundry never disagree about what exists.

The four layers:
  Mentifaber  the workshop: every project, its page, its story
  AutoFaber   the intelligence: the mind that answers, remembers and builds
  FaberOS     the operating environment: apps in windows, widgets, one place for permissions
  Foundry     distribution: installs and updates for Android and iPhone, and one day apps by other people

Each entry follows the manifest format "faberos/1". It is the shape a Foundry package will declare, so third-party apps
can come in later without a new format:
  id            unique, lowercase
  name, desc    what it is called and what it does, in a sentence
  cat           its room in the workshop
  status        live · invite (private, by invitation) · soon (not open yet) · android (an Android app) · music
  entry         the page FaberOS opens in a window (null: the app has no runnable part, so the page itself opens)
  page          its datasheet on mentifaber.org
  icon, hue     its tile
  version       the version it last shipped as, when it carries one (assets/versions.json)
  permissions   the browser features it may ask for; the window grants these and nothing else
  platforms     where it runs: web, android (a package id), install (a web app you can add to a home screen)
  widgets       live tiles it offers to the FaberOS desktop
  tags          words people might search for it by
  accepts       the file types it opens from the Shelf (it loads the Faber kit, assets/os/faber.js)
  verbs         what AutoFaber may ask it to do (Faber Verbs): name, label, desc, args ({"name": "number" | "string" |
                "date" | "boolean" | "enum:a|b"}, a name ending "?" is optional), changes (true: FaberOS asks you
                first), words (what people say when they mean it)
  system        part of FaberOS itself
"""
import json, os, re
import registry
from plan import allow_for

ROOT = registry.ROOT
BASICS = {"fullscreen", "autoplay", "clipboard-write"}


def manifest():
    versions = json.load(open(os.path.join(ROOT, "assets/versions.json"), encoding="utf-8"))
    status_of = {"private": "invite"}
    apps = []
    for a in registry.apps():
        i = a["id"]
        c = {}
        p = os.path.join(ROOT, "tools/site/content", i + ".json")
        if os.path.exists(p): c = json.load(open(p, encoding="utf-8"))
        entry = a["app"] if a["app"] and os.path.exists(os.path.join(ROOT, a["app"])) else None
        page = a["href"] or (i + ".html")
        perms = [x.strip() for x in allow_for(entry).split(";") if x.strip()] if entry else sorted(BASICS)
        icon = "assets/icons/v2/" + i + ".svg"
        desc = re.sub(r"\s+", " ", a["desc"]).strip()
        apps.append({
            "id": i, "name": a["name"], "desc": desc, "cat": a["cat"], "status": status_of.get(a["status"], a["status"]),
            "entry": entry, "page": page.replace(".html", "") if page.endswith(".html") else page,
            "icon": icon if os.path.exists(os.path.join(ROOT, icon)) else None, "glyph": a["glyph"], "hue": a["hue"],
            "version": (versions.get(i) or {}).get("version"), "permissions": perms,
            "platforms": {"web": bool(entry) and a["status"] not in ("soon",), "android": a.get("android"),
                          "install": os.path.exists(os.path.join(ROOT, "assets/manifests", i + ".webmanifest"))},
            "widgets": c.get("widgets", []), "data": c.get("data"),
            "accepts": c.get("accepts", []), "verbs": c.get("verbs", []), "kit": bool(c.get("accepts") or c.get("verbs")),
            "tags": " · ".join([c.get("kicker") or ""] + [x for x in c.get("caps", []) if isinstance(x, str)]).strip(" ·"),
        })
    system = [
        {"id": "foundry", "name": "Foundry", "desc": "Installs and updates for Mentifaber's Android and iPhone apps, each download checked before it installs.",
         "cat": "system", "status": "live", "entry": "store.html", "page": "store", "icon": None, "glyph": registry.GLYPH.get("mentifaber"), "hue": 38,
         "version": None, "permissions": sorted(BASICS), "platforms": {"web": True, "android": None, "install": True}, "widgets": [], "system": True},
        {"id": "privacy", "name": "Privacy", "desc": "Where what you send goes: conversations, memory, keys, location and models, in one place.",
         "cat": "system", "status": "live", "entry": "privacy.html", "page": "privacy", "icon": None, "glyph": registry.GLYPH.get("lexicon"), "hue": 38,
         "version": None, "permissions": [], "platforms": {"web": True, "android": None, "install": False}, "widgets": [], "system": True},
    ]
    out = {"format": "faberos/1", "os": "FaberOS", "version": "0.4",
           "cats": [{"id": k, "name": n, "desc": d} for k, n, d in registry.CATS] + [{"id": "system", "name": "System", "desc": "FaberOS and Foundry."}],
           "apps": apps + system}
    os.makedirs(os.path.join(ROOT, "assets/os"), exist_ok=True)
    path = os.path.join(ROOT, "assets/os/apps.json")
    open(path, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    return "assets/os/apps.json"


if __name__ == "__main__":
    print(manifest())
