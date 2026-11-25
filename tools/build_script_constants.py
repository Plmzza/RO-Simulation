"""Extract numeric script constants and job class info from rAthena sources.
Usage: python build_script_constants.py <rathena_dir> <out.json> [<data_dir with items.json/combos.json>]"""
import json, re, sys
rdir, out = sys.argv[1:3]
SRC = ['src/common/mmo.hpp', 'src/map/map.hpp', 'src/map/pc.hpp', 'src/map/status.hpp', 'src/map/battle.hpp',
       'src/map/script.hpp', 'src/map/itemdb.hpp']
text = {f: open(f'{rdir}/{f}', encoding='utf-8', errors='replace').read() for f in SRC}
strip = lambda s: re.sub(r'/\*.*?\*/', '', re.sub(r'//[^\n]*', '', s), flags=re.S)
sym = {}

def ev(expr):
    e = expr.strip()
    if not e:
        return None
    e = re.sub(r'\b(0x[0-9a-fA-F]+|\d+)(?:ULL|LL|UL|U|L)?\b', r'\1', e)
    def rep(m):
        n = m.group(0)
        if n in sym: return str(sym[n])
        raise KeyError(n)
    try:
        e2 = re.sub(r'\b[A-Za-z_]\w*\b', rep, e)
        if re.search(r'[^0-9xXa-fA-F\s|&+\-*/<>()~^]', e2): return None
        return int(eval(e2.replace('/', '//'), {}, {}))
    except Exception:
        return None

for _ in range(3):   # a few passes so forward references resolve
    for f, t in text.items():
        t = strip(t)
        for m in re.finditer(r'#define\s+([A-Z_][A-Z0-9_]*)\s+([^\n]+)', t):
            v = ev(m.group(2))
            if v is not None: sym[m.group(1)] = v
        for m in re.finditer(r'enum\s*(?:class\s+)?\w*\s*(?::\s*[\w:]+)?\s*\{(.*?)\}', t, re.S):
            cur = -1
            for part in m.group(1).split(','):
                part = part.strip()
                if not part: continue
                mm = re.match(r'([A-Za-z_]\w*)\s*(?:=\s*(.+))?$', part, re.S)
                if not mm: continue
                name, val = mm.group(1), mm.group(2)
                if val is not None:
                    v = ev(val)
                    if v is None: cur = None; continue
                    cur = v
                else:
                    if cur is None: continue
                    cur += 1
                sym[name] = cur

# Script names from script_constants.hpp
sc = strip(open(f'{rdir}/src/map/script_constants.hpp', encoding='utf-8').read())
consts = {}
for m in re.finditer(r'export_constant2\(\s*"(\w+)"\s*,\s*([^)]+)\)', sc):
    v = ev(m.group(2))
    if v is not None: consts[m.group(1)] = v
for m in re.finditer(r'export_constant\(\s*([A-Za-z_]\w*)\s*\)', sc):
    if m.group(1) in sym: consts[m.group(1)] = sym[m.group(1)]
for m in re.finditer(r'export_parameter\(\s*"(\w+)"\s*,\s*(\w+)\s*\)', sc):
    consts.setdefault('$param:' + m.group(1), m.group(2))
for name, v in sym.items():           # Job_* names used by scripts
    if name.startswith('JOB_'):
        consts['Job_' + '_'.join(p.capitalize() for p in name[4:].split('_'))] = v

# Job -> mapid and mapid -> job (pc.cpp switches)
pc = strip(open(f'{rdir}/src/map/pc.cpp', encoding='utf-8').read())
def body(fn):
    i = pc.index(fn); j = pc.index('\n}', i); return pc[i:j]
j2m = {}
for m in re.finditer(r'case\s+(JOB_\w+)\s*:\s*return\s+(MAPID_\w+)\s*;', body('uint64 pc_jobid2mapid(')):
    if m.group(1) in sym and m.group(2) in sym: j2m[sym[m.group(1)]] = sym[m.group(2)]
m2j = {}
for m in re.finditer(r'case\s+(MAPID_\w+)\s*:\s*return\s+(?:sex\s*\?\s*)?(JOB_\w+)', body('int32 pc_mapid2jobid(')):
    if m.group(1) in sym and m.group(2) in sym: m2j.setdefault(sym[m.group(1)], sym[m.group(2)])
FIRST, SECOND = sym['MAPID_FIRSTMASK'], sym['MAPID_SECONDMASK']
jobs = {}
for jid, mid in j2m.items():
    jobs[jid] = {'mapid': mid, 'baseJob': m2j.get(mid & SECOND, -1), 'baseClass': m2j.get(mid & FIRST, -1),
                 'upper': 1 if mid & sym['JOBL_UPPER'] else (2 if mid & sym['JOBL_BABY'] else 0)}
# Keep only the constants item scripts actually use (plus a few families the engine needs)
items_dir = sys.argv[3] if len(sys.argv) > 3 else None
if items_dir:
    used = set()
    srcs = [v.get('script', '') for v in json.load(open(f'{items_dir}/items.json', encoding='utf-8')).values()]
    srcs += [c['script'] for c in json.load(open(f'{items_dir}/combos.json', encoding='utf-8'))]
    for s_ in srcs:
        used |= set(re.findall(r'(?<![\w.@$])([A-Za-z_]\w*)', re.sub(r'"[^"]*"', '', s_)))
    consts = {k: v for k, v in consts.items() if isinstance(v, int) and
              (k in used or k.startswith(('EQI_', 'W_', 'EAJ', 'ENCHANTGRADE_', 'ITEMINFO_', 'Job_')))}
json.dump({'constants': consts, 'jobs': jobs}, open(out, 'w'), separators=(',', ':'))
print('symbols', len(sym), 'script constants', len(consts), 'jobs', len(jobs))
for k in ['EAJL_THIRD', 'EAJ_KNIGHT', 'EAJ_UPPERMASK', 'Job_Knight', 'Job_Rune_Knight_T', 'EQI_HAND_R', 'BF_WEAPON', 'BF_SHORT',
          'ENCHANTGRADE_A', 'W_BOW', 'W_2HSTAFF', 'ITEMINFO_VIEW', 'RC_Demon', 'Ele_Fire', 'Size_Small', 'Class_All', 'VIP_STATUS_ACTIVE']:
    print(k, consts.get(k))
print('Lord Knight', jobs.get(4008), 'Rune Knight T', jobs.get(4060), 'Dragon Knight', jobs.get(4252))
