from pathlib import Path
import math

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PHOTO_DIR = ROOT / "assets" / "itinerary-photos"
OUT = Path("/private/tmp/tokyo-itinerary-photo-contact.jpg")


files = sorted(
    f
    for f in PHOTO_DIR.iterdir()
    if f.is_file()
    and f.name[:3].isdigit()
    and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
)

thumb_w, thumb_h = 180, 120
label_h = 28
cols = 6
rows = math.ceil(len(files) / cols)
sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "white")
draw = ImageDraw.Draw(sheet)

for i, file in enumerate(files):
    img = Image.open(file).convert("RGB")
    img.thumbnail((thumb_w, thumb_h))
    x = (i % cols) * thumb_w
    y = (i // cols) * (thumb_h + label_h)
    sheet.paste(img, (x + (thumb_w - img.width) // 2, y))
    draw.text((x + 4, y + thumb_h + 4), file.name[:26], fill=(0, 0, 0))

sheet.save(OUT, quality=90)
print(f"{len(files)} {OUT}")
