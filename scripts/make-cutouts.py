# ============================================================
#  Step 2 of 2: turn public/birds/{id}.jpg (white-background
#  refs from scripts/gen-bird-cutouts.js) into transparent,
#  content-trimmed PNGs at public/birds/cutouts/{id}.png.
#
#  These PNGs are RUNTIME assets: the Bird ID card composite and
#  the "you + your bird" download both layer them onto headshots.
#
#  Usage:
#    pip install rembg[cpu] pillow
#    python3 scripts/make-cutouts.py            # all (skips existing)
#    python3 scripts/make-cutouts.py --force    # redo all
#
#  Output: trimmed to content + 2% margin, max 768px on the long
#  side, optimized PNG (~100-250 KB each).
# ============================================================
import os, sys, io
from pathlib import Path
from PIL import Image
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "birds"
DST = SRC / "cutouts"
DST.mkdir(parents=True, exist_ok=True)
FORCE = "--force" in sys.argv
MAX_SIDE = 768

session = new_session("u2net")

jpgs = sorted(SRC.glob("*.jpg"))
print(f"{len(jpgs)} source refs → {DST}")
ok = fail = skip = 0
for src in jpgs:
    out = DST / (src.stem + ".png")
    if out.exists() and not FORCE:
        skip += 1
        continue
    try:
        img = Image.open(src).convert("RGBA")
        cut = remove(img, session=session)
        # trim to content + small margin so composite scaling is predictable
        bbox = cut.getbbox()
        if bbox:
            m = round(max(cut.size) * 0.02)
            bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m),
                    min(cut.width, bbox[2] + m), min(cut.height, bbox[3] + m))
            cut = cut.crop(bbox)
        if max(cut.size) > MAX_SIDE:
            r = MAX_SIDE / max(cut.size)
            cut = cut.resize((round(cut.width * r), round(cut.height * r)), Image.LANCZOS)
        cut.save(out, "PNG", optimize=True)
        ok += 1
        print(f"✓ {src.stem}  {cut.size[0]}x{cut.size[1]}  {out.stat().st_size // 1024} KB")
    except Exception as e:
        fail += 1
        print(f"✗ {src.stem}: {e}")
print(f"\nDone. {ok} ok · {skip} skipped · {fail} failed.")
