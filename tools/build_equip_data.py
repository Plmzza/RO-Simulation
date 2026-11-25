"""Build equip/*.json for the RO-Simulation calculators.

Item list, names and icon names come from the RO GGT client (items_all.json, converted from itemInfo).
Stats and bonus scripts come from rAthena renewal item_db (db/re + db/import of the server). GGT items that rAthena does not have are
listed separately with their Thai description so their bonuses can be added later (Divine Pride / manual).

Usage: python build_equip_data.py <rathena_dir> <items_all.json> <out_dir>
"""
import json, os, re, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

rdir, ggt_path, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
load = lambda f: yaml.load(open(f'{rdir}/db/re/{f}.yml', encoding='utf-8'), Loader=Loader)['Body'] or []

ggt = json.load(open(ggt_path, encoding='utf-8'))
def load_import(f):
    path = f'{rdir}/db/import/{f}.yml'
    if not os.path.exists(path):
        return []
    return (yaml.load(open(path, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []

ra = {}
for f in ('item_db_equip', 'item_db_etc', 'item_db_usable'):
    for e in load(f):
        ra[e['Id']] = e
for e in load_import('item_db'):            # server overrides / custom items (rAthena merges fields)
    ra[e['Id']] = {**ra.get(e['Id'], {}), **e}

KEEP_TYPES = {'Weapon', 'Armor', 'Card', 'Shadowgear', 'ShadowGear', 'Ammo'}
CODE = re.compile(r'\^[0-9a-fA-F]{6}')

def ggt_info(it):
    desc = [CODE.sub('', str(v)) for v in (it.get('identifiedDescriptionName') or {}).values()]
    return it.get('identifiedDisplayName') or '', it.get('identifiedResourceName') or '', it.get('slotCount', 0), desc

def jobs(e):
    j = e.get('Jobs')
    if not j or j.get('All'):
        excl = sorted(k for k, v in (j or {}).items() if v is False)
        return {'all': True, 'except': excl} if excl else None
    return sorted(k for k, v in j.items() if v)

items, missing = {}, {}
for sid, it in ggt.items():
    iid = int(sid)
    name, res, slots, desc = ggt_info(it)
    e = ra.get(iid)
    if e is None:
        looks_equip = slots > 0 or any(re.search(r'ตำแหน่ง\s*:|พลังโจมตี\s*:|พลังป้องกัน\s*:|ประเภท\s*:\s*(?:\^\w{6})?Card', d) for d in desc)
        enchant = 310000 <= iid < 320000          # rAthena keeps enchants (Card / Enchant) in this id range
        if looks_equip or enchant:
            missing[iid] = {'name': name, 'res': res, 'slots': slots, 'desc': [d for d in desc if d.strip()]}
            if enchant and not looks_equip:
                missing[iid]['enchant'] = True
        continue
    if e.get('Type') not in KEEP_TYPES:
        continue
    rec = {
        'name': name or e.get('Name'), 'res': res, 'type': 'ShadowGear' if e['Type'].lower() == 'shadowgear' else e['Type'],
        'loc': sorted(k for k, v in (e.get('Locations') or {}).items() if v),
        'slots': e.get('Slots', 0),
    }
    for src, dst in (('SubType', 'sub'), ('Attack', 'atk'), ('MagicAttack', 'matk'), ('Defense', 'def'),
                     ('WeaponLevel', 'wlv'), ('Weight', 'w'), ('ArmorLevel', 'alv'), ('EquipLevelMin', 'elv'), ('EquipLevelMax', 'elvMax'),
                     ('Refineable', 'refine'), ('Gradable', 'grade'), ('Gender', 'gender')):
        if e.get(src) not in (None, False, 0):
            rec[dst] = e[src]
    if rec['type'] == 'Weapon' and 'wlv' not in rec:
        rec['wlv'] = 1
    j = jobs(e)
    if j is not None:
        rec['jobs'] = j
    cls = sorted(k for k, v in (e.get('Classes') or {}).items() if v)
    if cls and cls != ['All']:
        rec['classes'] = cls
    if e.get('Script'):
        rec['script'] = e['Script'].strip()
    items[iid] = rec

# Refine bonus tables: group -> level -> [bonus at +1..+20] (already divided by 100 where rAthena does)
refine = {}
for g in load('refine'):
    for lv in g['Levels']:
        refine.setdefault(g['Group'], {})[lv['Level']] = {
            'bonus': [r.get('Bonus', 0) for r in lv.get('RefineLevels', [])],
            'random': [r.get('RandomBonus', 0) for r in lv.get('RefineLevels', [])],
        }

# Enchant grade (weapon refine bonus multiplier): grade 1=D .. 4=A
grades = {}
for e in load('enchantgrade'):
    for lv in e['Levels']:
        grades.setdefault(e['Type'], {})[lv['Level']] = [g.get('Bonus', 0) for g in lv['Grades']]

# Item combos (set bonuses)
combos = []
name2id = {e['AegisName']: i for i, e in ra.items() if 'AegisName' in e}
for c in load('item_combos') + load_import('item_combos'):
    sets = [[name2id.get(n) for n in grp] for grp in c.get('Combos', []) for grp in [grp.get('Combo', [])]]
    sets = [s for s in sets if all(s)]
    if sets and c.get('Script'):
        combos.append({'sets': sets, 'script': c['Script'].strip()})

json.dump({str(k): v for k, v in sorted(items.items())}, open(f'{out}/items.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump({'refine': refine, 'grades': grades}, open(f'{out}/refine.json', 'w', encoding='utf-8'), separators=(',', ':'))
json.dump(combos, open(f'{out}/combos.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({str(k): v for k, v in sorted(missing.items())}, open(f'{out}/ggt-only.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
by_type = {}
for v in items.values():
    by_type[v['type']] = by_type.get(v['type'], 0) + 1
print('items', len(items), by_type, '| combos', len(combos), '| GGT-only equipment', len(missing))
