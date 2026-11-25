"""Build data/skills.json: skill info from skill_db/skill_tree and the renewal skill-ratio code of every skill.

The skill ratio code is taken from the server source (src/map/skills/**/*.cpp, calculateSkillRatio) and
simplified so calc/cskill.js can run it: comments and pre-renewal branches removed, C++ types and casts dropped,
known handles renamed (sstatus -> S, tstatus -> T, sd -> SD, sc -> SC, tsc -> TSC, wd/ad -> WD).

Usage: python build_skills_data.py <server_dir with db/ and src/> <out.json>
"""
import json, os, re, sys
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

skills = {}
for e in load('db/re/skill_db.yml') + load('db/import/skill_db.yml'):
    skills[e['Id']] = {**skills.get(e['Id'], {}), **e}

# ------------------------------------------------------------------ ratio code from src/map/skills
def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)

def resolve_ifdefs(s, defined={'RENEWAL', 'RENEWAL_CAST', 'RENEWAL_ASPD', 'RENEWAL_STAT', 'RENEWAL_LVDMG', 'RENEWAL_DROP', 'RENEWAL_EXP'}):
    out, stack = [], []          # stack of (active, any_taken)
    for line in s.split('\n'):
        t = line.strip()
        m = re.match(r'#\s*(ifdef|ifndef|if)\s+(.*)', t)
        if m:
            kind, cond = m.groups()
            cond = cond.strip()
            val = (cond in defined) if kind == 'ifdef' else (cond not in defined) if kind == 'ifndef' else \
                bool(re.fullmatch(r'(PACKETVER\s*>=\s*\d+|1)', cond))
            parent = all(a for a, _ in stack)
            stack.append((parent and val, val)); continue
        if t.startswith('#else'):
            a, taken = stack.pop(); parent = all(x for x, _ in stack)
            stack.append((parent and not taken, True)); continue
        if t.startswith('#endif'):
            stack.pop(); continue
        if t.startswith('#'):
            continue
        if all(a for a, _ in stack):
            out.append(line)
    return '\n'.join(out)

TYPES = r'(?:const\s+)?(?:unsigned\s+)?(?:int8|int16|int32|int64|uint8|uint16|uint32|uint64|int|short|long|float|double|bool|auto|defType|t_tick|size_t)\b'
HANDLE_TYPES = r'(?:const\s+)?(?:struct\s+)?(?:status_data|map_session_data|status_change|status_change_entry|s_elemental_data|block_list|homun_data|mob_data|TBL_PC|TBL_MOB|item_data)\s*\*?\s*'

def simplify(body, ratio_param, target_name='skillratio'):
    s = resolve_ifdefs(strip_comments(body))
    s = re.sub(r'\(\s*&\s*(src|target)\s*\)', r'(\1)', s)
    s = re.sub(r'\b' + re.escape(ratio_param) + r'\b', target_name, s)
    # C++17 if-init: if (decl; cond) -> decl; if (cond)
    s = re.sub(r'\bif\s*\(([^;()]*(?:\([^()]*\)[^;()]*)*);', r'\1; if (', s)
    # handles
    rep = [
        (r'status_get_status_data\(\s*\*?\s*src\s*\)', 'S'), (r'status_get_status_data\(\s*\*?\s*target\s*\)', 'T'),
        (r'BL_CAST\(\s*BL_PC\s*,\s*src\s*\)', 'SD'), (r'BL_CAST\(\s*BL_PC\s*,\s*target\s*\)', 'TSD'),
        (r'BL_CAST\(\s*BL_\w+\s*,\s*\w+\s*\)', 'null'),
        (r'status_get_sc\(\s*src\s*\)', 'SC'), (r'status_get_sc\(\s*target\s*\)', 'TSC'),
        (r'static_cast<[^>]+>', ''), (r'reinterpret_cast<[^>]+>', ''), (r'const_cast<[^>]+>', ''),
        (r'\((?:int8|int16|int32|int64|uint8|uint16|uint32|uint64|int|float|double|short|long)\)', ''),
        (r'->', '.'), (r'\bnullptr\b', 'null'), (r'(\d+(?:\.\d+)?)f\b', r'\1'),
        (r'\bsstatus\b', 'S'), (r'\btstatus\b', 'T'), (r'\bsd\b', 'SD'), (r'\btsd\b', 'TSD'),
        (r'\bsc\b', 'SC'), (r'\btsc\b', 'TSC'), (r'\bwd\b', 'WD'), (r'\bad\b', 'WD'), (r'\bmd\b', 'WD'),
        (r'\bmflag\b', 'MFLAG'), (r'\bskill_lv\b', 'skill_lv'),
    ]
    for a, b in rep:
        s = re.sub(a, b, s)
    # declarations of handles become plain assignments, other declarations become "var"
    s = re.sub(HANDLE_TYPES + r'(\b[A-Za-z_]\w*\s*(?:=|;))', r'var \1', s)
    s = re.sub(r'\bstd::\w+<[^>]*>\s*', 'var ', s)
    s = re.sub(r'\bstd::', '', s)
    s = re.sub(TYPES + r'\s*\*?\s*(?=[A-Za-z_]\w*\s*(?:=|;|,))', 'var ', s)
    s = re.sub(r'\bvar\s+var\b', 'var', s)
    return re.sub(r'\n\s*\n+', '\n', s).strip()

ratio_code, class_of, hit_code, ele_code = {}, {}, {}, {}

def bodies(src, method):
    for m in re.finditer(r'void (Skill\w+)::' + method + r'\(([^)]*)\)\s*const\s*\{', src):
        i = m.end(); depth = 1; j = i
        while depth:
            depth += (src[j] == '{') - (src[j] == '}'); j += 1
        params = [p.strip().split()[-1].lstrip('&*') for p in m.group(2).split(',') if p.strip()]
        yield m.group(1), params, src[i:j - 1]
for dp, _, fs in os.walk(f'{root}/src/map/skills'):
    for f in fs:
        if not f.endswith('.cpp'):
            continue
        src = open(os.path.join(dp, f), encoding='utf-8', errors='replace').read().replace('\r', '')
        ctor = {m.group(1): m.group(2) for m in re.finditer(r'(Skill\w+)::\1\(\)\s*:\s*\w+\(\s*([A-Z0-9_]+)', src)}
        for cls, params, body in bodies(src, 'calculateSkillRatio'):
            name = ctor.get(cls)
            if name:
                ratio_code[name] = simplify(body, params[4] if len(params) > 4 else 'skillratio')
                class_of[name] = cls
        for cls, params, body in bodies(src, 'modifyElement'):
            name = ctor.get(cls)
            if name and len(params) > 4:
                ele_code[name] = re.sub(r'(?:static\s+)?const\s+var\s+(\w+)\s*=\s*\{([^{}]*)\}', r'var \1 = __arr(\2)',
                                        simplify(body, params[4], 'element'))
        for cls, params, body in bodies(src, 'modifyHitRate'):
            name = ctor.get(cls)
            if name and params:
                hit_code[name] = simplify(body, params[0], 'hit_rate')

# ------------------------------------------------------------------ skill tree (which job has which skill)
tree = {}
for e in load('db/re/skill_tree.yml') + load('db/import/skill_tree.yml'):
    tree.setdefault(e['Job'], {'inherit': [], 'skills': []})
    if e.get('Inherit'):
        tree[e['Job']]['inherit'] = sorted(k for k, v in e['Inherit'].items() if v)
    for t in e.get('Tree') or []:
        req = [[r['Name'], r.get('Level', 1)] for r in (t.get('Requires') or [])]
        row = [t['Name'], t.get('MaxLevel', 1)]
        if req or t.get('JobLevel'):
            row += [req, t.get('JobLevel', 0)]       # [name, maxLv, requires [[skill, lv]], min job level]
        tree[e['Job']]['skills'] = [x for x in tree[e['Job']]['skills'] if x[0] != t['Name']] + [row]

def per_level(v, key):
    if isinstance(v, list):
        return [x.get(key) for x in sorted(v, key=lambda x: x['Level'])]
    return v

out_skills = {}
for sid, e in skills.items():
    t = e.get('Type')
    if t not in ('Weapon', 'Magic', 'Misc'):
        continue
    rec = {'id': sid, 'name': e.get('Description', e['Name']), 'type': t, 'maxLv': e.get('MaxLevel', 1),
           'ele': per_level(e.get('Element', 'Neutral'), 'Element'), 'hits': per_level(e.get('HitCount', 1), 'Count'),
           'range': per_level(e.get('Range', 1), 'Size'),
           'flags': sorted(k for k, v in (e.get('DamageFlags') or {}).items() if v)}
    for src_key, dst in (('CastTime', 'cast'), ('FixedCastTime', 'fixedCast'), ('AfterCastActDelay', 'delay'), ('Cooldown', 'cooldown')):
        if e.get(src_key) not in (None, 0):
            rec[dst] = per_level(e[src_key], 'Time')
    if (e.get('CastTimeFlags') or {}).get('IgnoreDex'):
        rec['castIgnoreDex'] = True
    ammo = ((e.get('Requires') or {}).get('Ammo')) or {}
    if any(ammo.values()):
        rec['ammo'] = sorted(k for k, v in ammo.items() if v)     # uses arrows / bullets: ammo ATK and element count
    if e['Name'] in ratio_code:
        rec['ratio'] = ratio_code[e['Name']]
    if e['Name'] in hit_code:
        rec['hitRate'] = hit_code[e['Name']]
    if e['Name'] in ele_code:
        rec['eleMod'] = ele_code[e['Name']]
    out_skills[e['Name']] = rec

# sphere regeneration intervals (skill Duration2): Servant Weapon balls, Abyss Force Weapon spheres
by_name = {e['Name']: e for e in skills.values()}
regen = {n: per_level(by_name[n]['Duration2'], 'Time') for n in ('DK_SERVANTWEAPON', 'ABC_FROM_THE_ABYSS')
         if n in by_name and by_name[n].get('Duration2')}
# display names and kinds of every skill (skill simulator): Passive / Self / Support / Attack / Ground
names = {e['Name']: [e.get('Description', e['Name']), e.get('TargetType', 'Passive')] for e in skills.values()}
json.dump({'skills': out_skills, 'tree': tree, 'regen': regen, 'names': names}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"attack skills {len(out_skills)}, with ratio code {sum(1 for s in out_skills.values() if 'ratio' in s)}, "
      f"jobs in tree {len(tree)}")
