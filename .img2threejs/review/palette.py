"""Mean colour of matched regions (fractions of the aligned crops): palette.py <renderdir>"""
import sys, json
from PIL import Image
R = sys.argv[1]
regions = {'door-centre': (0.45, 0.55, 0.6, 0.75), 'door-upper': (0.42, 0.38, 0.58, 0.48), 'roof': (0.4, 0.12, 0.6, 0.18),
           'left-end': (0.06, 0.45, 0.14, 0.6), 'right-shoulder': (0.7, 0.25, 0.8, 0.35)}
def mean(im, b):
    w, h = im.size; c = im.crop((int(b[0]*w), int(b[1]*h), int(b[2]*w), int(b[3]*h))); px = list(c.getdata()); n = len(px)
    return [round(sum(p[i] for p in px) / n) for i in range(3)]
a = Image.open(f'{R}/cmp-ref.png').convert('RGB'); b = Image.open(f'{R}/cmp-render.png').convert('RGB')
out = {k: {'ref': mean(a, v), 'render': mean(b, v)} for k, v in regions.items()}
for k, v in out.items(): print(f"{k:15s} ref {v['ref']}  render {v['render']}")
json.dump(out, open(f'{R}/palette.json', 'w'), indent=1)
