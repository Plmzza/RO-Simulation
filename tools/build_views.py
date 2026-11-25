"""Sprite view ids for headgears and garments -> data/views.json (used to draw the character in /sim/).

usage: build_views.py <server root (with db/)> <data dir> <client items_all.json>
  { "<item id>": <view id> }  view from the server item_db (View), else the client's ClassNum.
The view ids are the ones the costume renderer (costume/resolver.json) knows.
"""
import glob, json, os, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, data, client_path = sys.argv[1:4]
items = json.load(open(os.path.join(data, 'items.json'), encoding='utf-8'))
client = json.load(open(client_path, encoding='utf-8'))
view = {}
for f in glob.glob(os.path.join(root, 'db', 're', 'item_db_equip.yml')) + glob.glob(os.path.join(root, 'db', 'import', 'item_db*.yml')):
    for it in (yaml.load(open(f, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []:
        if it.get('View'):
            view[str(it['Id'])] = it['View']
out = {}
for iid, it in items.items():
    loc = it.get('loc') or []
    if not any('Head' in l or 'Garment' in l for l in loc):
        continue
    v = view.get(iid) or (client.get(iid) or {}).get('ClassNum') or 0
    if v:
        out[iid] = v
p = os.path.join(data, 'views.json')
json.dump(out, open(p, 'w', encoding='utf-8'), separators=(',', ':'))
print('views', len(out), 'bytes', os.path.getsize(p))
