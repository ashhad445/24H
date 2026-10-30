#!/usr/bin/env bash
# Build Blender models headless (no Blender app needed): uses the `bpy` pip module.
#   python3 -m venv .bvenv && .bvenv/bin/pip install bpy        (one time, ~400 MB)
#   BPY_PY=.bvenv/bin/python scripts/art-build.sh people desert  (default: every art/*.py except lib/preview)
# Then preview: $BPY_PY art/preview.py public/models/people.glb out.png
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${BPY_PY:-python3}"
export ART_DIR="$PWD/art" ART_OUT="${ART_OUT:-$PWD/public/models}"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in art/*.py; do b=$(basename "$f" .py); [[ $b == lib || $b == preview ]] || names+=("$b"); done
fi
for n in "${names[@]}"; do
  echo "== $n"
  "$PY" -c "import bpy; exec(open('art/$n.py').read())"
done
