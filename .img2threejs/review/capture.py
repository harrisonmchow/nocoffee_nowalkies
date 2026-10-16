"""Capture review renders: python3 capture.py <outdir> view[:light] ... [--q extra=query]"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
extra = ''
args = [a for a in sys.argv[2:] if not a.startswith('--q=') or not (extra := a[4:])]
page_url = pathlib.Path(__file__).with_name('index.html').resolve().as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1260, 'height': 896})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    for spec in args:
        view, _, light = spec.partition(':')
        pg.goto(f'{page_url}?view={view}&light={light or "dusk"}{"&" + extra if extra else ""}')
        pg.wait_for_function('window.__ready === true', timeout=30000)
        name = f'{view}-{light or "dusk"}{"-flat" if "flat=1" in extra else ""}.png'
        pg.locator('canvas').screenshot(path=str(out / name))
        rep = pg.evaluate('window.__report')
        print(name, json.dumps(rep))
    if errs: print('PAGE ERRORS', errs)
    b.close()
