#!/bin/sh
# usage: interior.sh <renderdir>  -> banded interior difference (top/mid/bottom) of cmp-render vs cmp-ref
S=$HOME/.claude/skills/img2threejs; R=$1
for b in 0:0.33 0.33:0.66 0.66:1; do
  f=${b%%:*}; t=${b##*:}
  python3 $S/forge/stage4_review/interior_difference.py $R/cmp-ref.png $R/cmp-render.png --from $f --to $t --json | python3 -c "import json,sys; d=json.load(sys.stdin); print('$f-$t', round(d['interiorDifference'],4), d['cellsCompared'], d['status'])"
done
