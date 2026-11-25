#!/usr/bin/env python3
"""
Status changes (buffs) taken straight from the server source, so every buff skill is covered the way the server
computes it.

Usage: python build_sc_data.py <server_dir with db/ and src/> <out.json>

What is extracted (renewal branches only):
  status.cpp
    status_change_start(_post_delay): the switch that sets val1..val4 for each SC (case SC_X: ... break;) and the earlier switch
                         that refuses an SC (weapon checks, "return false")
    status_calc_<stat>:  str agi vit int dex luk pow sta wis spl con crt batk watk critical hit flee flee2 def def2 mdef
                         mdef2 patk smatk res mres hplus crate, aspd (fixed / %), fix_aspd, pseudobuff_matk
    status_get_hpbonus / status_get_spbonus (SC part and passive skills)
  battle.cpp   battle_get_atkpercent
  skill.cpp    the status part of skill_vfcastfix (variable / fixed cast changes)
  skill_db     skills that start an SC (Status:), their target type, area, weapon requirement, max level

The code is simplified for calc/cskill.js (comments, pre-renewal branches, casts and C++ types removed, -> to .).
calc/sc.js runs it.
"""
import json
import os
import re
import sys

import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

root, out_path = sys.argv[1:3]
SRC = f'{root}/src/map'


def read(p):
    return open(p, encoding='utf-8', errors='replace').read().replace('\r', '')


def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)


DEFINED = {'RENEWAL', 'RENEWAL_CAST', 'RENEWAL_ASPD', 'RENEWAL_STAT', 'RENEWAL_LVDMG', 'RENEWAL_DROP', 'RENEWAL_EXP'}


def resolve_ifdefs(s):
    out, stack = [], []
    for line in s.split('\n'):
        t = line.strip()
        m = re.match(r'#\s*(ifdef|ifndef|if)\s+(.*)', t)
        if m:
            kind, cond = m.groups()
            cond = cond.strip()
            val = (cond in DEFINED) if kind == 'ifdef' else (cond not in DEFINED) if kind == 'ifndef' else \
                bool(re.fullmatch(r'(PACKETVER\s*>=\s*\d+|1)', cond))
            parent = all(a for a, _ in stack)
            stack.append((parent and val, val))
            continue
        if t.startswith('#else'):
            a, taken = stack.pop()
            parent = all(x for x, _ in stack)
            stack.append((parent and not taken, True))
            continue
        if t.startswith('#endif'):
            stack.pop()
            continue
        if t.startswith('#'):
            continue
        if all(a for a, _ in stack):
            out.append(line)
    return '\n'.join(out)


TYPES = (r'(?:const\s+)?(?:unsigned\s+)?(?:struct\s+)?(?:int8|int16|int32|int64|uint8|uint16|uint32|uint64|int|short|long|float|'
         r'double|bool|auto|defType|t_tick|size_t|sc_type|status_change_entry|status_change|map_session_data|block_list|'
         r'status_data|TBL_PC|TBL_MOB|mob_data|homun_data|s_elemental_data|item_data|e_skill|map_data|unit_data|'
         r'skill_unit_group|skill_unit|s_skill_unit_group)\b\s*\*?\s*&?\s*')


def simplify(code):
    s = resolve_ifdefs(strip_comments(code))
    # C++17 if-init: if (decl; cond) -> decl; if (cond)
    s = re.sub(r'\bif\s*\(([^;()]*(?:\([^()]*\)[^;()]*)*);', r'\1; if (', s)
    rep = [
        (r'BL_CAST\(\s*BL_PC\s*,\s*\w+\s*\)', 'sd'), (r'map_id2sd\([^)]*\)', 'sd'),
        (r'\(\s*\(\s*(?:TBL_PC|map_session_data)\s*\*\s*\)\s*\w+\s*\)', 'sd'), (r'\(\s*(?:TBL_PC|map_session_data)\s*\*\s*\)\s*\w+', 'sd'),
        (r'BL_CAST\(\s*BL_\w+\s*,\s*\w+\s*\)', 'null'),
        (r'static_cast<[^>]+>', ''), (r'reinterpret_cast<[^>]+>', ''), (r'const_cast<[^>]+>', ''),
        (r'\((?:int8|int16|int32|int64|uint8|uint16|uint32|uint64|int|float|double|short|long|defType|unsigned char|sc_type)\)', ''),
        (r'->', '.'), (r'\bnullptr\b', 'null'), (r'(\d+(?:\.\d+)?)f\b', r'\1'), (r'\bstd::', ''),
        (r'\bi64max\b', 'max'), (r'\bi64min\b', 'min'),
    ]
    for a, b in rep:
        s = re.sub(a, b, s)
    s = re.sub(r'\[\[\w+\]\]\s*;?', '', s)                                   # [[fallthrough]];
    s = re.sub(r'\(\s*(?:struct\s+)?\w+\s*\*\s*\)', '', s)                         # pointer casts (TBL_MER*)
    s = re.sub(r'\b(\d+)(?:ULL|LL|UL|U|L)\b', r'\1', s)                             # 1LL
    # int32 a[] = { 1, 2 }  ->  var a = __arr(1, 2)
    s = re.sub(TYPES + r'(\w+)\s*\[\s*\w*\s*\]\s*=\s*\{([^{}]*)\}', r'var \1 = __arr(\2)', s)
    s = re.sub(r'\benum\s+\w+\s+(?=[A-Za-z_]\w*\s*(?:=|;))', 'var ', s)
    s = re.sub(r'\benum\s+', '', s)
    s = re.sub(TYPES + r'(?=[A-Za-z_]\w*\s*(?:=|;|,|\[))', 'var ', s)
    s = re.sub(r'\bvar\s+var\b', 'var', s)
    # VARCAST_REDUCTION (const.hpp, RENEWAL_CAST) without float casts
    s = re.sub(r'VARCAST_REDUCTION\(([^;]*?)\);',
               r'{ if ((varcast_r += (\1)) != 0 && varcast_r >= 0) time = time * (100 - min((\1), 100)) / 100; }', s)
    return re.sub(r'\n\s*\n+', '\n', s).strip()


def match_brace(s, i):
    """s[i] == '{' -> index after the matching '}' (string and char literals skipped)"""
    depth = 0
    j = i
    n = len(s)
    while j < n:
        c = s[j]
        if c in '"\'':
            q = c
            j += 1
            while j < n and s[j] != q:
                j += 2 if s[j] == '\\' else 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError('unbalanced')


def function_body(src, name):
    """Parameters and body of a function definition (the longest one when there are overloads)."""
    best = None
    for m in re.finditer(r'^[^\n;]*\b' + name + r'\s*\(([^)]*)\)\s*(?:const\s*)?\{', src, re.M):
        start = src.index('{', m.end() - 1)
        end = match_brace(src, start)
        params = [p.strip().split()[-1].lstrip('&*') for p in m.group(1).split(',') if p.strip()]
        if not best or end - start > len(best[1]):
            best = (params, src[start + 1:end - 1])
    if not best:
        raise KeyError(name)
    return best


def switch_cases(body, label=r'SC_\w+'):
    """{ 'SC_X': code } for a switch body (text between the braces). Fall-through labels share the code up to break."""
    out = {}
    labels = [(m.start(), m.end(), m.group(1)) for m in re.finditer(r'\bcase\s+(' + label + r')\s*:', body)]
    # keep only labels at depth 0 of this switch
    depth_at = []
    depth = 0
    pos = 0
    keep = []
    for st, en, name in labels:
        depth += body.count('{', pos, st) - body.count('}', pos, st)
        pos = st
        if depth == 0:
            keep.append((st, en, name))
    for st, en, name in keep:
        # code until the first "break;" at depth 0
        d = 0
        i = en
        code_end = len(body)
        while i < len(body):
            c = body[i]
            if c == '{':
                d += 1
            elif c == '}':
                d -= 1
                if d < 0:
                    code_end = i
                    break
            elif d == 0 and body.startswith('break;', i) and not re.match(r'\w', body[i - 1]):
                code_end = i
                break
            i += 1
        code = body[en:code_end]
        code = re.sub(r'\bcase\s+\w+\s*:', '', code)
        code = re.sub(r'\bdefault\s*:', '', code)
        out[name] = code
    return out


status_cpp = resolve_ifdefs(strip_comments(read(f'{SRC}/status.cpp')))
battle_cpp = resolve_ifdefs(strip_comments(read(f'{SRC}/battle.cpp')))
skill_cpp = resolve_ifdefs(strip_comments(read(f'{SRC}/skill.cpp')))

# ---------------------------------------------------------------- status_change_start switches
_, sc_start = function_body(status_cpp, 'status_change_start_post_delay')
switches = [m.start() for m in re.finditer(r'\bswitch\s*\(\s*type\s*\)\s*\{', sc_start)]


def switch_body(src, at):
    i = src.index('{', at)
    return src[i + 1:match_brace(src, i) - 1]


# the "refuse" switch is the one containing "case SC_ADRENALINE:" with pc_check_weapontype, the value switch contains
# "case SC_ANGELUS:" with "val2 = 5*val1"
start_vals, start_checks = {}, {}
for at in switches:
    body = switch_body(sc_start, at)
    cases = switch_cases(body)
    if 'SC_ANGELUS' in cases and 'val2' in cases['SC_ANGELUS']:
        start_vals = cases
    elif 'SC_ADRENALINE' in cases and 'pc_check_weapontype' in cases['SC_ADRENALINE']:
        start_checks = cases
receiver_weapon_skill = {sc: m.group(1) for sc, code in start_checks.items()
                         for m in [re.search(r'skill_get_weapontype\(\s*(\w+)\s*\)', code)] if m}

# ---------------------------------------------------------------- status_calc_* functions
CALC = ['str', 'agi', 'vit', 'int', 'dex', 'luk', 'pow', 'sta', 'wis', 'spl', 'con', 'crt', 'batk', 'watk', 'critical', 'hit',
        'flee', 'flee2', 'def', 'def2', 'mdef', 'mdef2', 'patk', 'smatk', 'res', 'mres', 'hplus', 'crate', 'fix_aspd']
calc = {}
for name in CALC:
    params, body = function_body(status_cpp, 'status_calc_' + name)
    calc[name] = {'param': params[2], 'code': simplify(body)}
params, body = function_body(status_cpp, 'status_calc_aspd')
calc['aspd'] = {'param': 'fixed', 'code': simplify(body), 'returns': True}
for name, fn in (('attack_element', 'status_calc_attack_element'), ('element', 'status_calc_element'),
                 ('element_lv', 'status_calc_element_lv')):
    params, body = function_body(status_cpp, fn)
    calc[name] = {'param': params[2], 'code': simplify(body), 'returns': True}
params, body = function_body(status_cpp, 'status_calc_pseudobuff_matk')
calc['matk'] = {'param': params[2], 'code': simplify(body)}
for name in ('hpbonus', 'spbonus'):
    params, body = function_body(status_cpp, 'status_get_' + name)
    calc[name] = {'param': 'type', 'code': simplify(body), 'returns': True}
params, body = function_body(battle_cpp, 'battle_get_atkpercent')
calc['atkpercent'] = {'param': 'skill_id', 'code': simplify(body), 'returns': True}
# skill_vfcastfix: the block "if (sc != nullptr && !sc->empty() && !(flag&2)) { ... }"
_, vf = function_body(read(f'{SRC}/skill.cpp').replace('\r', ''), 'skill_vfcastfix')
vf = resolve_ifdefs(strip_comments(vf))
m = re.search(r'if\s*\(\s*sc\s*!=\s*nullptr\s*&&\s*!sc->empty\(\)\s*&&\s*!\(flag\s*&\s*2\)\s*\)\s*\{', vf)
i = vf.index('{', m.end() - 1)
calc['cast'] = {'param': 'time', 'code': simplify(vf[i + 1:match_brace(vf, i) - 1])}

def macro_calls(code, name):
    """yield (start, end, [args]) for NAME(...) calls with balanced parentheses"""
    for m in re.finditer(r'\b' + name + r'\s*\(', code):
        i = m.end(); depth = 1; args = []; cur = ''
        while i < len(code) and depth:
            c = code[i]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            if c == ',' and depth == 1:
                args.append(cur.strip()); cur = ''
            else:
                cur += c
            i += 1
        args.append(cur.strip())
        yield m.start(), i + 1, args


def expand_damage_macros(code):
    """battle.cpp ATK_* macros (they change their first argument) -> plain statements, right hand only"""
    forms = {
        'RE_ALLATK_ADDRATE': lambda a: ' '.join(f'{a[0]}.{p} += {a[0]}.{p} * ({a[1]}) / 100;' for p in ('statusAtk', 'weaponAtk', 'equipAtk', 'masteryAtk')),
        'RE_ALLATK_RATE': lambda a: ' '.join(f'{a[0]}.{p} = {a[0]}.{p} * ({a[1]}) / 100;' for p in ('statusAtk', 'weaponAtk', 'equipAtk', 'masteryAtk')),
        'RE_ALLATK_ADD': lambda a: ' '.join(f'{a[0]}.{p} += ({a[1]});' for p in ('statusAtk', 'weaponAtk', 'equipAtk', 'masteryAtk')),
        'ATK_ADDRATE2': lambda a: f'{a[0]} += {a[0]} * ({a[2]}) / 100;',
        'ATK_ADDRATE': lambda a: f'{a[0]} += {a[0]} * ({a[2]}) / 100;',
        'ATK_RATE2': lambda a: f'{a[0]} = {a[0]} * ({a[2]}) / 100;',
        'ATK_RATER': lambda a: f'{a[0]} = {a[0]} * ({a[1]}) / 100;',
        'ATK_RATEL': lambda a: ';',
        'ATK_RATE': lambda a: f'{a[0]} = {a[0]} * ({a[2]}) / 100;',
        'ATK_ADD2': lambda a: f'{a[0]} += ({a[2]});',
        'ATK_ADD': lambda a: f'{a[0]} += ({a[2]});',
    }
    for name, fn in forms.items():
        while True:
            calls = list(macro_calls(code, name))
            if not calls:
                break
            st, en, args = calls[0]
            rest = code[en:]
            rest = re.sub(r'^\s*;', '', rest)
            code = code[:st] + '{ ' + fn(args) + ' }' + rest
    return code


params, body = function_body(battle_cpp, 'battle_attack_sc_bonus')
calc['sc_bonus'] = {'param': 'skill_id', 'code': simplify(expand_damage_macros(body))}
params, body = function_body(battle_cpp, 'battle_calc_attack_skill_ratio')
m = re.search(r'if\s*\(\s*sc\s*&&\s*skill_id\s*!=\s*PA_SACRIFICE\s*\)\s*\{', body)
i = body.index('{', m.end() - 1)
calc['skillratio'] = {'param': 'skillratio', 'code': simplify(body[i + 1:match_brace(body, i) - 1])}

# battle_calc_damage: target statuses (Kaite, Raid, Dark Crow, Assumptio, Steel Body...) and the caster's final modifiers
params, body = function_body(battle_cpp, 'battle_calc_damage')
st = body.index('if( tsc != nullptr && !tsc->empty() ) {')
en = body.rindex('if (battle_config.pk_mode == 1 && map_getmapflag(bl->m, MF_PVP) > 0)')   # comments are stripped
seg = body[st:en]
rl = body.rindex('sc = status_get_sc(bl);')   # Relieve (target status again)
seg += '\n' + body[rl:body.index('if (bl->type == BL_MOB)', rl)]
calc['calc_damage'] = {'param': 'damage', 'code': simplify(seg)}

used_sc = set()
for c in calc.values():
    used_sc |= set(re.findall(r'\bSC_\w+', c['code']))
# SCs read by skill code (src/map/skills/**: ratio, element, hit rate) – e.g. Grenade Fragment, Dragonic Aura
skill_sc = set()
for dp, _, fs in os.walk(f'{SRC}/skills'):
    for f in fs:
        if f.endswith('.cpp'):
            skill_sc |= set(re.findall(r'(?:getSCE|hasSCE)\(\s*(SC_\w+)\s*\)', read(os.path.join(dp, f))))
# SCs whose effect is in the damage code (battle.cpp) rather than in the status: Power Thrust, EDP, Magnificat...
battle_sc = set(re.findall(r'\bt?sc->getSCE\(\s*(SC_\w+)\s*\)', battle_cpp)) - used_sc
for m in re.finditer(r'\bsc\.getSCE\(\s*(SC_\w+)', status_cpp):
    pass

# ---------------------------------------------------------------- skills that start an SC
def load(rel):
    p = f'{root}/{rel}'
    if not os.path.exists(p):
        return []
    return (yaml.load(open(p, encoding='utf-8'), Loader=Loader) or {}).get('Body') or []


skills = {}
for e in load('db/re/skill_db.yml') + load('db/import/skill_db.yml'):
    skills[e['Id']] = {**skills.get(e['Id'], {}), **e}
status_yml = {}
for e in load('db/re/status.yml') + load('db/import/status.yml'):
    status_yml['SC_' + e['Status'].upper()] = {**status_yml.get('SC_' + e['Status'].upper(), {}), **e}

# statuses these skills put on enemies (or with no player-side effect)
NOT_BUFF = {'AL_CRUCIS', 'AS_VENOMDUST', 'AS_CLOAKING', 'BA_FROSTJOKER', 'DC_DONTFORGETME', 'WZ_QUAGMIRE', 'NJ_SUITON', 'PA_GOSPEL',
            'GN_FIRE_EXPANSION_SMOKE_POWDER', 'GN_FIRE_EXPANSION_TEAR_GAS', 'HT_FLASHER', 'WM_MELODYOFSINK', 'WM_GLOOMYDAY',
            'GN_MANDRAGORA', 'SC_BODYPAINT', 'SC_INVISIBILITY', 'NC_INFRAREDSCAN', 'SU_HISS', 'SM_ENDURE', 'MO_STEELBODY',
            'SU_ARCLOUSEDASH', 'GC_HALLUCINATIONWALK', 'RA_CAMOUFLAGE', 'TR_GEF_NOCTURN', 'MI_HARMONIZE', 'SH_TEMPORARY_COMMUNION',
            'PR_STRECOVERY', 'RK_DRAGONHOWLING', 'WM_SATURDAY_NIGHT_FEVER', 'BD_ETERNALCHAOS', 'CG_MARIONETTE',
            'WM_BEYOND_OF_WARCRY', 'TR_AIN_RHAPSODY', 'SM_SELFPROVOKE'}
# skills whose cast code spreads the status over the party (party_foreachsamemap in src/map/skills/**) -> 'party'
party_skills = set()
for dp, _, fs in os.walk(f'{SRC}/skills'):
    for f in fs:
        if not f.endswith('.cpp'):
            continue
        src = read(os.path.join(dp, f))
        if 'party_foreachsamemap' not in src and 'party_foreach' not in src:
            continue
        for m in re.finditer(r'(Skill\w+)::\1\(\)\s*:\s*\w+\(\s*([A-Z0-9_]+)', src):
            party_skills.add(m.group(2))
# values the skill passes to sc_start (src/map/skills/**: castendNoDamageId / castendPos) -> expressions per val
skill_class_src = {}
for dp, _, fs in os.walk(f'{SRC}/skills'):
    for f in fs:
        if f.endswith('.cpp'):
            src = resolve_ifdefs(strip_comments(read(os.path.join(dp, f))))
            for m in re.finditer(r'(Skill\w+)::\1\(\)\s*:\s*\w+\(\s*([A-Z0-9_]+)', src):
                skill_class_src[m.group(2)] = (m.group(1), src)


def start_values(skill_name, sc):
    """[expr val1, expr val2, ...] from the first sc_start of the skill's own status, or None"""
    if skill_name not in skill_class_src:
        return None
    cls, src = skill_class_src[skill_name]
    for meth in ('castendNoDamageId', 'castendPos', 'castendNoDamagePos'):
        m = re.search(cls + r'::' + meth + r'\s*\(([^)]*)\)\s*(?:const\s*)?\{', src)
        if not m:
            continue
        i = src.index('{', m.end() - 1)
        body = src[i + 1:match_brace(src, i) - 1]
        for name in ('sc_start4', 'sc_start2', 'sc_start'):
            for st, en, args in macro_calls(body, name):
                if len(args) < 5:
                    continue
                t = args[2]
                if not (sc in t or 'skill_get_sc' in t or t.strip() == 'type'):
                    continue
                n = {'sc_start': 1, 'sc_start2': 2, 'sc_start4': 4}[name]
                vals = [simplify(a + ';')[:-1].strip() for a in args[4:4 + n]]
                # the code before the call computes local variables used in the values (rune mastery level, lesson...)
                prefix = simplify(body[:st])
                prefix = prefix[:max(prefix.rfind(';'), prefix.rfind('{'), prefix.rfind('}')) + 1]   # end at a statement
                # drop an unfinished "if (...)" / "else" right before the call and unbalanced braces
                prefix = re.sub(r'(?:\belse\b|\bif\s*\((?:[^()]|\([^()]*\))*\))\s*$', '', prefix.rstrip())
                depth = prefix.count('{') - prefix.count('}')
                prefix += '\n' + '}' * max(0, depth) if depth > 0 else ''
                code = prefix + '\n' + ' '.join(f'__v{k + 1} = ({v});' for k, v in enumerate(vals))
                return vals, code
    return None


# skills typed as attacks whose status goes on the caster
SELF_STATUS_ATTACK = {'CR_REFLECTSHIELD', 'SM_MAGNUM', 'DK_DRAGONIC_AURA'}
buffs = {}
for e in skills.values():
    st = e.get('Status')
    if not st:
        continue
    sc = 'SC_' + st.upper()
    target = e.get('TargetType', 'Passive')
    if target not in ('Self', 'Support', 'Ground'):
        continue
    # player skills only (no monster / mercenary / homunculus / elemental skills), no damage skills
    if re.match(r'(NPC|MER|MH|HAMI|HFLI|HLIF|HVAN|MS|MA|ML|EL|CASH|GD)_', e['Name']) or e['Name'] in NOT_BUFF:
        continue
    if e.get('Type') in ('Weapon', 'Magic', 'Misc') and not (e.get('DamageFlags') or {}).get('NoDamage') \
            and e['Name'] not in SELF_STATUS_ATTACK:
        continue                                            # damage skills (Storm Gust, Grand Cross...)
    in_battle = sc in battle_sc or sc in skill_sc
    if sc not in used_sc and not in_battle and not (status_yml.get(sc, {}).get('Script')):
        continue
    if target == 'Ground' and not e.get('Unit'):
        continue
    req = e.get('Requires') or {}
    splash = e.get('SplashArea')
    flags = e.get('Flags') or {}
    kind = 'support' if target == 'Support' else 'party' if (target == 'Ground' or flags.get('IsSong') or flags.get('IsEnsemble')
                                                           or e['Name'] in party_skills) else 'self'
    rec = {'sc': sc, 'name': e.get('Description', e['Name']), 'maxLv': e.get('MaxLevel', 1), 'kind': kind, 'target': target,
           'effect': 'status' if sc in used_sc else 'script' if status_yml.get(sc, {}).get('Script')
           else 'battle' if sc in battle_sc else 'skill'}
    if req.get('Weapon'):
        rec['weapons'] = sorted(k for k, v in req['Weapon'].items() if v)
    if req.get('SpiritSphereCost'):
        rec['spheres'] = req['SpiritSphereCost']
    if status_yml.get(sc, {}).get('Script'):
        rec['script'] = status_yml[sc]['Script'].strip()
    sv = start_values(e['Name'], sc)
    if sv and sv[0] != ['skill_lv']:
        rec['vals'] = sv[0]
        rec['valsCode'] = sv[1]
    buffs[e['Name']] = rec

# debuffs a player puts on monsters: statuses that change the target's stats (status_calc_* code), grouped by status
# area skills that hit enemies although their target type is Self, and statuses that are the caster's own
ENEMY_AREA = {'RK_DRAGONHOWLING', 'AL_CRUCIS', 'BD_ETERNALCHAOS', 'DC_DONTFORGETME', 'WM_MELODYOFSINK', 'TR_AIN_RHAPSODY',
              'TR_GEF_NOCTURN', 'WM_BEYOND_OF_WARCRY', 'WM_SATURDAY_NIGHT_FEVER', 'AB_ORATIO'}
SELF_ONLY_SC = {'SC_FLASHCOMBO', 'SC_ZENKAI', 'SC_WILD_WALK', 'SC_T_FIFTH_GOD', 'SC_SKE', 'SC_SKA'}
NOT_DEBUFF_SC = {'SC_STUN', 'SC_FREEZE', 'SC_STONE', 'SC_SLEEP', 'SC_BURNING', 'SC_POISON', 'SC_FREEZING', 'SC_CURSE'}
debuffs = {}
for e in skills.values():
    st = e.get('Status')
    if not st or re.match(r'(NPC|MER|MH|HAMI|HFLI|HLIF|HVAN|MS|MA|ML|EL|CASH|GD)_', e['Name']):
        continue
    sc = 'SC_' + st.upper()
    if (e['Name'] in buffs and e['Name'] not in ENEMY_AREA) or (sc not in used_sc and sc not in battle_sc) or sc in NOT_DEBUFF_SC:
        continue
    if e.get('TargetType') not in ('Attack', 'Ground') and e['Name'] not in ENEMY_AREA:
        continue
    if sc in SELF_ONLY_SC:
        continue
    d = debuffs.setdefault(sc, {'sc': sc, 'skills': [], 'maxLv': 1})
    nodmg = (e.get('DamageFlags') or {}).get('NoDamage') or not e.get('Type')
    d['skills'].append(e['Name'])
    if nodmg and 'name' not in d or 'name' not in d:
        d['name'] = e.get('Description', e['Name']); d['skill'] = e['Name']
    d['maxLv'] = max(d['maxLv'], e.get('MaxLevel', 1))

for n in ENEMY_AREA:
    if n in buffs and any(n in d['skills'] for d in debuffs.values()):
        buffs.pop(n)                                        # an enemy-area status (Oratio): a monster debuff, not a buff
out = {
    'start': {sc: simplify(code) + ';' for sc, code in start_vals.items()},
    'refuse': {sc: simplify(code) for sc, code in start_checks.items() if any(b['sc'] == sc for b in buffs.values())},
    'receiverWeaponSkill': receiver_weapon_skill,
    'calc': calc,
    'buffs': buffs,
    'debuffs': debuffs,
    'skillMax': {e['Name']: e.get('MaxLevel', 1) for e in skills.values()},
    # element per level for skills that put an element on (Elemental Converters: ITEM_ENCHANTARMS)
    'skillEle': {e['Name']: ([x.get('Element') for x in e['Element']] if isinstance(e.get('Element'), list) else e.get('Element'))
                 for e in skills.values() if e.get('Element') and e['Name'] in buffs},
    'skillWeapons': {e['Name']: sorted(k for k, v in ((e.get('Requires') or {}).get('Weapon') or {}).items() if v)
                     for e in skills.values() if (e.get('Requires') or {}).get('Weapon')},
}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print('debuff skills', len(debuffs), '| buffs with own sc_start values', sum(1 for b in buffs.values() if 'vals' in b), '| party skills', len(party_skills), '| calc functions', len(calc), '| SCs used in calc code', len(used_sc), '| SC start cases', len(out['start']),
      '| buff skills', len(buffs))
