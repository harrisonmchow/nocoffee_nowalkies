"""Fit the review camera to the IMG_4842 silhouette (coordinate search on IoU).
Camera = position (x,y,z) + look-at (tx, ty, 0), fixed fov. Model is untouched."""
import io, json, pathlib, sys
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
W = pathlib.Path(__file__).resolve().parents[1]
refm = Image.open(W / 'ref-4842-mask.png').convert('L')
def crop(m, size=(450, 290), margin=0.06):
    x0, y0, x1, y1 = m.getbbox(); w, h = x1 - x0, y1 - y0
    return m.crop((x0 - w*margin, y0 - h*margin, x1 + w*margin, y1 + h*margin)).resize(size)
A = [v > 127 for v in crop(refm).getdata()]
url = (W / 'review/index.html').as_uri()
def iou(pg, c):
    pg.goto(f"{url}?view=ref&light=dusk&w=900&h=640&pos={c[0]},{c[1]},{c[2]}&tgt={c[3]},{c[4]},0&fov={c[5]}")
    pg.wait_for_function('window.__ready === true')
    im = Image.open(io.BytesIO(pg.locator('canvas').screenshot())).convert('RGB')
    m = ImageChops.difference(im, Image.new('RGB', im.size, (128,)*3)).convert('L').point(lambda v: 255 if v > 6 else 0)
    bb = m.getbbox()
    if not bb or bb[0] <= 1 or bb[1] <= 1 or bb[2] >= im.width-1 or bb[3] >= im.height-1: return 0.0
    B = [v > 127 for v in crop(m).getdata()]
    return sum(a and b for a, b in zip(A, B)) / sum(a or b for a, b in zip(A, B))
c = [-0.45, 2.0, 3.3, -0.1, 0.33, 30.0]
steps = [0.3, 0.3, 0.4, 0.2, 0.1, 6.0]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader']); pg = b.new_page(viewport={'width': 900, 'height': 640})
    best = iou(pg, c)
    for rnd in range(4):
        for i in range(6):
            for d in (-1, 1):
                t = c[:]; t[i] += d * steps[i]
                s = iou(pg, t)
                if s > best: best, c = s, t
        steps = [x * 0.5 for x in steps]
        print(rnd, round(best, 4), [round(x, 3) for x in c], flush=True)
    b.close()
json.dump({'camera': {'position': c[:3], 'target': [c[3], c[4], 0], 'fov': c[5]}, 'silhouetteIoU': best}, open(W / 'review/fitted-camera.json', 'w'), indent=1)
