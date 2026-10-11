"""Every app on mentifaber.org, in one place: name, hue, glyph, category, status, where its page and its app live.
The page generator (build.py) reads this; the home page it builds carries the list in the form Hive's site index parses."""
import json, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def _icons():  # the line glyphs from assets/icons.js, keyed by app id
    s = open(os.path.join(ROOT, "assets/icons.js"), encoding="utf-8").read()
    return {k: json.loads('"' + v + '"') for k, v in re.findall(r'"([a-z-]+)": "((?:[^"\\]|\\.)*)"', s)}
GLYPH = _icons()
GLYPH.update({  # glyphs for apps that never had one
  "hive": '<path d="M12 2.8l7.8 4.5v9.4L12 21.2l-7.8-4.5V7.3z"/><path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8z"/>',
  "barycenter": '<circle cx="12" cy="12" r="1.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)"/><circle cx="19.1" cy="8.3" r="1.9"/><circle cx="4.9" cy="15.7" r="1.9"/>',
  "nullspace": '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3.4v3M12 17.6v3M3.4 12h3M17.6 12h3"/>',
  "pilotfish": '<path d="M3 12c3.2-4.4 9-5.6 13.4-2.4L21 6.5v11l-4.6-3.1C12 17.6 6.2 16.4 3 12z"/><circle cx="7.6" cy="11.4" r="1" fill="currentColor"/>',
  "thoughtform": '<circle cx="12" cy="12" r="8.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  "angels": '<circle cx="12" cy="12" r="2.6"/><path d="M12 9.4V4M9.6 12C6 10 3.6 7 3 4c3.8.4 6.6 2.4 8 5M14.4 12c3.6-2 6-5 6.6-8-3.8.4-6.6 2.4-8 5"/><path d="M8.5 17.5c1.2 1.8 5.8 1.8 7 0"/>',
  "mentifaber": '<path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><path d="M8 15.5V9l4 4 4-4v6.5"/>',
})

def _hues():
    s = open(os.path.join(ROOT, "assets/mf.js"), encoding="utf-8").read()
    d = json.loads(re.search(r"const MF_SYS = (\{.*?\});", s, re.S).group(1))
    return {k: v[1] for k, v in d.items()}
HUE = _hues(); HUE.update({"hive": 42, "barycenter": 292, "nullspace": 268, "pilotfish": 190, "tether": 18, "thoughtform": 340, "sideways": 200, "rootcause": 4, "graveyard": 232, "angels": 48, "orbit": 205, "mentifaber": 34})

CATS = [  # display order on the home page
  ("signals", "Signals & Comms", "Messengers, radios and things that talk without the usual pipes."),
  ("ai", "AI & Minds", "Swarms, agents, voices and minds that run on their own."),
  ("tools", "Tools", "Everyday instruments: money, sleep, documents, encryption."),
  ("world", "Sky & World", "Live atlases of the planet, the sky and everything in between."),
  ("play", "Play", "Games: some public, some made as gifts."),
  ("craft", "Craft", "The shop, the camera and the music."),
]
CAT_OF = {"Tools": "tools", "Sky & World": "world", "AI & Minds": "ai", "Signals": "signals", "Play": "play", "Craft": "craft"}

def site():  # the project list, in home-page order (tools/site/site.json is the one place to add or retire a project)
    return json.load(open(os.path.join(ROOT, "tools/site/site.json"), encoding="utf-8"))

# where each app's runnable part lives (embedded at the bottom of its page, and the installed app's start page)
APP_URL = {
  "ballast": "ballast-app.html", "vigil": "vigil-app.html", "arsenal": "arsenal-app.html", "moon-compatibility": "moon-compatibility-app.html",
  "bubble-editor": "bubble-editor-app.html", "sleep-compression": "sleep-compression-app.html", "cryptovault": "cryptovault-app.html",
  "crime-dashboard": "crime-dashboard-app.html", "muse": "muse-live.html", "weaver": "weaver-live.html",
  "barycenter": "barycenter-app.html", "nullspace": "nullspace-app.html", "pilotfish": "pilotfish-app.html", "meshnet": "meshnet-app.html", "novarac": "novarac-app.html",
  "tether": "tether-app.html", "thoughtform": "thoughtform-app.html", "graveyard": "graveyard-app.html", "rootcause": "rootcause-app.html", "sideways": "sideways-app.html", "watchyourgrass": "watchyourgrass-app.html",
}
def _id(href):
    h = href.split("#")[0].split("?")[0].rstrip("/")
    return {"#": "orbit", "": "orbit", "hive": "hive"}.get(h, h.replace(".html", ""))

def apps():
    out = []
    for j in site():
        i = _id(j["href"])
        out.append({"id": i, "name": j["name"], "href": j["href"] if j["href"] != "#" else None, "status": j["status"], "cat": CAT_OF.get(j.get("cat"), "tools"),
                    "desc": j.get("desc", ""), "added": j.get("added"), "hue": HUE.get(i, 38), "glyph": GLYPH.get(i, GLYPH["mentifaber"]), "app": APP_URL.get(i)})
    return out

if __name__ == "__main__":
    for a in apps(): print(f'{a["id"]:20} {a["cat"]:8} {a["status"]:8} hue={a["hue"]:<4} app={a["app"]} glyph={"y" if a["glyph"] else "n"}')
