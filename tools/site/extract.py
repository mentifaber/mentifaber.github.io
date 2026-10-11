"""One-time: pull a current landing page's words into tools/site/content/<id>.json, where they can be edited.
build.py renders pages from those files, so it never re-reads its own output."""
import json, re, sys, os
from bs4 import BeautifulSoup
from registry import ROOT

def inner(el):
    return re.sub(r"\s+", " ", el.decode_contents()).strip() if el is not None else ""

def extract(page):
    s = BeautifulSoup(open(os.path.join(ROOT, page), encoding="utf-8").read(), "html.parser")
    one = s.select_one
    h1 = one("h1.name")
    c = {"kicker": one("p.label").get_text(" ", strip=True) if one("p.label") else "", "nameHtml": inner(h1), "tagline": inner(one("p.tagline")),
         "caps": [x.get_text(strip=True) for x in s.select(".launch-cap span")], "launchSub": one(".lb-sub").get_text(strip=True) if one(".lb-sub") else ""}
    fh = one(".frag-head")
    c["story"] = {"label": fh.select_one(".frag-label").get_text(" ", strip=True) if fh else "why this exists", "title": inner(fh.select_one(".frag-title")) if fh else ""}
    c["cards"], c["features"] = [], []
    for f in s.select(".frag"):
        tag = f.select_one(".tag"); t = tag.get_text(" ", strip=True) if tag else ""
        if tag: tag.extract()
        stack = [x.get_text(strip=True) for x in f.select(".stack-row span")]
        for x in f.select(".stack-row"): x.extract()
        items = f.select("li")
        if t.lower() in ("what it does", "how it works", "the plan") and items and not c["features"]:
            c["featuresLabel"] = t
            for li in items:
                b = li.find(["b", "strong"])
                if b: title = b.get_text(" ", strip=True); b.extract(); d = re.sub(r"^\s*[—–:-]\s*", "", inner(li))
                else: title, d = "", inner(li)
                c["features"].append({"t": title, "d": d})
            rest = [inner(p) for p in f.find_all("p")]
            if rest: c["featuresNote"] = " ".join(rest)
            continue
        body = "".join(str(x) for x in f.contents).strip()
        card = {"n": t, "html": re.sub(r"\s+", " ", body)}
        if stack: card["stack"] = stack
        if t.lower() == "honest scope": c["scope"] = card["html"]
        elif t.lower() in ("the problem", "the idea", "what it is", "who this is for") and "lede" not in c: c["lede"] = card["html"]; c["ledeLabel"] = t
        else: c["cards"].append(card)
    ft = one("footer.mf-foot p"); c["closing"] = inner(ft)
    return c

if __name__ == "__main__":
    for spec in sys.argv[1:]:
        i, page = spec.split("=") if "=" in spec else (spec, spec + ".html")
        c = extract(page)
        json.dump(c, open(os.path.join(ROOT, "tools/site/content", i + ".json"), "w"), indent=1, ensure_ascii=False)
        print(i, "features", len(c["features"]), "cards", [x["n"] for x in c["cards"]], "lede" in c, "scope" in c)
