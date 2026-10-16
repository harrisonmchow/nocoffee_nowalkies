"""Crop reference + render to their silhouettes at the same margin and size, report IoU,
and build the side-by-side sheet with the pipeline's make_comparison_sheet.py.
usage: compare.py <render.png> <outprefix>"""
import json, subprocess, sys, pathlib
from PIL import Image, ImageChops
W = pathlib.Path(__file__).resolve().parents[1]
S = pathlib.Path.home() / '.claude/skills/img2threejs'
render, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ref = Image.open(W / 'ref-4842-masked.png').convert('RGB'); refm = Image.open(W / 'ref-4842-mask.png').convert('L')
ren = Image.open(render).convert('RGB')
bg = Image.new('RGB', ren.size, (128, 128, 128))
renm = ImageChops.difference(ren, bg).convert('L').point(lambda v: 255 if v > 6 else 0)
def crop(im, m, size=(900, 580), margin=0.06):
    x0, y0, x1, y1 = m.getbbox(); w, h = x1 - x0, y1 - y0
    box = (x0 - w * margin, y0 - h * margin, x1 + w * margin, y1 + h * margin)
    return im.crop(box).resize(size), m.crop(box).resize(size), (w / h)
a, am, ar = crop(ref, refm); b, bm, br = crop(ren, renm)
A = [v > 127 for v in am.getdata()]; B = [v > 127 for v in bm.getdata()]
inter = sum(x and y for x, y in zip(A, B)); uni = sum(x or y for x, y in zip(A, B))
a.save(f'{out}-ref.png'); b.save(f'{out}-render.png')
Image.merge('RGB', (am, bm, Image.new('L', am.size, 0))).save(f'{out}-silhouette-overlay.png')
res = subprocess.run([sys.executable, str(S / 'forge/stage4_review/make_comparison_sheet.py'), '--reference', f'{out}-ref.png',
                      '--render', f'{out}-render.png', '--out', f'{out}-cmp.png', '--json'], capture_output=True, text=True)
print(json.dumps({'silhouetteIoU': round(inter / uni, 4), 'aspectRef': round(ar, 3), 'aspectRender': round(br, 3),
                  'sheet': f'{out}-cmp.png', 'sheetTool': res.returncode, 'sheetErr': res.stderr[-300:]}))
