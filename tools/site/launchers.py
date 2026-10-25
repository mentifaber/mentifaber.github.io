"""App icons outside the site's own pipeline:
- AutoFaber's everywhere icons (assets/icons/v2/hive-*) and Android launcher, from its emblem (assets/brand/autofaber-logo.jpg,
  the glowing AF on a gold shield in its orbits).
- The launcher icons of the Android apps built here (android/<app>/.../mipmap-*), from each app's rendered 512 px icon.
Run after build.py and raster.js:   python3 tools/site/launchers.py"""
import base64, io, os
from PIL import Image
import logo
from logo import ROOT, crop, sized, tile, safe, medallion, lean, save, G_ART

DPI = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
G = crop(G_ART, 515, 773, 1210)   # the whole emblem
S = crop(G_ART, 515, 728, 880)    # the shield alone, for sizes where the orbits would be noise


def embed_svg(im):   # an SVG that is just this image, so raster.js redraws the same icon
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,'
            + base64.b64encode(buf.getvalue()).decode() + '"/></svg>\n')


def autofaber():
    v2 = "assets/icons/v2/"
    made = [save(lean(tile(G, 512)), v2 + "hive-512.png"), save(tile(G, 192), v2 + "hive-192.png"), save(sized(G, 180), v2 + "hive-180.png"),
            save(tile(S, 48, 0.2), v2 + "hive-48.png"), save(lean(safe(G, 512, 0.84)), v2 + "hive-maskable.png")]
    open(os.path.join(ROOT, v2 + "hive.svg"), "w").write(embed_svg(tile(G, 512)))
    open(os.path.join(ROOT, v2 + "hive-mask.svg"), "w").write(embed_svg(safe(G, 512, 0.84)))
    res = "android/autofaber/app/src/main/res/"
    for d, px in DPI.items(): made.append(save(tile(G if px >= 144 else S, px), res + f"mipmap-{d}/ic_launcher.png"))
    made.append(save(medallion(G, 288), res + "drawable/splash.png"))
    return made


def from_icon(app, icon):
    src = Image.open(os.path.join(ROOT, f"assets/icons/v2/{icon}-512.png")).convert("RGBA")
    res = f"android/{app}/app/src/main/res/"
    made = [save(src.resize((px, px), Image.LANCZOS), res + f"mipmap-{d}/ic_launcher.png") for d, px in DPI.items()]
    if os.path.exists(os.path.join(ROOT, res + "drawable/splash.png")): made.append(save(src.resize((288, 288), Image.LANCZOS), res + "drawable/splash.png"))
    return made


if __name__ == "__main__":
    for p in autofaber() + from_icon("mentiplayer", "mentiplayer") + from_icon("store", "store") + from_icon("eightysixty", "roku"):
        print("made", os.path.relpath(p, ROOT), os.path.getsize(p) // 1024, "KB")
