"""Enchants done by NPC scripts (not in item_enchant.yml) -> merged into data/enchants.json

Run after build_enchants.py.  usage: build_npc_enchants.py <server root (with npc/)> <data dir>

Every system is read from the server's own NPC script (exact item ids), one handler per system,
and checked by hand against iRO Wiki (https://irowiki.org/wiki/Enchantment).  Slot numbers are card
slots 0-3 like item_enchant.yml.  Items that already have an item_enchant.yml table keep that table.
"""
import json, os, re, sys

root, data = sys.argv[1:3]
NPC = os.path.join(root, 'npc')
items_json = json.load(open(os.path.join(data, 'items.json'), encoding='utf-8'))
ENCH = {int(k) for k, v in items_json.items() if v.get('sub') == 'Enchant'}
path = os.path.join(data, 'enchants.json')
out = json.load(open(path, encoding='utf-8'))
defs, items = out['defs'], out['items']
# drop what an earlier run of this script added
for k in [k for k in defs if k.startswith('npc:')]:
    del defs[k]
for k in [k for k, v in items.items() if v.startswith('npc:')]:
    del items[k]


def read(rel):
    txt = open(os.path.join(NPC, rel), encoding='utf-8', errors='replace').read()
    return '\n'.join(re.sub(r'//.*', '', l) for l in txt.split('\n'))


def block(txt, npc):
    """text of one NPC (from its header line to the next header)"""
    i = txt.index('\tscript\t' + npc) if ('\tscript\t' + npc) in txt else txt.index(npc)
    m = re.search(r'\n\S[^\n]*\t(?:script|duplicate\([^)]*\))\t', txt[i + 1:])
    return txt[i: i + 1 + m.start()] if m else txt[i:]


def ids(s):
    return [int(x) for x in re.findall(r'\b(\d{4,6})\b', s)]


CARDLIKE = ENCH | {int(k) for k, v in items_json.items() if v.get('type') == 'Card'}


def ench(lst):
    seen, res = set(), []
    for x in lst:
        if x in CARDLIKE and x not in seen:
            seen.add(x)
            res.append(x)
    return res


def cases(s):
    return [int(x) for x in re.findall(r'case\s+(\d{4,6})\s*:', s)]


stats = []


def add(key, name, src, targets, slots, min_refine=0, note='', override=False, random_options=True, free=False):
    """slots: {card index: [enchant ids]} in enchant order (first enchanted slot first)"""
    slots = {str(k): ench(v) for k, v in slots.items() if ench(v)}
    if not slots:
        return
    d = {'minRefine': min_refine, 'minGrade': 0, 'randomOptions': random_options,
         'order': [int(k) for k in slots], 'slots': slots, 'name': name, 'src': src}
    if note:
        d['note'] = note
    if free:
        d['free'] = True       # slots are independent (no fill order)
    did = 'npc:' + key
    defs[did] = d
    n = 0
    for t in targets:
        t = str(t)
        if t in items_json and (override or t not in items):   # item_enchant.yml wins over rAthena NPCs, GGT pages win over both
            items[t] = did
            n += 1
    stats.append((did, n, {k: len(v) for k, v in slots.items()}))


# ---------------------------------------------------------------- Temporal Boots (Old Glast Heim)
f = 'merchants/OldGlastHeim_merchants_re.txt'
t = read(f)
for npc, key in (("Hugin's Magician", 'temporal_boots'), ('Dark magic master', 'temporal_boots_slot')):
    b = block(t, npc)
    lv = [x for n in range(1, 5) for x in ids(re.search(r'setarray \.@enchant_%d\[0\],([^;]+);' % n, b).group(1))]
    special = ids(re.search(r'F_Rand",([^)]+)\)', b).group(1))
    add(key, 'Temporal Boots', f + ' / ' + npc, cases(b), {3: lv, 2: special},
        note='ช่อง 4: เลือกสาย อัพ Lv1-4 / ช่อง 3: สุ่มเอฟเฟกต์พิเศษ')

# ---------------------------------------------------------------- Malangdo weapons (Mayomayo)
f = 'merchants/enchan_mal_re.txt'
t = read(f)
pool = [x for x in ids(' '.join(re.findall(r'\.@enchant = (\d+);', t))) if x != 9]
by_limit = {}
for iid, lim in re.findall(r'case (\d+): callsub L_Socket,\d,(\d);', t):
    by_limit.setdefault(int(lim), []).append(int(iid))
for lim, tg in by_limit.items():
    sl = {3: pool, 2: pool} if lim == 2 else {3: pool}
    add('malangdo_%d' % lim, 'Malangdo', f, tg, sl, note='สุ่มจากเกรดเหรียญที่ใช้ (Malangdo)')

# ---------------------------------------------------------------- other rAthena enchant NPCs (generic reader)
# Pools are read from the NPC's own code: per target item when the script lists enchants under
# "case <item id>:", per equip position when it lists them under "case EQI_*:", else one pool for the NPC.
# The enchantable slots per NPC were read by hand from each script (where it writes .@card[n] / getitem2).
LOC = {'EQI_HAND_R': ('Right_Hand', 'Both_Hand'), 'EQI_HAND_L': ('Left_Hand',), 'EQI_ARMOR': ('Armor',),
       'EQI_SHOES': ('Shoes',), 'EQI_GARMENT': ('Garment',), 'EQI_ACC_R': ('Right_Accessory', 'Both_Accessory'),
       'EQI_ACC_L': ('Left_Accessory', 'Both_Accessory'), 'EQI_HEAD_TOP': ('Head_Top',), 'EQI_HEAD_MID': ('Head_Mid',),
       'EQI_HEAD_LOW': ('Head_Low',), 'EQI_COSTUME_HEAD_TOP': ('Costume_Head_Top',),
       'EQI_COSTUME_HEAD_MID': ('Costume_Head_Mid',), 'EQI_COSTUME_HEAD_LOW': ('Costume_Head_Low',),
       'EQI_COSTUME_GARMENT': ('Costume_Garment',)}
ISEQ = lambda i: str(i) in items_json and items_json[str(i)].get('type') in ('Weapon', 'Armor', 'ShadowGear')


def sections(b, rx):
    """[(labels, text)] split at runs of `case <label>:` lines matching rx"""
    out, labels, buf, in_run = [], [], [], False
    for ln in b.split('\n'):
        m = re.match(r'\s*case\s+(%s)\s*:' % rx, ln)
        if m:
            if not in_run:
                if labels:
                    out.append((labels, '\n'.join(buf)))
                labels, buf = [], []
            labels.append(m.group(1))
            in_run = True
            rest = ln[m.end():]
            buf.append(rest)
        else:
            in_run = False
            buf.append(ln)
    if labels:
        out.append((labels, '\n'.join(buf)))
    return out


def strict(lst):
    return [x for x in ench(lst) if x in ENCH]


def slot_regions(b):
    """{card index: pool} when the script picks a list per empty slot:
    if (.@card[3] == 0) { ...list... } else if (.@card[2] == 0) { ...list... }"""
    regs, cur = {}, None
    for ln in b.split('\n'):
        m = re.search(r'\bif\s*\(\s*\.@\w*card\w*\[\s*([0-3])\s*\]\s*(?:==\s*0|<\s*1)', ln)
        if m:
            cur = int(m.group(1))
            regs.setdefault(cur, [])
            ln = ln[m.end():]
        if cur is not None:
            regs[cur] += strict(ids(ln))
    regs = {k: list(dict.fromkeys(v)) for k, v in regs.items()}
    keys = sorted(regs, reverse=True)
    if len(keys) < 2 or any(not regs[k] for k in keys[:-1]) or not regs[keys[-1]]:
        return None
    return regs


def slot_arrays(b):
    """{card index: pool} from arrays named per slot (.@enchant_slot2[...]) and fixed combos
    (setarray .@enchants[1], a, b, c;  -> cards 1, 2, 3).  None when the script has neither."""
    regs = {}
    for n, body in re.findall(r'setarray\s+\.@\w*slot_?(\d)\w*\[\s*0\s*\]\s*,([^;]+);', b):
        regs.setdefault(int(n), []).extend(strict(ids(body)))
    for start, body in re.findall(r'setarray\s+\.@enchants\[\s*(\d)\s*\]\s*,([^;]+);', b):
        for k, part in enumerate(body.split(',')):
            v = strict(ids(part))
            if v:
                regs.setdefault(int(start) + k, []).extend(v)
    regs = {k: list(dict.fromkeys(v)) for k, v in regs.items() if v and 0 <= k <= 3}
    return regs if len(regs) >= 2 else None


def generic(key, name, rel, npc, slots, note=''):
    b = block(read(rel), npc)
    reg = slot_regions(b) or slot_arrays(b)
    if reg:
        tg = sorted({x for x in cases(b) if ISEQ(x)} or {x for x in ids(b) if ISEQ(x)})
        add(key, name, rel + ' / ' + npc, tg, {k: reg[k] for k in sorted(reg, reverse=True)},
            note='แต่ละช่องสุ่มคนละรายการ (อ่านจากสคริปต์)')
        print('   per-slot:', key, {k: len(v) for k, v in reg.items()})
        return
    pool_all = strict(ids(b))
    per_item = [(lab, strict(ids(txt))) for lab, txt in sections(b, r'\d{4,6}')]
    per_item = [([int(x) for x in lab if ISEQ(int(x))], en) for lab, en in per_item]
    covered = {e for lab, en in per_item if lab for e in en}
    targets = sorted({x for lab, en in per_item for x in lab} or {x for x in ids(b) if ISEQ(x)})
    n0 = len(stats)
    if sum(1 for lab, en in per_item if lab and en) >= 2 and len(covered) * 2 >= len(pool_all):
        for k, (lab, en) in enumerate(per_item):
            if lab and en:
                add('%s:%d' % (key, k), name, rel + ' / ' + npc, lab, {s: en for s in slots}, note=note)
    else:
        per_loc = [(lab, strict(ids(txt))) for lab, txt in sections(b, r'EQI_\w+')]
        per_loc = [(lab, en) for lab, en in per_loc if en]
        if len(per_loc) >= 2:
            for k, (lab, en) in enumerate(per_loc):
                locs = {l for e in lab for l in LOC.get(e, ())}
                tg = [t for t in targets if set(items_json[str(t)].get('loc', [])) & locs]
                add('%s:%s' % (key, '+'.join(lab)), name, rel + ' / ' + npc, tg, {s: en for s in slots}, note=note)
        else:
            add(key, name, rel + ' / ' + npc, targets, {s: pool_all for s in slots}, note=note)
    if len(stats) == n0:
        print('!! nothing from', key)


R = 'รายการรวมจากสคริปต์ NPC (บางระบบแต่ละช่องสุ่มได้ไม่เท่ากัน)'
for key, name, rel, npc, slots in [
    ('bio4', 'Bio4 (Sorcerer)', 'merchants/bio4_reward_re.txt', 'Sorcerer#Bio4Reward', [3, 2]),
    ('illusion', 'Illusion Dungeons', 'merchants/enchan_illusion_dungeons_re.txt', 'Illusion Enchanter#0', [3, 2]),
    ('illusion_17_1', 'Illusion (17.1)', 'merchants/enchan_illusion_17_1_re.txt', 'RS26#illusion_enchant', [3, 2, 1]),
    ('sarah', 'Sarah', 'instances/SarahAndFenrir/instance_re.txt', 'Assistant Professor#a1', [3, 2]),
    ('poring_village', 'Poring Village', 'instances/PoringVillage/instance_re.txt', 'Veggie Enchanter#0', [3]),
    ('academy', 'Academy (Almond)', 'jobs/novice/academy_re.txt', 'Enchanter Almond J#iz', [3, 2]),
    ('arm', 'Apprentice Craftsman', 'merchants/enchan_arm.txt', 'Apprentice Craftsman', [2]),
    ('edda_half_moon', 'Edda Half Moon', 'merchants/enchan_edda_half_moon_re.txt', 'Temple Item Manager#0hmoon', [3]),
    ('ninja', 'Ninja Gear (Tene)', 'merchants/enchan_ko_re.txt', 'Artisan Tene#ko', [3, 2]),
    ('mora_relics', 'Mora (Master of Relics)', 'merchants/enchan_mora_re.txt', 'Master of Relics#pa0829', [3, 2, 1]),
    ('mora_crafter', 'Mora (Artifact Crafter)', 'merchants/enchan_mora_re.txt', 'Artifact Crafter#pa0829', [3, 2, 1]),
    ('sage_legacy', 'Sage Legacy', 'merchants/enchan_sage_legacy_17_2_re.txt', 'Lisa#ep172_merchant', [3]),
    ('devil_prq', 'Devil Enchant', 'merchants/enchan_upg_re.txt', 'Devil Enchant Master#prq', [3]),
    ('horror_toy', 'Horror Toy Factory', 'merchants/HorrorToyFactory_merchants_re.txt', 'Black Beard Joe#pa0829', [3, 2, 1]),
    ('costume_garment', 'Malangdo Costume (Lace La Zard)', 'merchants/malangdo_costume_re.txt', 'Lace La Zard#cos_ect', [0]),
    ('moro_cave', 'Moro Cave (Byrnes)', 'merchants/moro_cav_exchange_re.txt', 'Expert Enchanter Byrnes', [3, 2, 1, 0]),
    ('nightmare_biolab', 'Nightmare Biolab', 'merchants/nightmare_biolab_re.txt', 'Wandering Mind#JCv2', [3, 2, 1]),
    ('odin', 'Odin (Susan Grey)', 'merchants/odin_enchanter_re.txt', 'Susan Grey#odin', [3, 2, 1]),
    ('eden_luhir', 'Eden (Dark Luhir)', 'quests/eden/eden_iro_re.txt', 'Dark Luhir#new10', [3, 2, 1]),
    ('eden_thorn', 'Eden weapons (Thorn)', 'quests/eden/eden_quests_re.txt', 'Blacksmith Thorn#2nd10', [3, 2]),
    ('ep16_dylan', 'Ep16.1 (Dylan)', 'quests/episodes/ep16_1/quests_re.txt', 'Dylan#pa0829', [3, 2, 1, 0]),
    ('ep16_hogar', 'Ep16.2 (Hogar)', 'quests/episodes/ep16_2/quests_re.txt', 'Hogar#pa0829', [3, 2]),
    ('dewata', 'Dewata (Gatti)', 'quests/towns/dewata/quests_re.txt', 'Gatti#weapon', [3, 2]),
    ('dicastes', 'El Dicastes', 'quests/towns/dicastes/quests_re.txt', 'dic_enc#main', [3, 2, 1, 0]),
    ('eclage_hiel', 'Eclage (Hiel)', 'quests/towns/eclage/quests_re.txt', 'Hiel#pa0829', [3, 2]),
    ('fallen_angel', 'Fallen Angel Wing', 'quests/towns/malangdo/quests_re.txt', 'Fallen Angel#mal', [3]),
    ('rwc', 'RWC Accessory', 'events/RWC_2012.txt', 'Goldberg#pron', [3, 2, 1]),
]:
    try:
        generic(key, name, rel, npc, slots, R)
    except (ValueError, OSError) as ex:
        print('!! skip', key, ex)

# ---------------------------------------------------------------- per-slot readers (slot pools differ)
# Edda Biolab (Lavian): .@e4 -> slot 4 (card 3), .@e3 -> slot 3 (card 2)
f = 'instances/EddaBioLab/instance_re.txt'
b = block(read(f), 'Lavian#edda_bl')
arr = lambda n: ids(re.search(r'setarray \.@%s\s*,([^;]+);' % n, b).group(1))
add('edda_biolab', 'Edda Biolab', f + ' / Lavian', [x for x in arr('w') if ISEQ(x)], {3: arr('e4'), 2: arr('e3')},
    note='ช่อง 4: Expert/FS/Sharp/Spell / ช่อง 3: Memory ตามอาชีพ')
# Infinite Space (Artifact Enhancer): per position "slot 4 pool", "slot 3 pool"
f = 'merchants/InfiniteSpace_merchants_re.txt'
b = block(read(f), 'Artifact Enhancer#pa0829_01')
tg = [x for x in ids(b) if ISEQ(x)]
for lab, txt in sections(b, r'EQI_\w+'):
    m = re.search(r'setarray \.@enchant\$\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"', txt)
    if not m:
        continue
    locs = {l for e in lab for l in LOC.get(e, ())}
    add('infinite_space:' + '+'.join(lab), 'Infinite Space', f, [t for t in tg if set(items_json[str(t)].get('loc', [])) & locs],
        {3: strict(ids(m.group(1))), 2: strict(ids(m.group(2)))}, note='ช่อง 4 และ 3 สุ่มคนละรายการ')

# ---------------------------------------------------------------- Malangdo costume stones (Aver De Dosh): stones go in by position
# card 0 = upper stones, card 1 = middle stones, card 2 = lower stones; an upper costume takes all three,
# a middle costume takes middle + lower, a lower costume only lower (as the script's menus allow).
f = 'merchants/malangdo_costume_re.txt'
b = block(read(f), 'Aver De Dosh#cos_ect')
i_sw = b.index('switch(.@slot)')
pools = {}
for lab, txt in sections(b[i_sw:], r'[0-2]'):
    en = strict(ids(txt))
    for l in lab:
        if en and int(l) not in pools:
            pools[int(l)] = en
parts = {}
for lab, txt in sections(b[:i_sw], r'EQI_COSTUME_HEAD_\w+'):
    for l in lab:
        parts.setdefault(l, []).extend(x for x in cases(txt) if ISEQ(x))
SLOTS_BY_PART = {'EQI_COSTUME_HEAD_TOP': [0, 1, 2], 'EQI_COSTUME_HEAD_MID': [1, 2], 'EQI_COSTUME_HEAD_LOW': [2]}
for part, tg in parts.items():
    sl = {k: pools.get(k, []) for k in SLOTS_BY_PART.get(part, [])}
    add('costume:' + part, 'Malangdo Costume', f + ' / Aver De Dosh', tg, sl,
        note='หินลงตามตำแหน่ง: ช่อง 1 = หินบน, ช่อง 2 = หินกลาง, ช่อง 3 = หินล่าง', free=True)
print('   costume pools', {k: len(v) for k, v in pools.items()}, {k: len(v) for k, v in parts.items()})

# ---------------------------------------------------------------- Mora (Artifact Researcher): random ladder, the slot picks the rand() range
# case <item>: callsub L_Socket,<type>,<bonus type>,<4-x slots>;  each type: if (.@slot == 4) set .@i, rand(lo,hi); ...
#   if (.@i < T) set .@enchant,<id>;  -> an enchant can come out in a slot when its ladder step overlaps that slot's range
f = 'merchants/enchan_mora_re.txt'
b = block(read(f), 'Artifact Researcher#new')
i_sw = b.index('switch(.@enchant_type)')
type_pool = {}
for lab, txt in sections(b[i_sw:], r'\d{1,2}'):
    rng = {int(sl): (int(lo), int(hi)) for sl, lo, hi in re.findall(r'\.@slot == (\d)\) set \.@i, rand\((\d+),(\d+)\)', txt)}
    ladder, prev = [], 0
    for t, e in re.findall(r'\.@i < (\d+)\) set \.@enchant,(\d+);', txt):
        ladder.append((prev, int(t) - 1, int(e)))
        prev = int(t)
    if not ladder:
        continue
    pools = {}
    for sl, (lo, hi) in rng.items():
        pools[sl] = strict([e for a, z, e in ladder if a <= hi and z >= lo])
    for l in lab:
        type_pool.setdefault(int(l), pools)
for iid, ty, bonus, allowed in re.findall(r'case (\d+): callsub L_Socket,(\d+),(\d+),(\d);', b):
    tp, bp = type_pool.get(int(ty), {}), type_pool.get(int(bonus), {})
    sl = {s - 1: list(dict.fromkeys(tp.get(s, []) + bp.get(s, []))) for s in (4, 3, 2) if int(allowed) < s}
    add('mora_research_' + iid, 'Mora (Artifact Researcher)', f, [int(iid)], sl, note='แต่ละช่องสุ่มคนละช่วง (อ่านจากสคริปต์)')
print('   mora types', {k: {s: len(v) for s, v in p.items()} for k, p in type_pool.items()})

# ---------------------------------------------------------------- Friday (Amateur Collector): F_enchant(type); selective path puts
# types 2/4/6 in card 2 and 3/5/7 in card 3, the normal path puts type 1 in card 3
f = 'instances/FridayDungeon/instance_re.txt'
b = block(read(f), 'Amateur Collector#pa0829')
fn = b[b.index('function\tF_enchant {'):]
tp = {}
for lab, txt in sections(fn, r'\d'):
    en = strict([int(x) for x in re.findall(r'\.@enchant = (\d+);', txt)])
    for l in lab:
        if en:
            tp.setdefault(int(l), en)
u = lambda *ks: list(dict.fromkeys(x for k in ks for x in tp.get(k, [])))
tg = sorted({x for x in cases(b) if ISEQ(x)} or {x for x in ids(b) if ISEQ(x)})
add('friday', 'Friday Dungeon', f + ' / Amateur Collector', tg, {3: u(1, 3, 5, 7), 2: u(2, 4, 6)}, note='ช่อง 4 และ 3 สุ่มคนละรายการ (อ่านจากสคริปต์)')
# ---------------------------------------------------------------- Thanatos Tower (Tamilla): card 2 from .light/.sin, card 3 from .light_2/.sin_2
f = 'instances/ThanatosTower/collection_re.txt'
t = read(f)
b = block(t, 'Tamilla#mot')
arrs = {n: strict(ids(v)) for n, v in re.findall(r'setarray \.@(\w+),([^;]+);', b)}
c2, c3 = [], []
for dst, n in re.findall(r'\.(light|light_2|sin|sin_2)\[getarraysize\(\.\w+\)\] = \.@(\w+)\[', b):
    (c3 if dst.endswith('_2') else c2).extend(arrs.get(n, []))
tg = sorted({x for x in cases(b) if ISEQ(x)} or {x for x in ids(b) if ISEQ(x)})
add('thanatos', 'Thanatos Tower', f + ' / Tamilla', tg, {3: list(dict.fromkeys(c3)), 2: list(dict.fromkeys(c2))}, note='ช่อง 4 และ 3 สุ่มคนละรายการ (อ่านจากสคริปต์)')

# ---------------------------------------------------------------- Verus (Mass Charleston / MARS)
f = 'merchants/enchan_verus_re.txt'
t = read(f)
b = block(t, 'Mass Charleston#2')
pools = {}      # type -> {slot (4/3/2): [enchants]}: the slot picks the rand() range on the type's ladder
for lab, txt in sections(b, r'[1-8]'):
    rng, cur = {}, None
    for ln in txt.split('\n'):
        m = re.search(r'\.@slot == (\d)', ln)
        if m:
            cur = int(m.group(1))
        m = re.search(r'\.@en_brk(1|2) = (\d+);', ln)
        if m and cur:
            rng.setdefault(cur, [0, 0])[int(m.group(1)) - 1] = int(m.group(2))
    ladder, prev = [], 0
    for tt, e in re.findall(r'\.@r < (\d+)\) \.@en_name = (\d+);', txt):
        ladder.append((prev, int(tt) - 1, int(e)))
        prev = int(tt)
    if not ladder or not rng:
        continue
    for l in lab:
        pools.setdefault(int(l), {sl: strict([e for a, z, e in ladder if a <= hi and z >= lo]) for sl, (lo, hi) in rng.items()})
for iid, ty, ty9, mx in re.findall(r'case (\d+):\s*\n\s*\.@en_type = (\d+);\s*\n\s*\.@en_type_9 = (\d+);\s*\n\s*\.@max_slot = (\d+);', b):
    a, c = pools.get(int(ty), {}), pools.get(int(ty9), {})
    sl = {s_ - 1: list(dict.fromkeys(a.get(s_, []) + c.get(s_, []))) for s_ in (4, 3, 2, 1) if s_ > int(mx)}
    add('verus_' + iid, 'Verus (Mass Charleston)', f, [int(iid)], sl, note='แต่ละช่องสุ่มคนละช่วง / +9 เลือกสายเพิ่ม')
b = block(t, 'MARS_01#pa0829')
rows = re.findall(r'(\d{4,6}),\s*(\d),(\d),(\d)', b)
for col, iid in ((1, 20773), (2, 15128)):
    pool = strict([int(r[0]) for r in rows if int(r[col]) > 0])
    add('verus_mars_%d' % iid, 'Verus (Excelion)', f, [iid], {3: pool, 2: pool, 1: pool}, note='Excelion reactor')

# ---------------------------------------------------------------- GGT custom enchants (ro.gnjoy.in.th pages)
# tools/ggt_enchants.json: written by hand from each GGT page; names are resolved to ids here.
# game slot [4] = card index 3, [3] = 2, [2] = 1.
def norm(n):
    n = n.lower().replace('&', 'and')
    n = re.sub(r'(\d+)\s*lv\b', r'lv\1', n)
    n = re.sub(r'\b(?:lv|level)\.?\s*(\d+)', r'lv\1', n)
    n = re.sub(r'\s(\d+)$', r' lv\1', n)
    return re.sub(r'[^a-z0-9]+', '', n)


by_norm = {}
for k, v in items_json.items():
    by_norm.setdefault(norm(v['name']), []).append(int(k))
EQUIP = lambda i: items_json[str(i)].get('type') in ('Weapon', 'Armor', 'ShadowGear')
unresolved = []


def resolve_ench(name):
    if name.startswith('re:'):
        rx = re.compile(name[3:], re.I)
        r = sorted(i for i in CARDLIKE if rx.search(items_json[str(i)]['name']))
        if not r:
            unresolved.append(name)
        return r
    r = [i for i in by_norm.get(norm(name), []) if i in CARDLIKE] or by_norm.get(norm(name), [])
    if not r:
        unresolved.append(name)
    return r


def resolve_targets(spec):
    if isinstance(spec, dict):
        rx, ty, lc = re.compile(spec['re'], re.I), spec.get('type'), spec.get('loc')
        return [int(k) for k, v in items_json.items() if rx.search(v['name']) and EQUIP(k) and (not ty or v.get('type') == ty)
                and (not lc or lc in (v.get('loc') or []))]
    if spec.startswith('re:'):
        rx = re.compile(spec[3:], re.I)
        return [int(k) for k, v in items_json.items() if rx.search(v['name']) and EQUIP(k)]
    r = [i for i in by_norm.get(norm(spec), []) if EQUIP(i)]
    if not r:          # "Crown of Good and Evil" -> every "Crown of Good and Evil (job)"
        pre = norm(spec)
        r = [int(k) for k, v in items_json.items() if EQUIP(k) and norm(v['name']).startswith(pre)]
    if not r:
        unresolved.append('TARGET ' + spec)
    return r


gp = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ggt_enchants.json')
for e in json.load(open(gp, encoding='utf-8')):
    tg = [t for s in e['targets'] for t in resolve_targets(s)]
    if '{job}' in json.dumps(e['slots']):      # "Good Vigor ({job})": job taken from the target's "(Job)" suffix
        groups = {}
        for t in tg:
            m = re.search(r'\(([^)]+)\)', items_json[str(t)]['name'])
            groups.setdefault(m.group(1) if m else '', []).append(t)
    else:
        groups = {'': tg}
    for job, tgj in groups.items():
        sl = {int(k): [i for n in v for i in resolve_ench(n.replace('{job}', job))] for k, v in e['slots'].items()}
        if e.get('merge'):          # page only lists some slots: add them to the item's existing table
            for t in tgj:
                base = defs.get(items.get(str(t), '')) or {'minRefine': 0, 'minGrade': 0, 'randomOptions': True,
                                                            'order': [], 'slots': {}, 'name': e['key'], 'src': e['url']}
                nd = json.loads(json.dumps(base))
                for k, v in sl.items():
                    lst = nd['slots'].setdefault(str(k), [])
                    lst += [x for x in ench(v) if x not in lst]
                nd['order'] = sorted({*nd['order'], *[int(k) for k in sl if ench(sl[k])]}, reverse=True)
                nd['note'] = (nd.get('note', '') + ' + ' + e.get('note', '')).strip(' +')
                did = 'npc:ggt:' + e['key'] + ':' + str(t)
                defs[did] = nd
                items[str(t)] = did
            continue
        add('ggt:' + e['key'] + (':' + job if job else ''), e.get('name') or e['url'].rstrip('/').split('/')[-1].replace('-', ' ').title() + ' (GGT)', e['url'], tgj, sl,
            e.get('minRefine', 0), e.get('note', ''), override=e.get('override', True), random_options=e.get('randomOptions', True))

# ---------------------------------------------------------------- slot placement hints (per-slot lists, data only)
# Only for items whose NPC pool is still one list for every slot: keep our (server) pool, but put each
# enchant only in the slots the hint lists it for.  Hint index 0..3 = card slot 0..3.
import glob as _glob
try:
    import yaml as _yaml
    _L = getattr(_yaml, 'CSafeLoader', _yaml.SafeLoader)
    _aeg = {}
    for _f in _glob.glob(os.path.join(root, 'db', 're', 'item_db*.yml')):
        for _it in (_yaml.load(open(_f, encoding='utf-8'), Loader=_L) or {}).get('Body') or []:
            _aeg[_it['AegisName']] = _it['Id']
    _h = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'slot_hints.json'), encoding='utf-8'))
    n_h = 0
    for name, si in _h['items'].items():
        iid = str(_aeg.get(name, ''))
        did = items.get(iid)
        if not did or not did.startswith('npc:') or did.startswith('npc:ggt'):
            continue
        d = defs[did]
        if len({tuple(v) for v in d['slots'].values()}) != 1:
            continue                                   # already per slot
        pool = set(next(iter(d['slots'].values())))
        new = {}
        for k, lst in enumerate(_h['S'][si]):
            if lst is None:
                continue
            want = [_aeg.get(_h['dict'][j]) for j in lst]
            got = [x for x in want if x in pool] or [x for x in want if x and str(x) in items_json]
            if got:
                new[k] = got
        if new:
            nd = dict(d, slots={str(k): v for k, v in sorted(new.items(), reverse=True)}, order=sorted(new, reverse=True))
            nd['note'] = 'แยกตามช่องแล้ว'
            defs[did + ':' + iid] = nd
            items[iid] = did + ':' + iid
            n_h += 1
    print('   slot hints applied', n_h)
except Exception as ex:      # hints are optional
    print('!! hints skipped', ex)

json.dump(out, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
for s in stats:
    print(*s)
print('unresolved', sorted(set(unresolved)))
print('defs', len(defs), 'items', len(items), 'bytes', os.path.getsize(path))
