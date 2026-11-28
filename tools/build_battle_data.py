"""Build data/mobs.json (monsters) and data/battle.json (element and size tables) from the server db.

Usage: python build_battle_data.py <server_dir with db/> <data_dir>
"""
import json, os, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, out = sys.argv[1:3]

def load(rel):
    p = f'{root}/{rel}'
    if not os.path.exists(p):
        return []
    return (yaml.load(open(p, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []

mobs = {}
for e in load('db/re/mob_db.yml') + load('db/import/mob_db.yml'):
    mobs[e['Id']] = {**mobs.get(e['Id'], {}), **e}

out_mobs = {}
for mid, e in sorted(mobs.items()):
    modes = e.get('Modes') or {}
    cls = e.get('Class', 'Normal')
    if modes.get('Mvp') and cls == 'Normal':
        cls = 'Boss'
    out_mobs[mid] = {
        'name': e.get('Name', e.get('AegisName')), 'aegis': e.get('AegisName'), 'lv': e.get('Level', 1),
        'hp': e.get('Hp', 1), 'atk': e.get('Attack', 0), 'atk2': e.get('Attack2', 0),
        'def': e.get('Defense', 0), 'mdef': e.get('MagicDefense', 0),
        'res': e.get('Resistance', 0), 'mres': e.get('MagicResistance', 0),
        'str': e.get('Str', 1), 'agi': e.get('Agi', 1), 'vit': e.get('Vit', 1), 'int': e.get('Int', 1),
        'dex': e.get('Dex', 1), 'luk': e.get('Luk', 1),
        'size': e.get('Size', 'Small'), 'race': e.get('Race', 'Formless'), 'ele': e.get('Element', 'Neutral'),
        'eleLv': e.get('ElementLevel', 1), 'class': cls, 'mvp': bool(modes.get('Mvp')),
        'raceGroups': sorted(k for k, v in (e.get('RaceGroups') or {}).items() if v),
        'range': e.get('AttackRange', 0), 'adelay': e.get('AttackDelay', 0), 'amotion': e.get('AttackMotion', 0),
    }

attr = {}
for e in load('db/re/attr_fix.yml'):
    lv = e['Level']
    attr[lv] = {atk: row for atk, row in e.items() if atk != 'Level'}
for e in load('db/import/attr_fix.yml'):
    for atk, row in e.items():
        if atk != 'Level':
            attr.setdefault(e['Level'], {}).setdefault(atk, {}).update(row)

size = {}
for e in load('db/re/size_fix.yml') + load('db/import/size_fix.yml'):
    size[e['Weapon']] = {'Small': e.get('Small', 100), 'Medium': e.get('Medium', 100), 'Large': e.get('Large', 100)}

fill = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mob_dp_fill.json'), encoding='utf-8'))
for k, v in fill.items():          # stub or missing in the server mob_db: Divine Pride stats (tools/build_mob_dp_fill.py)
    if int(k) not in out_mobs or out_mobs[int(k)]['hp'] <= 1:
        out_mobs[int(k)] = {**{kk: vv for kk, vv in v.items() if kk != 'source'}, 'dp': True}
json.dump({str(k): v for k, v in out_mobs.items()}, open(f'{out}/mobs.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump({'attr': attr, 'size': size}, open(f'{out}/battle.json', 'w', encoding='utf-8'), separators=(',', ':'))
print(f'monsters {len(out_mobs)}, attr levels {len(attr)}, size rows {len(size)}')
