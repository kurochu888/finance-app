#!/usr/bin/env python3
"""產生 app 圖示(加到主畫面 / 安裝成 app 時用)。"""
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
BLUE, INK, TRACK = '#2563eb', '#ffffff', '#a8c7ff'

def draw(size, pad_ratio=0.0):
    """pad_ratio > 0 用於 maskable 圖示,四周留白避免被裁到。"""
    img = Image.new('RGB', (size, size), BLUE)
    d = ImageDraw.Draw(img)
    s = size * (1 - 2 * pad_ratio)
    o = size * pad_ratio
    px = lambda x, y: (o + s * x, o + s * y)
    pts = [px(.13,.73), px(.31,.62), px(.49,.67), px(.67,.40), px(.87,.24)]
    d.line(pts, fill=INK, width=max(2, int(s * .061)), joint='curve')
    r = s * .061
    d.ellipse([pts[-1][0]-r, pts[-1][1]-r, pts[-1][0]+r, pts[-1][1]+r], fill=INK)
    d.line([px(.13,.83), px(.87,.83)], fill=TRACK, width=max(2, int(s * .033)))
    return img

big = draw(1024)
for name, size in [('icon-512.png', 512), ('icon-192.png', 192), ('icon-180.png', 180), ('favicon-32.png', 32)]:
    big.resize((size, size), Image.LANCZOS).save(ROOT / name)
draw(1024, pad_ratio=0.14).resize((512, 512), Image.LANCZOS).save(ROOT / 'icon-maskable-512.png')
print('icons:', ', '.join(p.name for p in sorted(ROOT.glob('icon*.png')) ))
