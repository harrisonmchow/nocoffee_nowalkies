"""Export world-space meshes + named-part positions from the harness: export.py <outdir>"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
url = pathlib.Path(__file__).with_name('index.html').resolve().as_uri() + '?view=ref&export=1&w=64&h=64'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader']); pg = b.new_page()
    pg.goto(url); pg.wait_for_function('window.__ready === true')
    d = pg.evaluate('window.__export'); b.close()
json.dump({'meshes': d['meshes']}, open(out / 'meshes.json', 'w'))
json.dump(d['parts'], open(out / 'parts-measured.json', 'w'), indent=1)
print(len(d['meshes']), 'meshes;', len(d['parts']), 'named parts')
