"""Shrinks the icon PNGs from raster.js with libimagequant (the pngquant algorithm): ~90% smaller, no visible banding.
   pip install imagequant pillow;  python3 tools/site/optimize.py [files…]  (default: assets/icons/v2/*.png)"""
import glob, os, sys
from PIL import Image
import imagequant
files = sys.argv[1:] or glob.glob(os.path.join(os.path.dirname(__file__), "../../assets/icons/v2/*.png"))
t0 = t1 = 0
for f in files:
    s0 = os.path.getsize(f); im = Image.open(f).convert("RGBA")
    q = imagequant.quantize_pil_image(im, dithering_level=1.0, max_colors=256, min_quality=70, max_quality=95)
    q.save(f + ".tmp.png", optimize=True)
    if os.path.getsize(f + ".tmp.png") < s0: os.replace(f + ".tmp.png", f)
    else: os.remove(f + ".tmp.png")
    t0 += s0; t1 += os.path.getsize(f)
print(f"{len(files)} files: {t0 // 1024} KB -> {t1 // 1024} KB")
