#!/bin/sh
# usage: run.sh <outdir> views...
set -e
cd "$(dirname "$0")/../.."
node_modules/.bin/esbuild .img2threejs/review/entry.ts --bundle --format=iife --outfile=.img2threejs/review/bundle.js --log-level=warning
out=$1; shift
python3 .img2threejs/review/capture.py ".img2threejs/renders/$out" "$@"
