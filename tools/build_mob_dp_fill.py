"""Monsters the server mob_db has only as a stub (or not at all) but a script uses: take their stats from the Divine
Pride cache (.cache/divine-pride/mob/<id>.json, made by fetch_mob_dp.py) and write tools/mob_dp_fill.json, which
build_battle_data.py lays over the server data. English names come from the scripts (Divine Pride has only Korean
for these). ATK is Divine Pride's shown range; dmgRate is the "Taking only N% of the damage" trait.
Usage: python build_mob_dp_fill.py"""
import json, os, re

here = os.path.dirname(os.path.abspath(__file__))
cache = os.path.join(here, '..', '.cache', 'divine-pride', 'mob')
FILL = {   # id: English name (from npc/instances/Lakeoffireandhalloflife/instance_re.txt)
    22177: 'Floral Pegasus', 22178: 'Coral Marine', 22179: 'Maple Tree', 22180: 'Monarch Penguin',
    22174: 'Dimensional Criminal Rigel',
}
num = lambda s: int(str(s).replace('.', '').replace(',', '')) if s not in (None, '') else 0
out = {}
for mid, name in FILL.items():
    d = json.load(open(os.path.join(cache, f'{mid}.json'), encoding='utf-8'))
    lo, _, hi = (d.get('attackRange') or '0 - 0').partition(' - ')
    m = re.search(r'Taking only ([\d.]+)% of the damage', ' '.join(d.get('attributes') or []))
    out[str(mid)] = {
        'name': name, 'aegis': d.get('spriteName'), 'lv': d['level'], 'hp': d['health'], 'atk': num(lo), 'atk2': num(hi),
        'def': d['def'], 'mdef': d['mDef'], 'res': d.get('res') or 0, 'mres': d.get('mRes') or 0,
        **{k: d.get(k) or 0 for k in ('str', 'agi', 'vit', 'int', 'dex', 'luk')},
        'size': d['size'], 'race': d['race'].replace('-', ''), 'ele': d['element'].split()[0], 'eleLv': d.get('elementLevel') or 1,
        'class': 'Boss' if d['type'] in ('MVP', 'Boss') else 'Normal', 'mvp': d['type'] == 'MVP', 'raceGroups': [],
        'range': d.get('range') or 1, 'adelay': round(1000 / d['attackSpeed']) if d.get('attackSpeed') else 0, 'amotion': 0,
        **({'dmgRate': float(m.group(1)) / 100} if m else {}), 'source': 'divine-pride',
    }
json.dump(out, open(os.path.join(here, 'mob_dp_fill.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('filled', len(out))
