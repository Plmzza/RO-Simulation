"""Item and skill icons for /sim/: converts the client's BMP icons (magenta = transparent) to PNG.

usage: build_icons.py <folder with the client's item icons (*.bmp)> <RO-Simulation root>
Writes sim/icons/i/<item id>.png (by the item's client resource name `res` in data/items.json / consumables.json)
and sim/icons/s/<SKILL_NAME>.png (skill icons are in the same client folder, named like sm_bash.bmp).
Existing files are skipped, so the script can be run again after the data changes.
"""
import json, os, sys
from PIL import Image

src_dir, root = sys.argv[1:3]
out = os.path.join(root, 'sim', 'icons')
os.makedirs(os.path.join(out, 'i'), exist_ok=True)
os.makedirs(os.path.join(out, 's'), exist_ok=True)
files = {f.lower(): f for f in os.listdir(src_dir)}
jobs = []
for name in ('items.json', 'consumables.json'):
    for iid, it in json.load(open(os.path.join(root, 'data', name), encoding='utf-8')).items():
        f = (it.get('res') or '').lower() + '.bmp'
        if it.get('res') and f in files:
            jobs.append((files[f], f'i/{iid}.png'))
for n in json.load(open(os.path.join(root, 'data', 'skillinfo.json'), encoding='utf-8')):
    if (n.lower() + '.bmp') in files:
        jobs.append((files[n.lower() + '.bmp'], f's/{n}.png'))
made = 0
for src, dst in jobs:
    p = os.path.join(out, dst)
    if os.path.exists(p):
        continue
    im = Image.open(os.path.join(src_dir, src)).convert('RGBA')
    im.putdata([(0, 0, 0, 0) if r > 240 and g < 16 and b > 240 else (r, g, b, a) for r, g, b, a in im.getdata()])
    im.save(p, optimize=True)
    made += 1
print('icons', len(jobs), 'new', made)
