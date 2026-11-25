"""Skill details for the skill simulator: per-level cast / delay / cooldown / SP / duration and other skill_db fields.

usage: build_skill_info.py <server root> <out skillinfo.json>
Only skills that appear in a job skill tree are written. Values come from db/re/skill_db.yml (+ db/import).
"""
import json, os, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, out = sys.argv[1:3]

def load(rel):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        return []
    return (yaml.load(open(p, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []

skills = {}
for e in load('db/re/skill_db.yml') + load('db/import/skill_db.yml'):
    skills[e['Name']] = {**skills.get(e['Name'], {}), **e}
in_tree = {t['Name'] for e in load('db/re/skill_tree.yml') + load('db/import/skill_tree.yml') for t in (e.get('Tree') or [])}

def per_level(v, key, maxlv):
    """number | per-level list -> compact: a number when all levels are equal, else a list of maxlv values"""
    if v is None:
        return None
    if isinstance(v, list):
        d = {x['Level']: x.get(key) for x in v}
        vals, last = [], None
        for lv in range(1, maxlv + 1):
            last = d.get(lv, last)
            vals.append(last)
        return vals[0] if len(set(map(str, vals))) == 1 else vals
    return v

item_name = {}
for f in ('db/re/item_db_etc.yml', 'db/re/item_db_usable.yml', 'db/re/item_db_equip.yml', 'db/import/item_db.yml'):
    for it in load(f):
        item_name[it['AegisName']] = it.get('Name', it['AegisName'])
out_d = {}
for name in sorted(in_tree):
    e = skills.get(name)
    if not e:
        continue
    mx = e.get('MaxLevel', 1)
    req = e.get('Requires') or {}
    rec = {'id': e['Id'], 'name': e.get('Description', name), 'maxLv': mx, 'type': e.get('Type'), 'target': e.get('TargetType', 'Passive')}
    for src, dst, key in (('Range', 'range', 'Size'), ('HitCount', 'hits', 'Count'), ('Element', 'ele', 'Element'),
                          ('CastTime', 'cast', 'Time'), ('FixedCastTime', 'fixedCast', 'Time'), ('AfterCastActDelay', 'delay', 'Time'),
                          ('AfterCastWalkDelay', 'walkDelay', 'Time'), ('Cooldown', 'cooldown', 'Time'), ('Duration1', 'duration', 'Time'),
                          ('SplashArea', 'area', 'Area')):
        v = per_level(e.get(src), key, mx)
        if v not in (None, 0):
            rec[dst] = v
    for src, dst, key in (('SpCost', 'sp', 'Amount'), ('HpCost', 'hp', 'Amount'), ('ApCost', 'ap', 'Amount'),
                          ('SpiritSphereCost', 'spheres', 'Amount')):
        v = per_level(req.get(src), key, mx)
        if v not in (None, 0):
            rec[dst] = v
    if req.get('Weapon'):
        rec['weapons'] = sorted(k for k, v in req['Weapon'].items() if v)
    if req.get('ItemCost'):
        rec['items'] = [[item_name.get(x['Item'], x['Item']), x.get('Amount', 1)] + ([x['Level']] if 'Level' in x else [])
                        for x in req['ItemCost']]
    if req.get('State'):
        rec['state'] = req['State']
    flags = [k for k, v in (e.get('DamageFlags') or {}).items() if v] + [k for k, v in (e.get('Flags') or {}).items() if v]
    if flags:
        rec['flags'] = flags
    if (e.get('CastTimeFlags') or {}).get('IgnoreDex'):
        rec['castIgnoreDex'] = True
    out_d[name] = rec
json.dump(out_d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('skills', len(out_d), 'bytes', os.path.getsize(out))
