"""Draws a simple on-brand Grimoire app icon (1024x1024 PNG with transparency)."""
import math
from PIL import Image, ImageDraw

SIZE = 1024
BG = (13, 11, 15, 255)        # --bg-primary
PURPLE = (155, 127, 196, 255) # --purple-main
PURPLE_SOFT = (200, 168, 240, 255)
DEEP = (58, 32, 96, 255)      # --purple-deep

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded dark tile
margin = 96
radius = 150
d.rounded_rectangle([margin, margin, SIZE - margin, SIZE - margin],
                    radius=radius, fill=BG, outline=DEEP, width=10)

cx = cy = SIZE / 2


def hexagon(cx, cy, r, rotation=math.pi / 2):
    return [
        (cx + r * math.cos(rotation + i * math.pi / 3),
         cy + r * math.sin(rotation + i * math.pi / 3))
        for i in range(6)
    ]


# outer + inner hexagon (the app's hexagon motif)
d.polygon(hexagon(cx, cy, 300), outline=PURPLE, width=20)
d.polygon(hexagon(cx, cy, 210), outline=DEEP, width=12)

# central four-point sparkle (the ✦ used throughout the UI)
def sparkle(cx, cy, R, r):
    pts = []
    for i in range(8):
        ang = i * math.pi / 4 - math.pi / 2
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


d.polygon(sparkle(cx, cy, 150, 46), fill=PURPLE_SOFT)

img.save("app-icon.png")
print("Wrote app-icon.png")
