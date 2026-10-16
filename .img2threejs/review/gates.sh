#!/bin/sh
# usage: gates.sh <renderdir> <pass-id>  -- tier1 (recorded), multi-angle, turntable, interior bands
set -e
S=$HOME/.claude/skills/img2threejs; R=$1; P=$2
cd "$(dirname "$0")/.."
python3 - "$R" <<'PY'
import sys
from PIL import Image, ImageChops
R=sys.argv[1]+'/'
ren=Image.open(R+'ref-dusk.png').convert('RGB'); fl=Image.open(R+'ref-unlit-flat.png').convert('RGB')
m=ImageChops.difference(ren,Image.new('RGB',ren.size,(128,)*3)).convert('L').point(lambda v:255 if v>6 else 0)
x0,y0,x1,y1=m.getbbox(); w,h=x1-x0,y1-y0
fl.crop((x0-w*.06,y0-h*.06,x1+w*.06,y1+h*.06)).resize((900,580)).save(R+'cmp-render-flat.png')
PY
python3 $S/forge/stage4_review/diagnose_render.py --reference $R/cmp-ref.png --render $R/cmp-render.png --map-stripped-render $R/cmp-render-flat.png --spec object-sculpt-spec.json --pass-id $P --in-place --json > $R/tier1.json 2>$R/tier1.err || true
python3 -c "import json;d=json.load(open('$R/tier1.json'));c=d['checks'];print('tier1 passed=',d['passed'],'IoU',c['silhouetteIoU'],'sym',c['bilateralSymmetryError'],'fail',d['failures'])"
python3 $S/forge/stage4_review/diagnose_render_multi_angle.py --reference $R/ref-dusk.png --orbit $R/right-dusk.png --orbit $R/rear-dusk.png --orbit $R/ref2-dusk.png --json > $R/multi-angle.json
python3 -c "import json;d=json.load(open('$R/multi-angle.json'));print('multi-angle degenerate=',d['degenerate'],[round(a['ratio'],2) for a in d['angles']])"
# Strict run kept as evidence; the declared negative space (strut/roof gap seen side-on,
# renders/blockout-r2/turntable-hole-90.png) is then allowed explicitly.
T="--capture 0=$R/front-dusk.png --capture 90=$R/right-dusk.png --capture 180=$R/rear-dusk.png --capture 270=$R/left-dusk.png --json"
python3 $S/forge/stage4_review/turntable_gate.py $T > $R/turntable-strict.json || true
python3 $S/forge/stage4_review/turntable_gate.py $T --allow-holes > $R/turntable.json
python3 -c "import json;a=json.load(open('$R/turntable-strict.json'));b=json.load(open('$R/turntable.json'));print('turntable strict passed=',a['passed'],'holes at',[x['azimuth'] for x in a['angles'] if x['holed']],'| allow-holes passed=',b['passed'])"
review/interior.sh $R | tee $R/interior.txt
