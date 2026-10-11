"""Read the content out of a current landing page (the shared mf.css template) into plain data."""
import re, sys, json
from bs4 import BeautifulSoup

def inner(el):  # keep light inline markup (b, em, a, code), drop the rest
    if el is None: return ""
    html = el.decode_contents().strip()
    html = re.sub(r"\s+", " ", html)
    return html

def parse(path):
    s = BeautifulSoup(open(path, encoding="utf-8").read(), "html.parser")
    t = lambda sel: s.select_one(sel)
    d = {"title": (s.title.string or "").strip() if s.title else ""}
    d["description"] = (s.find("meta", attrs={"name": "description"}) or {}).get("content", "")
    d["label"] = inner(t("p.label"))
    h1 = t("h1.name"); d["name"] = h1.get_text("", strip=True) if h1 else ""
    d["tagline"] = inner(t("p.tagline"))
    d["status"] = t(".status-pill").get_text(" ", strip=True) if t(".status-pill") else ""
    lb = t("a.launch-btn")
    if lb: d["launch"] = {"href": lb.get("href"), "eyebrow": lb.select_one(".lb-eyebrow").get_text(strip=True) if lb.select_one(".lb-eyebrow") else "", "title": lb.select_one(".lb-title").get_text(strip=True) if lb.select_one(".lb-title") else "", "sub": lb.select_one(".lb-sub").get_text(strip=True) if lb.select_one(".lb-sub") else ""}
    d["caps"] = [x.get_text(strip=True) for x in s.select(".launch-cap span")]
    img = s.select_one(".mf-shot img"); d["shot"] = img.get("src") if img else None
    fh = t(".frag-head"); d["head"] = {"label": inner(fh.select_one(".frag-label")) if fh else "", "title": inner(fh.select_one(".frag-title")) if fh else ""}
    d["frags"] = []
    for f in s.select(".frag"):
        tag = f.select_one(".tag"); tag_t = tag.get_text(strip=True) if tag else ""
        if tag: tag.extract()
        stack = [x.get_text(strip=True) for x in f.select(".stack-row span")]
        for x in f.select(".stack-row"): x.extract()
        items = [inner(li) for li in f.select("li")]
        paras = [inner(p) for p in f.find_all("p", recursive=True)]
        d["frags"].append({"tag": tag_t, "paras": paras, "items": items, "stack": stack})
    ft = t("footer.mf-foot p"); d["closing"] = inner(ft)
    d["sections"] = len(s.select("section"))
    return d

if __name__ == "__main__":
    for p in sys.argv[1:]:
        d = parse(p)
        print(p, "|", d["name"], "|", d["label"][:40], "| launch:", (d.get("launch") or {}).get("href"), "| frags:", [f["tag"] for f in d["frags"]], "| shot:", d["shot"], "| sections:", d["sections"])
