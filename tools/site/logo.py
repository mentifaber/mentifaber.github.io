"""The Mentifaber logo, everywhere it appears, from one piece of art: assets/brand/mentifaber-logo.jpg (the M of lit
nodes on a black shield, wrapped in gold orbits).

Large sizes show the whole logo; small ones (the favicon, the header mark, 48 px icons) show the shield alone, because the
orbits turn to mush below about 64 px.   python3 tools/site/logo.py   (then python3 tools/site/build.py)"""
import base64, io, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets/brand/mentifaber-logo.jpg")
BRAND, ICONS = os.path.join(ROOT, "assets/brand"), os.path.join(ROOT, "assets/icons/v2")
BLACK = (0, 0, 0)

art = Image.open(SRC).convert("RGB")


def square(cx, cy, side):
    """A black square of the given side around (cx, cy) in the art: whatever falls outside the art stays black."""
    out = Image.new("RGB", (side, side), BLACK)
    out.paste(art, (round(side / 2 - cx), round(side / 2 - cy)))
    return out


FULL = square(422, 624, 1010)      # the whole logo: orbits from x 30 to 815, y 148 to 1100
SHIELD = square(421, 586, 740)      # the shield and the M, a little orbit at its edges


def sized(im, px):
    return im.resize((px, px), Image.LANCZOS)


def tile(im, px, radius=0.225):
    """Rounded tile (transparent corners), like the app icons it sits beside."""
    t = sized(im, px).convert("RGBA")
    m = Image.new("L", (px * 4, px * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, px * 4 - 1, px * 4 - 1], radius=round(px * 4 * radius), fill=255)
    t.putalpha(m.resize((px, px), Image.LANCZOS))
    return t


def safe(im, px, frac):
    """Full-bleed black square with the logo inside the maskable safe zone."""
    out = Image.new("RGB", (px, px), BLACK)
    inner = sized(im, round(px * frac))
    out.paste(inner, ((px - inner.width) // 2, (px - inner.height) // 2))
    return out


def medallion(im, px):
    """The whole logo with its black fading out at the rim, so it sits on a light page or a dark one."""
    t = sized(im, px).convert("RGBA")
    m = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(m)
    steps = 40
    for i in range(steps):  # radial fade from 46% to 50% of the side
        r = px * (0.5 - 0.04 * i / steps)
        d.ellipse([px / 2 - r, px / 2 - r, px / 2 + r, px / 2 + r], fill=round(255 * (i + 1) / steps))
    t.putalpha(m.filter(ImageFilter.GaussianBlur(px / 200)))
    return t


def lean(im):
    return im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG) if im.mode == "RGBA" else im.quantize(256, dither=Image.Dither.FLOYDSTEINBERG)


def save(im, path, **kw):
    path = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True, **kw)
    return path


def og():
    """The card shown when a link to the site is shared: the logo, the name in Mentifaber Display, the line."""
    W, H = 1200, 630
    out = Image.new("RGB", (W, H), BLACK)
    logo = sized(FULL, 590)
    out.paste(logo, (34, 20))
    d = ImageDraw.Draw(out)
    disp = os.path.join(ROOT, "assets/fonts/MentifaberDisplay-Regular.ttf")
    big = ImageFont.truetype(disp, 76)
    small = ImageFont.truetype(disp, 26)
    # the name, in gold: a vertical gradient through the letters
    word, x, y = "MENTIFABER", 640, 236
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text((x, y), word, font=big, fill=255)
    grad = Image.new("RGB", (W, H))
    gd = ImageDraw.Draw(grad)
    for yy in range(H):
        f = min(1, max(0, (yy - y) / 90))
        gd.line([(0, yy), (W, yy)], fill=(round(255 - 15 * f), round(226 - 70 * f), round(154 - 112 * f)))
    out.paste(grad, (0, 0), mask)
    d.text((644, 340), "BUILDER OF MINDS", font=small, fill=(214, 168, 92))
    d.text((644, 378), "AND THE SYSTEMS THAT HOLD THEM", font=small, fill=(150, 120, 74))
    return out


def main():
    made = []
    # the app icons (manifest, launcher, home screens)
    made.append(save(lean(tile(FULL, 512)), "assets/icons/v2/mentifaber-512.png"))
    made.append(save(tile(FULL, 192), "assets/icons/v2/mentifaber-192.png"))
    made.append(save(sized(FULL, 180), "assets/icons/v2/mentifaber-180.png"))          # iOS rounds it itself
    made.append(save(lean(safe(FULL, 512, 0.84)), "assets/icons/v2/mentifaber-maskable.png"))
    made.append(save(tile(SHIELD, 48, 0.2), "assets/icons/v2/mentifaber-48.png"))
    # the favicon and the header mark
    made.append(save(lean(tile(SHIELD, 192, 0.2)), "assets/favicon.png"))
    made.append(save(tile(SHIELD, 96, 0.2), "assets/brand/mentifaber-mark-96.png"))
    buf = io.BytesIO(); tile(SHIELD, 64, 0.2).save(buf, "PNG", optimize=True)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" role="img" aria-label="Mentifaber">'
           '<image width="64" height="64" href="data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode() + '"/></svg>\n')
    open(os.path.join(BRAND, "mark.svg"), "w").write(svg); made.append(os.path.join(BRAND, "mark.svg"))
    # the home page's hero and the share card
    made.append(save(medallion(FULL, 640), "assets/brand/mentifaber-logo-640.webp", quality=88, method=6))
    made.append(save(og(), "assets/brand/og.jpg", quality=88, progressive=True))
    for p in made:
        print("made", os.path.relpath(p, ROOT), os.path.getsize(p) // 1024, "KB")



# ── Genesis (the app once called Genesis): the gold G in its ring of crystals, and the ring alone for the voice link ──
G_ART = Image.open(os.path.join(ROOT, "assets/brand/genesis-logo.jpg")).convert("RGB")
RING_ART = Image.open(os.path.join(ROOT, "assets/brand/genesis-ring.jpg")).convert("RGB")


def crop(src, cx, cy, side):
    out = Image.new("RGB", (side, side), BLACK)
    out.paste(src, (round(side / 2 - cx), round(side / 2 - cy)))
    return out


def ring_png(px):
    """The ring with its black outside the rim and its hollow centre cut away, so the voice link can light the hollow itself."""
    im = sized(crop(RING_ART, 391.5, 565, 680), px).convert("RGBA")
    m = Image.new("L", (px * 2, px * 2), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([px * 2 * .008, px * 2 * .008, px * 2 * .992, px * 2 * .992], fill=255)
    h = px * 2 * .175
    d.ellipse([px - h, px * 1.02 - h, px + h, px * 1.02 + h], fill=0)
    im.putalpha(m.resize((px, px), Image.LANCZOS).filter(ImageFilter.GaussianBlur(px / 160)))
    return im


def genesis():
    G = crop(G_ART, 416, 605, 760)
    made = [save(lean(tile(G, 512)), "assets/icons/hive-genesis-512.png"),
            save(tile(G, 192), "assets/icons/hive-genesis-192.png"),
            save(tile(G, 48, 0.2), "assets/icons/hive-genesis-48.png"),
            save(sized(G, 180), "assets/icons/hive-genesis-apple.png"),
            save(lean(safe(G, 512, 0.84)), "assets/icons/hive-genesis-maskable-512.png"),
            save(safe(G, 192, 0.84), "assets/icons/hive-genesis-maskable-192.png"),
            save(medallion(G, 96), "assets/hive/genesis-mark.png"),
            save(medallion(G, 420), "assets/hive/genesis-logo-420.webp", quality=86, method=6),
            save(ring_png(720), "assets/hive/genesis-ring.webp", quality=86, method=6)]
    for p in made:
        print("made", os.path.relpath(p, ROOT), os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
    genesis()
