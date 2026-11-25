#!/usr/bin/env python3
"""
Buff consumables (potions, foods, scrolls...) from the server item_db, as the game applies them.

Usage: python build_consumables.py <server_dir> <out_dir> [items_all.json]
  <server_dir>      folder with db/re/item_db_usable.yml, db/re/status.yml (+ db/import/item_db.yml, db/import/status.yml)
  items_all.json    RO GGT client item info: client name, icon resource and Thai description (inGame = item exists there)

For each usable item the script looks at:
  sc_start / sc_start2 / sc_start4 SC_X,<time>,<val1>,...  -> the bonus script of SC_X in status.yml with
                                                               getstatus(SC_X, n) replaced by val n
  bonus_script "{ ... }",<seconds>                          -> the bonuses inside
  itemskill SKILL,<lv>                                      -> a buff from calc/buffs.js (Blessing, Increase AGI...)
and a few status changes that status.cpp handles in code (ASPD potions, INCALLSTATUS, INCHIT...).
Items whose effects are only regen / speed / exp / drop are left out.

Output data/consumables.json:
  { "<item id>": { "name", "res", "effects": [ { "group": "SC_STRFOOD", "value": 10, "script": "bonus bStr,10;" }
                                              | { "group": ..., "buff": "AL_BLESSING", "lv": 10 }
                                              | { "group": ..., "sc": { "aspdPotion": 9 } } ] } }
Effects with the same group do not stack (the game keeps one); the engine keeps the highest value.
"""
import json
import os
import re
import sys

import yaml

server, out_dir = sys.argv[1], sys.argv[2]
client = {}
if len(sys.argv) > 3:
    with open(sys.argv[3], encoding='utf-8') as f:
        client = json.load(f)


def load(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        return (yaml.safe_load(f) or {}).get('Body') or []


items = {}
for p in ('db/re/item_db_usable.yml', 'db/import/item_db.yml'):
    for e in load(os.path.join(server, p)):
        if 'Id' in e:
            items[e['Id']] = {**items.get(e['Id'], {}), **e}
status = {}
for p in ('db/re/status.yml', 'db/import/status.yml'):
    for e in load(os.path.join(server, p)):
        if e.get('Status'):
            status['SC_' + e['Status'].upper()] = {**status.get('SC_' + e['Status'].upper(), {}), **e}

# status changes implemented in status.cpp / battle.cpp code instead of status.yml scripts
# status changes implemented in status.cpp / battle.cpp code instead of a status.yml script: the engine (calc/sc.js)
# runs the server code for them, so they are passed on as { sc, vals }
CODE_SC = {'SC_INCALLSTATUS', 'SC_INCHIT', 'SC_INCFLEE', 'SC_INCHITRATE', 'SC_INCFLEERATE', 'SC_INCMATKRATE', 'SC_INCMHPRATE',
           'SC_INCMSPRATE', 'SC_INCATKRATE', 'SC_INCCRI', 'SC_INCDEFRATE', 'SC_ASPDPOTION0', 'SC_ASPDPOTION1', 'SC_ASPDPOTION2',
           'SC_ASPDPOTION3', 'SC_BLESSING', 'SC_INCREASEAGI', 'SC_ADRENALINE', 'SC_GLORIA', 'SC_ANGELUS', 'SC_CONCENTRATE',
           'SC_ASSUMPTIO', 'SC_KYRIE', 'SC_WINDWALK', 'SC_INCMHP', 'SC_INCMSP', 'SC_INCFLEE2', 'SC_WEDDING', 'SC_BENEDICTIO',
           'SC_ASPERSIO', 'SC_WATERWEAPON', 'SC_ARMOR_ELEMENT_FIRE', 'SC_ANCILLA'}
# itemskill -> buff in calc/buffs.js
# itemskill -> any skill that starts a status change (skill_db Status); calc/sc.js decides what it does
SC_OF_SKILL = {}
for e in load(os.path.join(server, 'db/re/skill_db.yml')) + load(os.path.join(server, 'db/import/skill_db.yml')):
    if e.get('Status') and e.get('TargetType') in ('Self', 'Support', 'Ground'):
        SC_OF_SKILL[e['Name']] = 'SC_' + e['Status'].upper()
ITEMSKILL = set(SC_OF_SKILL)
# bonuses that do not change damage / defense numbers
NON_COMBAT = {'bSpeedRate', 'bExpAddRace', 'bExpAddClass', 'bDropAddRace', 'bDropAddClass', 'bHPrecovRate', 'bSPrecovRate',
              'bHPRecovRate', 'bRegenPercentHP', 'bRegenPercentSP', 'bHPRegenRate', 'bSPRegenRate', 'bAddItemHealRate',
              'bAddItemGroupHealRate', 'bResEff', 'bUseSPrate', 'bHealPower', 'bHealPower2', 'bHPLossRate', 'bSPLossRate',
              'bNoWalkDelay', 'bNoCastCancel', 'bAddMonsterDropItem', 'bNoGemStone', 'bSPDrainRate', 'bHPDrainRate',
              'bAddDefMonster', 'bShortWeaponDamageReturn', 'bMagicDamageReturn', 'bIntravision', 'bNoKnockback'}

NUM = r'-?\d+'


def num_args(s):
    out = []
    for a in s.split(','):
        a = a.strip()
        if re.fullmatch(NUM, a):
            out.append(int(a))
        else:
            out.append(None)
    return out


def resolve_status_script(sc, vals):
    src = status[sc]['Script']
    def rep(m):
        name, n = m.group(1), m.group(2)
        if name != sc:
            return '0'
        idx = int(n) - 1 if n else 0
        return str(vals[idx] if idx < len(vals) and vals[idx] is not None else 0)
    return re.sub(r'getstatus\s*\(\s*(SC_\w+)\s*(?:,\s*(\d+))?\s*\)', rep, src).strip()


def combat_relevant(script):
    names = re.findall(r'\bbonus\d?\s+(b\w+)', script)
    return any(n not in NON_COMBAT for n in names)


def conditions_at(script, pos):
    """conditions of the if-statements that contain position pos (eaclass() checks on rune stones, level checks...)"""
    conds = []
    for m in re.finditer(r'\bif\s*\(', script):
        if m.start() > pos:
            break
        i = m.end(); depth = 1
        while i < len(script) and depth:
            depth += {'(': 1, ')': -1}.get(script[i], 0); i += 1
        cond = script[m.end():i - 1]
        j = i
        while j < len(script) and script[j] in ' \t\r\n':
            j += 1
        if j < len(script) and script[j] == '{':
            d = 0; k = j
            while k < len(script):
                d += {'{': 1, '}': -1}.get(script[k], 0); k += 1
                if d == 0:
                    break
            end = k
        else:
            end = script.find(';', j) + 1
        if j <= pos < end:
            conds.append(cond.strip())
    return conds


MANUAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'consumables_manual.json'), encoding='utf-8'))
WL = set(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'consumables_whitelist.json')))['ids'])
out = {}
for iid, e in sorted(items.items()):
    script = e.get('Script') or ''
    if (not script and iid not in WL) or 'mercenary_sc_start' in script:
        continue
    effects = []
    for m in re.finditer(r'\bsc_start([24]?)\s+(SC_\w+)\s*,([^;]*);', script):
        kind, sc, args = m.group(1), m.group(2), num_args(m.group(3))
        # sc_start: type,tick,val1[,rate,flag]   sc_start2: type,tick,v1,v2[,rate]   sc_start4: type,tick,v1..v4
        n = {'': 1, '2': 2, '4': 4}[kind]
        vals = (args[1:1 + n] + [0] * 4)[:4]
        if sc in CODE_SC and vals[0] is not None:
            eff = {'sc': sc, 'vals': [v or 0 for v in vals]}
        elif sc in status and status[sc].get('Script'):
            s = resolve_status_script(sc, vals)
            if not combat_relevant(s) and iid not in WL:
                continue
            eff = {'script': s}
        else:
            continue
        group = 'SC_ASPDPOTION' if sc.startswith('SC_ASPDPOTION') else sc   # the four potions share one slot
        c = conditions_at(script, m.start())
        effects.append({'group': group, 'value': vals[0] or 0, **eff, **({'cond': ' && '.join(f'({x})' for x in c)} if c else {})})
    for m in re.finditer(r'\b(?:itemskill|unitskilluseid\s+getcharid\(3\)\s*,)\s*"?(\w+)"?\s*,\s*(\d+)', script):
        if m.group(1).startswith('NPC_'):
            continue
        if m.group(1) in ITEMSKILL:
            c = conditions_at(script, m.start())
            effects.append({'group': SC_OF_SKILL[m.group(1)], 'value': int(m.group(2)), 'buff': m.group(1), 'lv': int(m.group(2)),
                            **({'cond': ' && '.join(f'({x})' for x in c)} if c else {})})
    for m in re.finditer(r'\bbonus_script\s+"((?:[^"\\]|\\.)*)"\s*,\s*(\d+)', script):
        inner = m.group(1).strip().strip('{}').strip()
        if combat_relevant(inner) or iid in WL:
            effects.append({'group': f'bonus_script:{iid}', 'value': 1, 'script': inner, 'seconds': int(m.group(2))})
    if effects or iid in WL:
        rec = {'name': e.get('Name'), 'aegis': e.get('AegisName'), 'effects': effects}
        j = e.get('Jobs')                      # same format as items.json: list, or { all, except }
        if j and not j.get('All'):
            rec['jobs'] = sorted(k for k, v in j.items() if v)
        elif j:
            ex = sorted(k for k, v in j.items() if v is False)
            if ex:
                rec['jobs'] = {'all': True, 'except': ex}
        cls = sorted(k for k, v in (e.get('Classes') or {}).items() if v)
        if cls and cls != ['All']:
            rec['classes'] = cls
        if e.get('EquipLevelMin'):
            rec['elv'] = e['EquipLevelMin']
        c = client.get(str(iid))
        if c:
            rec['name'] = c.get('identifiedDisplayName') or rec['name']
            rec['res'] = c.get('identifiedResourceName')
            desc = [re.sub(r'\^[0-9a-fA-F]{6}', '', x).strip() for x in (c.get('identifiedDescriptionName') or {}).values()]
            rec['desc'] = [x for x in desc if x and x != '_']
            rec['inGame'] = iid in WL          # the sim lists only the user's chosen consumables
        if not effects and str(iid) in MANUAL:
            rec['effects'] = MANUAL[str(iid)]
        rec['inGame'] = iid in WL
        out[str(iid)] = rec

os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, 'consumables.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
groups = {}
for v in out.values():
    for x in v['effects']:
        groups[x['group']] = groups.get(x['group'], 0) + 1
print('buff consumables', len(out), '| in GGT client', sum(1 for v in out.values() if v.get('inGame')), '| groups', len(groups))
