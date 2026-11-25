"""Random options ("ออฟ") the server can put on each item -> data/randomopt.json

usage: build_randomopt.py <server root (with db/)> <data dir>

Option definitions: db/re/item_randomopt_db.yml (+ db/import). Groups: db/re/item_randomopt_group.yml (+ db/import).
Which item gets which group is not in item_db: it comes from where the item is obtained, so every server db that
can attach a RandomOptionGroup to an item is scanned (mob drops, map drops, item groups / boxes, item packages,
Laphine upgrade, item reform). Output:
  { "options": { "VAR_ATKPERCENT": "bonus bAtkRate,getrandomoptinfo(ROA_VALUE);", ... },
    "groups":  { "AS_WEAPON_3": { "slots": [[{o, min, max}], ...], "maxRandom": n, "random": [{o, min, max}] } },
    "items":   { "<item id>": ["AS_WEAPON_3", ...] } }
"""
import glob, json, os, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, data = sys.argv[1:3]
db = os.path.join(root, 'db')

def body(path):
    try:
        return (yaml.load(open(path, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []
    except Exception as e:
        print('skip', path, e)
        return []

options = {}
for f in ('re/item_randomopt_db.yml', 'import/item_randomopt_db.yml'):
    for o in body(os.path.join(db, f)):
        options[o['Option']] = (o.get('Script') or '').strip()

def opt_list(lst):
    return [{'o': x['Option'], 'min': x.get('MinValue', 0), 'max': x.get('MaxValue', x.get('MinValue', 0))}
            for x in (lst or []) if x.get('Option') in options]

groups = {}
for f in ('re/item_randomopt_group.yml', 'import/item_randomopt_group.yml'):
    for g in body(os.path.join(db, f)):
        groups[g['Group']] = {
            'slots': [opt_list(s.get('Options')) for s in sorted(g.get('Slots') or [], key=lambda s: s.get('Slot', 0))],
            'maxRandom': g.get('MaxRandom', 0), 'random': opt_list(g.get('Random'))}

aegis = {}
for f in glob.glob(os.path.join(db, 're', 'item_db*.yml')) + glob.glob(os.path.join(db, 'import', 'item_db*.yml')):
    for it in body(f):
        aegis[it['AegisName']] = it['Id']

items = {}
def walk(x):
    if isinstance(x, dict):
        g = x.get('RandomOptionGroup')
        name = x.get('ResultItem') or x.get('Item')
        names = [name]
        if isinstance(x.get('TargetItems'), list):       # laphine_upgrade: the group goes on the upgraded targets, not on the upgrade item
            names = [t.get('Item') for t in x['TargetItems'] if isinstance(t, dict)]
        for name in names:
            if g in groups and isinstance(name, str) and name in aegis:
                lst = items.setdefault(str(aegis[name]), [])
                if g not in lst:
                    lst.append(g)
        for v in x.values():
            walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)

for pattern in ('*mob_db*.yml', '*map_drops*.yml', '*item_group_db*.yml', '*item_packages*.yml', '*laphine_upgrade*.yml', '*item_reform*.yml'):
    for f in glob.glob(os.path.join(db, 're', pattern)) + glob.glob(os.path.join(db, 'import', '**', pattern), recursive=True):
        walk(body(f))

used = {g for lst in items.values() for g in lst}
out = {'options': options, 'groups': {k: v for k, v in groups.items() if k in used}, 'items': items}
p = os.path.join(data, 'randomopt.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('options', len(options), 'groups', len(groups), 'used', len(used), 'items', len(items), 'bytes', os.path.getsize(p))
