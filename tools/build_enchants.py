"""Official enchant slots per item (db/re/item_enchant.yml + db/import) -> data/enchants.json

usage: build_enchants.py <server root (with db/)> <data dir>
  { "defs": { "<enchant id>": { "minRefine": n, "minGrade": n, "randomOptions": bool, "order": [3, 2, 1, 0],
                               "slots": { "3": [item ids that can go into slot 3 (normal, perfect and upgraded enchants)] } } },
    "items": { "<target item id>": "<enchant id>" } }
Slot numbers are the item's card slots 0-3 (enchants are put into the free card slots from the last one).
"""
import glob, json, os, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, data = sys.argv[1:3]
db = os.path.join(root, 'db')
body = lambda p: ((yaml.load(open(p, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []) if os.path.exists(p) else []

aegis = {}
for f in glob.glob(os.path.join(db, 're', 'item_db*.yml')) + glob.glob(os.path.join(db, 'import', 'item_db*.yml')):
    for it in body(f):
        aegis[it['AegisName']] = it['Id']
# GGT-only items added by build_ggt_items.py have no aegis name in the server: match them by name in items.json
items_json = json.load(open(os.path.join(data, 'items.json'), encoding='utf-8'))

defs, items = {}, {}
for f in ('re/item_enchant.yml', 'import/item_enchant.yml'):
    for e in body(os.path.join(db, f)):
        d = defs.setdefault(str(e['Id']), {'minRefine': 0, 'minGrade': 0, 'randomOptions': True, 'order': [], 'slots': {}})
        d['minRefine'] = e.get('MinimumRefine', d['minRefine'])
        d['minGrade'] = e.get('MinimumEnchantgrade', d['minGrade'])
        d['randomOptions'] = e.get('AllowRandomOptions', d['randomOptions'])
        if e.get('Order'):
            d['order'] = [o['Slot'] for o in e['Order']]
        for t, on in (e.get('TargetItems') or {}).items():
            if on and t in aegis:
                items[str(aegis[t])] = str(e['Id'])
        for s in e.get('Slots') or []:
            lst = d['slots'].setdefault(str(s['Slot']), [])
            names = [x['Item'] for g in (s.get('Enchants') or []) for x in (g.get('Items') or [])]
            names += [x['Item'] for x in (s.get('PerfectEnchants') or [])]
            names += [x['Upgrade'] for x in (s.get('Upgrades') or [])]
            for n in names:
                iid = aegis.get(n)
                if iid is not None and iid not in lst:
                    lst.append(iid)
for d in defs.values():
    if not d['order']:
        d['order'] = sorted((int(k) for k in d['slots']), reverse=True)
p = os.path.join(data, 'enchants.json')
json.dump({'defs': defs, 'items': items}, open(p, 'w', encoding='utf-8'), separators=(',', ':'))
print('enchant tables', len(defs), 'target items', len(items), 'bytes', os.path.getsize(p))
