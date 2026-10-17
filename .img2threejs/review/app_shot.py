"""Screenshot the real /camp page: app_shot.py <out-prefix> [click x,y ...]"""
import sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]; clicks = [tuple(map(int, c.split(','))) for c in sys.argv[2:]]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    for _ in range(60):
        try: pg.goto('http://localhost:4321/camp', wait_until='networkidle', timeout=15000); break
        except Exception: time.sleep(1)
    pg.wait_for_selector('#camp-summit:not([hidden])', timeout=60000)
    time.sleep(2)
    pg.click('#camp-summit')
    time.sleep(9)
    pg.screenshot(path=f'{out}-camp.png')
    for i, (x, y) in enumerate(clicks):
        pg.mouse.move(x, y); time.sleep(0.6)
        pg.screenshot(path=f'{out}-hover{i}.png')
        pg.mouse.click(x, y); time.sleep(5)
        pg.screenshot(path=f'{out}-click{i}.png')
    print('errors:', errs[:8])
    b.close()
