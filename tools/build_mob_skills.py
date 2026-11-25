"""Monster skills (rAthena db/re/mob_skill_db.txt + db/import/mob_skill_db.txt) -> mobskills.json

usage: build_mob_skills.py <server root> <out mobskills.json> [<skills.json>]
Only rows that can hurt a player are kept for the damage calculator, but every row is listed with `attack: true/false`.
"""
import json, os, sys

root, out = sys.argv[1:3]
skills_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(out), 'skills.json')
skills = json.load(open(skills_path, encoding='utf-8'))['skills']
by_id = {v['id']: k for k, v in skills.items() if isinstance(v, dict) and 'id' in v}

rows = {}
for rel in ('db/re/mob_skill_db.txt', 'db/import/mob_skill_db.txt'):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        continue
    for line in open(p, encoding='utf-8', errors='replace'):
        line = line.split('//')[0].strip()
        if not line:
            continue
        f = [x.strip() for x in line.split(',')]
        if len(f) < 12 or not f[0].lstrip('-').isdigit():
            continue
        mob, state, sid, lv = int(f[0]), f[2], int(f[3]), int(f[4])
        name = by_id.get(sid, str(sid))
        sk = skills.get(name, {})
        rows.setdefault(str(mob), []).append({
            'skill': name, 'lv': lv, 'state': state, 'rate': int(f[5] or 0) / 100, 'cast': int(f[6] or 0),
            'delay': int(f[7] or 0), 'target': f[9], 'cond': f[10], 'condValue': f[11],
            'attack': sk.get('type') in ('Weapon', 'Magic', 'Misc') and f[9] != 'self'})
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('mobs with skills', len(rows), 'rows', sum(len(v) for v in rows.values()),
      'attack rows', sum(1 for v in rows.values() for r in v if r['attack']))
