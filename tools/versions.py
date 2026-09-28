#!/usr/bin/env python3
"""Build assets/versions.json from git history, for the in-app update notices
(assets/js/mf-version.js). Each app's version is 1.<commits to its page>, its
date is the last of those commits, and its notes are the latest commit subjects.
Run after committing a change to an app:  python3 tools/versions.py"""
import json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = {
    "arsenal": ("Mechanic's Arsenal", "mechanics-arsenal.html"),
    "ballast": ("Ballast", "ballast-app.html"),
    "bubble-editor": ("Bubble Editor", "bubble-editor-app.html"),
    "crime-dashboard": ("Crime Intelligence", "crime-dashboard-app.html"),
    "cryptovault": ("CryptoVault", "cryptovault-app.html"),
    "monstrosity": ("The Monstrosity", "monstrosity-log.html"),
    "moon-compatibility": ("Moon Compatibility", "moon-compatibility-app.html"),
    "neural-sim": ("Neural Sim", "neural-sim-v3.html"),
    "sleep-compression": ("Sleep Compression", "sleep-compression-app.html"),
    "vigil": ("Vigil", "vigil-app.html"),
    "muse": ("Muse", "muse-live.html"),
    "weaver": ("Weaver", "weaver-live.html"),
    "flutterbloom": ("Flutterbloom", "flutterbloom.html"),
    "wx": ("Quick Weather", "wx/index.html"),
}

def git(*a):
    return subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True).stdout.strip()

def tidy(subject, name):
    s = re.sub(r"^(%s|Flutterbloom)\s*:\s*" % re.escape(name), "", subject).strip().rstrip(".")
    return s[:1].upper() + s[1:]

out = {}
for key, (name, page) in APPS.items():
    log = [l for l in git("log", "--no-merges", "--format=%cs\t%s", "--", page).splitlines() if l]
    if not log:
        continue
    notes = []
    for line in log:
        s = tidy(line.split("\t", 1)[1], name)
        if s and s not in notes and not s.lower().startswith("merge"):
            notes.append(s)
        if len(notes) == 4:
            break
    out[key] = {"name": name, "version": "1.%d" % len(log), "date": log[0].split("\t")[0], "notes": notes, "page": page}

with open(os.path.join(ROOT, "assets", "versions.json"), "w") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
print("\n".join("%-20s v%-5s %s" % (k, v["version"], v["date"]) for k, v in out.items()))
