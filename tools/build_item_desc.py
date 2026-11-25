"""Client item descriptions (Thai, GGT) for the right-click item window of /sim/.

usage: build_item_desc.py <items_all.json from the GGT client> <data dir>
Writes data/itemdesc/<id % 64>.json: { "<item id>": [description lines with the client's ^RRGGBB colour codes] }
for the items in items.json and consumables.json only (64 small files, loaded when an item is right-clicked).
"""
import json, os, sys

src, data = sys.argv[1:3]
allitems = json.load(open(src, encoding='utf-8'))
ids = set(json.load(open(os.path.join(data, 'items.json'), encoding='utf-8'))) | \
      set(json.load(open(os.path.join(data, 'consumables.json'), encoding='utf-8')))
out = {}
for i in ids:
    d = (allitems.get(i) or {}).get('identifiedDescriptionName')
    if d:
        lines = [d[k] for k in sorted(d, key=lambda x: int(x))] if isinstance(d, dict) else list(d)
        out[i] = lines
d = os.path.join(data, 'itemdesc')
os.makedirs(d, exist_ok=True)
buckets = {}
for i, lines in out.items():
    buckets.setdefault(int(i) % 64, {})[i] = lines
total = 0
for b in range(64):
    p = os.path.join(d, f'{b}.json')
    json.dump(buckets.get(b, {}), open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += os.path.getsize(p)
print('items', len(out), 'bytes', total)
