"""Add RO GGT items that rAthena does not have to data/items.json and data/combos.json.

Their bonuses are translated from the Thai item descriptions in the GGT client (itemInfo), which are the same
texts Divine Pride shows for thROG. Lines that cannot be translated are written to a report so they can be
checked or added by hand (data/items-ggt-manual.json overrides any generated script).

Usage: python build_ggt_items.py <rathena_dir> <items_all.json> <data_dir> <report.txt>
"""
import json, os, re, sys
import yaml
try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

rdir, ggt_path, data_dir, report_path = sys.argv[1:5]
ggt = json.load(open(ggt_path, encoding='utf-8'))
items = json.load(open(f'{data_dir}/items.json', encoding='utf-8'))
combos = json.load(open(f'{data_dir}/combos.json', encoding='utf-8'))
items = {k: v for k, v in items.items() if v.get('src') != 'ggt'}            # rebuild idempotently
combos = [c for c in combos if c.get('src') != 'ggt']
manual_path = f'{data_dir}/items-ggt-manual.json'
manual = json.load(open(manual_path, encoding='utf-8')) if os.path.exists(manual_path) else {}

skills = yaml.load(open(f'{rdir}/db/re/skill_db.yml', encoding='utf-8'), Loader=Loader)['Body']
SKILL = {re.sub(r'\s+', ' ', s['Description']).strip().lower(): s['Name'] for s in skills if s.get('Description')}
CODE = re.compile(r'\^[0-9a-fA-F]{6}')
NAME2ID = {}
for sid, it in ggt.items():
    n = (it.get('identifiedDisplayName') or '').strip().lower()
    if n:
        NAME2ID.setdefault(n, []).append(int(sid))

RACE = {'demi-human': 'RC_DemiHuman', 'demihuman': 'RC_DemiHuman', 'human': 'RC_DemiHuman', 'brute': 'RC_Brute', 'plant': 'RC_Plant',
        'insect': 'RC_Insect', 'fish': 'RC_Fish', 'demon': 'RC_Demon', 'undead': 'RC_Undead', 'angel': 'RC_Angel',
        'dragon': 'RC_Dragon', 'formless': 'RC_Formless', 'doram': 'RC_Player_Doram'}
ELE = {'neutral': 'Ele_Neutral', 'water': 'Ele_Water', 'earth': 'Ele_Earth', 'fire': 'Ele_Fire', 'wind': 'Ele_Wind',
       'poison': 'Ele_Poison', 'holy': 'Ele_Holy', 'dark': 'Ele_Dark', 'shadow': 'Ele_Dark', 'ghost': 'Ele_Ghost', 'undead': 'Ele_Undead'}
SIZE = {'small': 'Size_Small', 'medium': 'Size_Medium', 'large': 'Size_Large', 'เล็ก': 'Size_Small', 'กลาง': 'Size_Medium', 'ใหญ่': 'Size_Large'}
GRADE = {'D': 1, 'C': 2, 'B': 3, 'A': 4}
STAT = {'STR': 'bStr', 'AGI': 'bAgi', 'VIT': 'bVit', 'INT': 'bInt', 'DEX': 'bDex', 'LUK': 'bLuk', 'POW': 'bPow', 'STA': 'bSta',
        'WIS': 'bWis', 'SPL': 'bSpl', 'CON': 'bCon', 'CRT': 'bCrt', 'ALL STATS': 'bAllStats', 'ALL STATUS': 'bAllStats',
        'ALL STAT': 'bAllStats', 'P.ATK': 'bPAtk', 'S.MATK': 'bSMatk', 'RES': 'bRes', 'MRES': 'bMRes', 'H.PLUS': 'bHPlus',
        'C.RATE': 'bCRate', 'HIT': 'bHit', 'FLEE': 'bFlee', 'PERFECT DODGE': 'bFlee2', 'CRI': 'bCritical', 'CRIT': 'bCritical',
        'CRITICAL': 'bCritical', 'DEF': 'bDef', 'MDEF': 'bMdef', 'ATK': 'bBaseAtk', 'MATK': 'bMatk', 'MAXHP': 'bMaxHP',
        'MHP': 'bMaxHP', 'MAXSP': 'bMaxSP', 'MSP': 'bMaxSP', 'MAXAP': 'bMaxAP', 'ASPD': 'bAspd'}
RATE = {'ATK': 'bAtkRate', 'MATK': 'bMatkRate', 'MAXHP': 'bMaxHPrate', 'MHP': 'bMaxHPrate', 'MAXSP': 'bMaxSPrate', 'MSP': 'bMaxSPrate',
        'ASPD': 'bAspdRate', 'DEF': 'bDefRate', 'MDEF': 'bMdefRate', 'HIT': 'bHitRate', 'FLEE': 'bFleeRate', 'MAXAP': 'bMaxAPrate'}
TYPE_LOC = {'upper': ['Head_Top'], 'middle': ['Head_Mid'], 'lower': ['Head_Low'], 'garment': ['Garment'], 'shield': ['Left_Hand'],
            'shoes': ['Shoes'], 'armor': ['Armor'], 'accessory (right)': ['Right_Accessory'], 'accessory(right)': ['Right_Accessory'],
            'accessory (left)': ['Left_Accessory'], 'accessory(left)': ['Left_Accessory'], 'accessory': ['Both_Accessory'],
            'helm': ['Head_Top']}
SHADOW_LOC = {'weapon': 'Shadow_Weapon', 'shield': 'Shadow_Shield', 'armor': 'Shadow_Armor', 'shoes': 'Shadow_Shoes',
              'earring': 'Shadow_Right_Accessory', 'pendant': 'Shadow_Left_Accessory'}
COSTUME_LOC = {'upper': 'Costume_Head_Top', 'middle': 'Costume_Head_Mid', 'lower': 'Costume_Head_Low', 'garment': 'Costume_Garment'}
WEAPON = {'dagger': 'Dagger', 'knife': 'Dagger', 'sword': '1hSword', 'one-handed sword': '1hSword', 'two-handed sword': '2hSword',
          'spear': '1hSpear', 'two-handed spear': '2hSpear', 'axe': '1hAxe', 'two-handed axe': '2hAxe', 'mace': 'Mace',
          'two-handed mace': '2hMace', 'staff': 'Staff', 'rod': 'Staff', 'one-handed staff': 'Staff', 'one-handed rod': 'Staff',
          'two-handed staff': '2hStaff', 'bow': 'Bow', 'knuckle': 'Knuckle', 'instrument': 'Musical', 'whip': 'Whip',
          'book': 'Book', 'katar': 'Katar', 'revolver': 'Revolver', 'rifle': 'Rifle', 'gatling gun': 'Gatling', 'shotgun': 'Shotgun',
          'grenade launcher': 'Grenade', 'huuma shuriken': 'Huuma'}
TWO_HAND = {'2hSword', '2hSpear', '2hAxe', '2hMace', '2hStaff', 'Bow', 'Katar', 'Huuma', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'}
NUM = r'(\d+(?:\.\d+)?)'


import difflib
_SKILL_KEYS = list(SKILL)
SKILL_ALIAS = {'genesis ray': 'LG_RAYOFGENESIS', 'third punishment': 'IQ_THIRD_PUNISH', 'spirit of knight': 'SL_KNIGHT',
               'power': 'BS_OVERTHRUST', 'spirit of priest': 'SL_PRIEST', 'spirit of wizard': 'SL_WIZARD'}
_AEGIS = {s['Name'] for s in skills}

def skill_lookup(name):
    key = re.sub(r'\s+', ' ', name).strip().lower()
    if name.strip() in _AEGIS:
        return name.strip()
    if key in SKILL_ALIAS:
        return SKILL_ALIAS[key]
    if key in SKILL:
        return SKILL[key]
    k2 = re.sub(r'^spirit of (?!the )', 'spirit of the ', key)
    if k2 in SKILL:
        return SKILL[k2]
    m = difflib.get_close_matches(key, _SKILL_KEYS, n=1, cutoff=0.88)    # typos such as "Metalic Fury"
    return SKILL[m[0]] if m else None

def skill_names(text):
    # "Acidified Zone (Fire/Water/Wind/Ground)" -> four skills
    text = re.sub(r'([A-Za-z ]+?)\s*\(((?:[A-Za-z]+/)+[A-Za-z]+)\)', lambda m: ', '.join(f'{m.group(1)} {x}' for x in m.group(2).split('/')), text)
    out = []
    for part in re.split(r',\s*|\s+และ\s+', text):
        n = skill_lookup(part)
        if not n:
            return None
        out.append(n)
    return out or None


def damage_targets(t):
    """Return list of (bonus, arg) for 'เพิ่ม Damage ทางกายภาพ/เวทมนตร์ต่อศัตรู...' phrases."""
    phys = 'กายภาพ' in t
    magic = 'เวทมนตร์' in t or 'เวท' in t
    if not phys and not magic:
        phys = True
    res = []
    def add(kind, arg):
        if phys: res.append(({'race': 'bAddRace', 'ele': 'bAddEle', 'size': 'bAddSize', 'class': 'bAddClass'}[kind], arg))
        if magic: res.append(({'race': 'bMagicAddRace', 'ele': 'bMagicAddEle', 'size': 'bMagicAddSize', 'class': 'bMagicAddClass'}[kind], arg))
    if re.search(r'ทุกประเภท|ทุกเผ่า|ทุกศัตรูเผ่า', t) and not re.search(r'เผ่า\s*[A-Za-z]', t) and 'ทุกขนาด' not in t and 'ทุกธาตุ' not in t:
        race = 'ทุกเผ่า' in t or 'ทุกศัตรูเผ่า' in t
        add('race' if race else 'class', 'RC_All' if race else 'Class_All'); return res
    if 'ทุกขนาด' in t: add('size', 'Size_All'); return res
    if 'ทุกธาตุ' in t: add('ele', 'Ele_All'); return res
    m = re.search(r'Boss', t)
    if m and 'ประเภท' in t: add('class', 'Class_Boss'); return res
    m = re.search(r'เผ่า\s*([A-Za-z\-, ]+?)(?:\s+\d|\s*$|\s*\+)', t + ' ')
    if m:
        races = [RACE.get(x.strip().lower()) for x in re.split(r',|และ', m.group(1)) if x.strip()]
        if races and all(races):
            for r_ in races: add('race', r_)
            return res
    m = re.search(r'ธาตุ\s*([A-Za-z, ]+?)(?:\s+\d|\s*$|\s*\+)', t + ' ')
    if m:
        eles = [ELE.get(x.strip().lower()) for x in m.group(1).split(',') if x.strip()]
        if eles and all(eles):
            for e_ in eles: add('ele', e_)
            return res
    m = re.search(r'ขนาด\s*([A-Za-zก-๙]+)', t)
    if m and SIZE.get(m.group(1).lower()): add('size', SIZE[m.group(1).lower()]); return res
    return None


def effect(part, mult):
    """Translate one effect phrase into rAthena bonus statements. mult is an expression string or None."""
    p = part.strip().rstrip(',').strip()
    p = re.sub(r'\s*\(ยกเว้น Player\)\s*', ' ', p)
    p = re.sub(r'\s*(ขึ้นอีก|ลงอีก|เพิ่มเติม|อีก)\s*', ' ', p).strip()
    p = re.sub(r'\s+', ' ', p).rstrip('.').strip()
    p = p.replace('Damge', 'Damage')
    if not p:
        return []
    # "สามารถใช้งานสกิล Enchant Deadly Poison Lv.5 ได้" -> the item grants the skill
    m = re.fullmatch(r'สามารถใช้(?:งาน)?สกิล\s*(.+?)\s*Lv\.?\s*(\d+)\s*ได้(?:\s*\(.*\))?', p)
    if m:
        sk = skill_lookup(m.group(1))
        return [f'skill "{sk}",{m.group(2)};'] if sk else None
    v = lambda n, scale=1: (f'{mult}*{fmt(float(n) * scale)}' if mult else fmt(float(n) * scale))

    p = re.sub(r'^เพิ่ม\s+(?=[A-Z][A-Za-z.]*\s*[+-])', '', p)
    m = re.fullmatch(r'All Trait(?:s| Stats?| Status)?\s*\+\s*' + NUM, p, re.I)
    if m: return [f'bonus bAllTraitStats,{v(m.group(1))};']
    m = re.fullmatch(r'All Stat(?:e|s|us)?\s*\+\s*' + NUM, p, re.I)
    if m: return [f'bonus bAllStats,{v(m.group(1))};']
    m = re.fullmatch(r'((?:[A-Za-z.]+\s*[,/]\s*)+[A-Za-z.]+)\s*([+-])\s*' + NUM + r'\s*(%?)', p)
    if m:
        out = []
        for key in re.split(r'\s*[,/]\s*', m.group(1)):
            r_ = effect(f'{key} {m.group(2)} {m.group(3)}{m.group(4)}', mult)
            if r_ is None: return None
            out += r_
        return out
    m = re.fullmatch(r'(MaxHP|MHP)\s*\+\s*' + NUM + r'%\s*,\s*(MaxSP|MSP)\s*\+\s*' + NUM + r'%', p, re.I)
    if m:
        return [f'bonus bMaxHPrate,{v(m.group(2))};', f'bonus bMaxSPrate,{v(m.group(4))};']
    m = re.fullmatch(r'([A-Za-z.\s]+?)\s*([+-])\s*' + NUM + r'\s*(%?)', p)
    if m:
        key, sign, n, pct = m.group(1).strip().upper(), m.group(2), m.group(3), m.group(4)
        key = re.sub(r'\s+', ' ', key)
        n = n if sign == '+' else '-' + n
        if key in ('CRITICAL DAMAGE', 'CRI DAMAGE'):
            return [f'bonus bCritAtkRate,{v(n)};']
        if pct and key in RATE:
            return [f'bonus {RATE[key]},{v(n)};']
        if not pct and key in STAT:
            return [f'bonus {STAT[key]},{v(n)};']
    p = re.sub(r'^(?:ลดดีเลย์หลังใช้สกิลลง|Global Cooldown\s*-)\s*', 'ลด Delay หลังใช้สกิล ', p)
    p = re.sub(r'^ลด Fixed Cast Time\s*-?', 'ลดระยะเวลาร่ายแบบคงที่ ', p)
    p = re.sub(r'^ลดระยะเวลาร่ายคงตัว', 'ลดระยะเวลาร่ายแบบคงที่', p)
    p = re.sub(r'^ดาเมจทางกายภาพระยะ(ใกล้|ไกล)เพิ่ม(?:ขึ้น)?\s*\+?', r'เพิ่ม Damage ทางกายภาพระยะ\1 ', p)
    p = re.sub(r'^เพิ่มการโจมตีทางกายภาพระยะ(ใกล้|ไกล)', r'เพิ่ม Damage ทางกายภาพระยะ\1', p)
    p = re.sub(r'ต่อทุกศัตรูเผ่า', 'ต่อศัตรูทุกเผ่า', p)
    m = re.fullmatch(r'ลดปริมาณการใช้ SP\s*' + NUM + '%', p)
    if m: return [f'bonus bUseSPrate,-{v(m.group(1))};']
    m = re.fullmatch(r'เวลาในการร่ายสกิล (.+?) ลดลง\s*' + NUM + '%', p)
    if m:
        sk = skill_names(m.group(1))
        if sk: return [f'bonus2 bVariableCastrate,"{s_}",-{v(m.group(2))};' for s_ in sk]
    p = re.sub(r'^เพิ่มดาเมจที่ทำต่อมอนสเตอร์ Boss', 'เพิ่ม Damage ทางกายภาพต่อมอนสเตอร์ประเภท Boss', p)
    p = re.sub(r'เพิ่ม Damage ของสกิล', 'เพิ่ม Damage สกิล', p)
    p = re.sub(r'All Trait Status', 'All Trait', p)
    p = re.sub(r'\s*\+\s*(?=\d+(?:\.\d+)?%$)', ' ', p) if p.startswith('เพิ่ม Damage') else p
    m = re.fullmatch(r'ลด Variable Cast Time (?:ของ)?สกิล (.+?)\s*' + NUM + '%', p)
    if m:
        sk = skill_names(m.group(1))
        if sk: return [f'bonus2 bVariableCastrate,"{s_}",-{v(m.group(2))};' for s_ in sk]
    if re.fullmatch(r'ยกเลิกการลงโทษขนาดของอาวุธ', p): return ['bonus bNoSizeFix;']
    if re.fullmatch(r'ไม่สามารถ(?:ทำลาย|อัพเกรด(?:ทั่วไป)?(?:และไม่สามารถทำลาย)?)ได้', p): return []   # unbreakable / no refine: no stat
    m = re.fullmatch(r'เพิ่ม Critical Damage\s*' + NUM + '%', p)
    if m: return [f'bonus bCritAtkRate,{v(m.group(1))};']
    m = re.fullmatch(r'ลด (?:Delay หลัง(?:ใช้|ร่าย)สกิล|Global Cooldown|After Cast Delay)\s*' + NUM + '%', p)
    if m: return [f'bonus bDelayrate,-{v(m.group(1))};']
    m = re.fullmatch(r'ลดระยะเวลาร่ายแบบคงที่\s*' + NUM + r'\s*วินาที', p)
    if m: return [f'bonus bFixedCast,-{v(m.group(1), 1000)};']
    m = re.fullmatch(r'ลดระยะเวลาร่ายแบบคงที่\s*' + NUM + '%', p)
    if m: return [f'bonus bFixedCastrate,-{v(m.group(1))};']
    m = re.fullmatch(r'(?:ลดระยะเวลาร่ายแบบแปรผัน|ลด Variable Cast Time)\s*' + NUM + '%', p)
    if m: return [f'bonus bVariableCastrate,-{v(m.group(1))};']
    m = re.fullmatch(r'เพิ่ม Damage ทางกายภาพระยะ(ใกล้/ไกล|ใกล้|ไกล)\s*' + NUM + '%', p)
    if m:
        out = []
        if 'ใกล้' in m.group(1): out.append(f'bonus bShortAtkRate,{v(m.group(2))};')
        if 'ไกล' in m.group(1): out.append(f'bonus bLongAtkRate,{v(m.group(2))};')
        return out
    m = re.fullmatch(r'เพิ่ม Damage (?:สกิล )?(.+?)\s*' + NUM + '%', p)
    if m and not re.match(r'ทาง|ต่อ', m.group(1)):
        sk = skill_names(m.group(1))
        if sk: return [f'bonus2 bSkillAtk,"{s}",{v(m.group(2))};' for s in sk]
    m = re.fullmatch(r'ลด Cooldown สกิล (.+?)\s*' + NUM + r'\s*วินาที', p)
    if m:
        sk = skill_names(m.group(1))
        if sk: return [f'bonus2 bSkillCooldown,"{s}",-{v(m.group(2), 1000)};' for s in sk]
    m = re.fullmatch(r'เพิ่ม Damage ทางเวทมนตร์(?:ทุกธาตุ|ธาตุ\s*([A-Za-z, ]+?))\s*' + NUM + '%', p)
    if m:
        eles = ['Ele_All'] if not m.group(1) else [ELE.get(x.strip().lower()) for x in m.group(1).split(',')]
        if all(eles): return [f'bonus2 bMagicAtkEle,{e_},{v(m.group(2))};' for e_ in eles]
    m = re.fullmatch(r'เพิ่ม Damage ทาง(?:กายภาพ|เวทมนตร์|กายภาพ/เวทมนตร์|กายภาพและเวทมนตร์)(?:ที่ทำ)?ต่อ(?:ศัตรู|มอนสเตอร์)(.*?)\s*\+?\s*' + NUM + '%', p)
    if m and 'Raid' not in p:
        tg = damage_targets(p)
        if tg: return [f'bonus2 {b},{a},{v(m.group(2))};' for b, a in tg]
    m = re.fullmatch(r'เพิกเฉยต่อพลังป้องกันทาง(กายภาพ|เวทมนตร์|กายภาพและเวทมนตร์)ของ(?:มอนสเตอร์|ศัตรู)?(?:เผ่า\s*([A-Za-z\- ]+)|ทุกเผ่า|ทุกประเภท)\s*' + NUM + '%', p)
    if m:
        race = 'RC_All' if not m.group(2) else RACE.get(m.group(2).strip().lower())
        if race:
            out = []
            if 'กายภาพ' in m.group(1): out.append(f'bonus2 bIgnoreDefRaceRate,{race},{v(m.group(3))};')
            if 'เวทมนตร์' in m.group(1): out.append(f'bonus2 bIgnoreMdefRaceRate,{race},{v(m.group(3))};')
            return out
    m = re.fullmatch(r'เพิ่มความต้านทานต่อการโจมตีธาตุ\s*([A-Za-z, ]+?)\s*' + NUM + '%', p)
    if m:
        eles = [ELE.get(x.strip().lower()) for x in m.group(1).split(',')]
        if all(eles): return [f'bonus2 bSubEle,{e_},{v(m.group(2))};' for e_ in eles]
    m = re.fullmatch(r'ลด Damage (?:ทาง(?:กายภาพ|เวทมนตร์|กายภาพ/เวทมนตร์|กายภาพและเวทมนตร์))?ที่ได้รับจาก(?:ศัตรู|มอนสเตอร์)(.*?)\s*' + NUM + '%', p)
    if m:
        t = m.group(1)
        args = None
        sizes = [SIZE[x.strip()] for x in re.split(r',\s*', re.sub(r'^ขนาด', '', t.strip())) if x.strip() in SIZE] if 'ขนาด' in t else []
        if sizes: return [f'bonus2 bSubSize,{s_},{v(m.group(2))};' for s_ in sizes]
        if 'ทั่วไปและบอส' in t: args = ('bSubClass', 'Class_All')
        elif 'ทั่วไป' in t: args = ('bSubClass', 'Class_Normal')
        elif 'บอส' in t or 'Boss' in t: args = ('bSubClass', 'Class_Boss')
        elif 'ทุกเผ่า' in t or 'ทุกประเภท' in t: args = ('bSubRace', 'RC_All')
        elif 'ทุกธาตุ' in t: args = ('bSubEle', 'Ele_All')
        elif 'ทุกขนาด' in t: args = ('bSubSize', 'Size_All')
        else:
            mm = re.search(r'เผ่า\s*([A-Za-z\- ]+)', t)
            if mm and RACE.get(mm.group(1).strip().lower()): args = ('bSubRace', RACE[mm.group(1).strip().lower()])
            mm = re.search(r'ธาตุ\s*([A-Za-z]+)', t)
            if mm and ELE.get(mm.group(1).lower()): args = ('bSubEle', ELE[mm.group(1).lower()])
        if args: return [f'bonus2 {args[0]},{args[1]},{v(m.group(2))};']
    return None


def fmt(x):
    return str(int(x)) if float(x).is_integer() else str(x)


def find_item(name):
    ids = NAME2ID.get(name.strip().lower())
    return ids[0] if ids else None


EQI_FOR_LOC = {'Head_Top': 'EQI_HEAD_TOP', 'Head_Mid': 'EQI_HEAD_MID', 'Head_Low': 'EQI_HEAD_LOW', 'Armor': 'EQI_ARMOR',
               'Right_Hand': 'EQI_HAND_R', 'Both_Hand': 'EQI_HAND_R', 'Left_Hand': 'EQI_HAND_L', 'Garment': 'EQI_GARMENT',
               'Shoes': 'EQI_SHOES', 'Right_Accessory': 'EQI_ACC_R', 'Left_Accessory': 'EQI_ACC_L', 'Both_Accessory': 'EQI_ACC_R'}


def eqi_of(item_id, new_items):
    it = items.get(str(item_id)) or new_items.get(str(item_id))
    for l in (it or {}).get('loc', []):
        if l in EQI_FOR_LOC:
            return EQI_FOR_LOC[l]
    return None


def eqi_of_names(text, new_items):
    """'A' or 'A หรือ B' -> the equip slot they share (None when unknown or different)"""
    eqis = set()
    for n in re.split(r'\s+หรือ\s+', text.strip()):
        n = re.sub(r'\b(\w+)\s+\1\b', r'\1', n)            # "Orrivane Orrivane Hyper Sword" (typo in the client text)
        it = find_item(n)
        e = eqi_of(it, new_items) if it else None
        if not e:
            return None
        eqis.add(e)
    return eqis.pop() if len(eqis) == 1 else None



# --- jobs ------------------------------------------------------------------------
# display name -> (item_db job names, tier) ; tier: 'Third' / 'Fourth' / None (the whole line)
_TREE = {'swordman': ['Swordman', 'Knight', 'Crusader'], 'mage': ['Mage', 'Wizard', 'Sage'], 'magician': ['Mage', 'Wizard', 'Sage'],
         'archer': ['Archer', 'Hunter', 'BardDancer'], 'acolyte': ['Acolyte', 'Priest', 'Monk'],
         'merchant': ['Merchant', 'Blacksmith', 'Alchemist'], 'thief': ['Thief', 'Assassin', 'Rogue'],
         'taekwon': ['Taekwon', 'StarGladiator', 'SoulLinker'], 'gunslinger': ['Gunslinger', 'Rebellion'],
         'ninja': ['Ninja', 'KagerouOboro'], 'summoner': ['Summoner', 'Spirit_Handler'], 'doram': ['Summoner', 'Spirit_Handler'],
         'novice': ['Novice', 'SuperNovice'], 'super novice': ['SuperNovice'], 'soul linker': ['SoulLinker'], 'star gladiator': ['StarGladiator'],
         'knight': ['Knight'], 'crusader': ['Crusader'], 'wizard': ['Wizard'], 'sage': ['Sage'], 'hunter': ['Hunter'],
         'bard': ['BardDancer'], 'dancer': ['BardDancer'], 'priest': ['Priest'], 'monk': ['Monk'], 'blacksmith': ['Blacksmith'],
         'alchemist': ['Alchemist'], 'assassin': ['Assassin'], 'rogue': ['Rogue'], 'rebellion': ['Rebellion'],
         'kagerou': ['KagerouOboro'], 'oboro': ['KagerouOboro']}
_TREE.update({'swordsman': _TREE['swordman'], 'sword': _TREE['swordman']})
_THIRD = {'rune knight': 'Knight', 'royal guard': 'Crusader', 'warlock': 'Wizard', 'sorcerer': 'Sage', 'ranger': 'Hunter',
          'minstrel': 'BardDancer', 'wanderer': 'BardDancer', 'arch bishop': 'Priest', 'archbishop': 'Priest', 'sura': 'Monk',
          'mechanic': 'Blacksmith', 'genetic': 'Alchemist', 'guillotine cross': 'Assassin', 'shadow chaser': 'Rogue',
          'star emperor': 'StarGladiator', 'soul reaper': 'SoulLinker'}
_FOURTH = {'dragon knight': 'Knight', 'imperial guard': 'Crusader', 'arch mage': 'Wizard', 'elemental master': 'Sage',
           'windhawk': 'Hunter', 'wind hawk': 'Hunter', 'troubadour': 'BardDancer', 'trouvere': 'BardDancer', 'cardinal': 'Priest',
           'inquisitor': 'Monk', 'meister': 'Blacksmith', 'biolo': 'Alchemist', 'shadow cross': 'Assassin', 'abyss chaser': 'Rogue',
           'sky emperor': 'StarGladiator', 'soul ascetic': 'SoulLinker', 'night watch': 'Rebellion', 'shinkiro': 'KagerouOboro',
           'shiranui': 'KagerouOboro', 'hyper novice': 'SuperNovice', 'spirit handler': 'Spirit_Handler', 'spirit hanlder': 'Spirit_Handler'}
# display name -> Job_ constants (for "when the wearer is job X" conditions)
_JOB_CONST = {'troubadour': ['Job_Troubadour'], 'trouvere': ['Job_Trouvere'], 'windhawk': ['Job_Windhawk', 'Job_Windhawk2'],
              'wind hawk': ['Job_Windhawk', 'Job_Windhawk2'], 'dragon knight': ['Job_Dragon_Knight', 'Job_Dragon_Knight2'],
              'meister': ['Job_Meister', 'Job_Meister2'], 'imperial guard': ['Job_Imperial_Guard', 'Job_Imperial_Guard2'],
              'sky emperor': ['Job_Sky_Emperor', 'Job_Sky_Emperor2'], 'cardinal': ['Job_Cardinal'], 'inquisitor': ['Job_Inquisitor'],
              'arch mage': ['Job_Arch_Mage'], 'elemental master': ['Job_Elemental_Master'], 'biolo': ['Job_Biolo'],
              'shadow cross': ['Job_Shadow_Cross'], 'abyss chaser': ['Job_Abyss_Chaser'], 'soul ascetic': ['Job_Soul_Ascetic'],
              'night watch': ['Job_Night_Watch'], 'shinkiro': ['Job_Shinkiro'], 'shiranui': ['Job_Shiranui'],
              'hyper novice': ['Job_Hyper_Novice'], 'spirit handler': ['Job_Spirit_Handler']}

_UPPER = {'lord knight': 'Knight', 'paladin': 'Crusader', 'high wizard': 'Wizard', 'scholar': 'Sage', 'professor': 'Sage',
          'sniper': 'Hunter', 'clown': 'BardDancer', 'minstrel (trans)': 'BardDancer', 'gypsy': 'BardDancer', 'high priest': 'Priest',
          'champion': 'Monk', 'whitesmith': 'Blacksmith', 'mastersmith': 'Blacksmith', 'biochemist': 'Alchemist', 'creator': 'Alchemist',
          'assassin cross': 'Assassin', 'stalker': 'Rogue'}

def _job_names(text):
    return [x for x in (re.sub(r'\s*(?:class(?:es)?|cls|only)\.?$|\s*\(.*?\)$', '', n.strip(), flags=re.I).lower()
                        for n in re.split(r'\s*(?:,|/|&|และ|หรือ)\s*', text)) if x]

def parse_jobs(text):
    """'อาชีพ : ...' -> (jobs, classes) in item_db form; (None, None) when unreadable."""
    t = text.strip()
    if re.match(r'ทุกอาช[ีั]พ\s*$', t) or 'All Slot' in t:
        return None, None
    m = re.fullmatch(r'Class\s*([34])(?:\s*ขึ้นไป)?', t, re.I)
    if m:
        return None, (['All_Third', 'Fourth'] if m.group(1) == '3' else ['Fourth'])
    m = re.match(r'ทุกอาชีพ\s*ยกเว้น\s*(.+)$', t)
    if m:
        ex = sum((_TREE.get(n, []) for n in _job_names(m.group(1))), [])
        return ({'all': True, 'except': ex} if ex else None), None
    jobs, tiers = [], set()
    for n in _job_names(t):
        n = re.sub(r'\s*(?:class|cls)$', '', n)
        c3 = re.fullmatch(r'(?:3rd\s+)?(\w+)(?:\s+class)?(?:\s+3)?', n)
        if c3 and c3.group(1) in _TREE and (n.startswith('3rd') or n.endswith(' 3')):
            jobs += _TREE[c3.group(1)]; tiers.add('Third'); continue
        hi = re.match(r'hi(?:gh)?-?\s*(?:class\s+)?(.+)$', n)
        if hi and hi.group(1) in _TREE:
            jobs += _TREE[hi.group(1)]; tiers.add('Upper'); continue
        if n in _UPPER: jobs.append(_UPPER[n]); tiers.add('Upper'); continue
        if n in _FOURTH: jobs.append(_FOURTH[n]); tiers.add('Fourth')
        elif n in _THIRD: jobs.append(_THIRD[n]); tiers.add('Third')
        elif n in _TREE: jobs += _TREE[n]; tiers.add(None)
        else: return None, None
    jobs = sorted(set(jobs))
    classes = (['Fourth'] if tiers == {'Fourth'} else ['All_Third'] if tiers == {'Third'} else
               ['All_Upper'] if tiers == {'Upper'} else None)
    return jobs, classes

def job_condition(text):
    """'Troubadour/Trouvere' -> 'Class == Job_Troubadour || Class == Job_Trouvere' (None when unknown)."""
    out = []
    for n in _job_names(text):
        if n in _JOB_CONST: out += [f'Class == {c}' for c in _JOB_CONST[n]]
        elif n in _TREE and n in ('merchant', 'swordman', 'mage', 'magician', 'archer', 'acolyte', 'thief'):
            eaj = {'magician': 'MAGE'}.get(n, n.upper())
            out.append(f'(eaclass()&EAJ_BASEMASK) == EAJ_{eaj}')
        elif n == 'super novice': out.append('(eaclass()&EAJ_SUPER_NOVICE) == EAJ_SUPER_NOVICE')
        else: return None
    return '(' + ' || '.join(out) + ')' if out else None

SLOT_EQI = {'Armor': 'EQI_ARMOR', 'Boots': 'EQI_SHOES', 'Shoes': 'EQI_SHOES', 'Manteau': 'EQI_GARMENT', 'Garment': 'EQI_GARMENT',
            'Helm': 'EQI_HEAD_TOP', 'Shield': 'EQI_HAND_L', 'Weapon': 'EQI_HAND_R', 'อาวุธ': 'EQI_HAND_R'}

def translate(iid, info, new_items):
    """Returns (item record, [combo records], [untranslated lines])"""
    rec = {'name': info['name'], 'res': info.get('res', ''), 'type': 'Armor', 'loc': [], 'slots': info.get('slots', 0), 'src': 'ggt'}
    lines = [CODE.sub('', l).strip() for l in info['desc']]
    # --- base info ---------------------------------------------------------------
    kind = loc_label = None
    for l in lines:
        m = re.match(r'ประเภท\s*:\s*(.+?)\s*(?:พลัง(?:ป้องกัน|โจมตี)\s*:\s*(\d+))?\s*$', l)
        if m:
            kind = m.group(1).strip().lower()
            val = int(m.group(2)) if m.group(2) else 0
            if 'พลังโจมตี' in l: rec['atk'] = val
            elif val: rec['def'] = val
        m = re.match(r'(?:ตำแหน่ง|ใช้กับ)\s*:\s*(.+?)(?:\s+น้ำหนัก.*)?$', l)
        if m: loc_label = m.group(1).strip().lower()
        m = re.match(r'เลเวล(?:อาวุธ|ของอาวุธ| Weapon)\s*:\s*(\d+)', l)
        if m: rec['wlv'] = int(m.group(1))
        m = re.match(r'เลเวล(?: Armor|ของเกราะ)\s*:\s*(\d+)', l)
        if m and int(m.group(1)) > 1: rec['alv'] = int(m.group(1))
        m = re.match(r'(?:เลเวลที่ต้องการ|Lv ที่ต้องการ)\s*:\s*(\d+)', l)
        if m: rec['elv'] = int(m.group(1))
        m = re.match(r'(?:พลังเวทย์|MATK)\s*:\s*(\d+)', l)
        if m: rec['matk'] = int(m.group(1))
        m = re.match(r'อาชีพ[^:]{0,24}:\s*(.+)$', l)
        if m:
            j, cl = parse_jobs(m.group(1))
            if j is not None: rec['jobs'] = j
            if cl: rec['classes'] = cl
    kind = (kind or '').replace('  ', ' ')
    if info.get('enchant'):
        rec['type'] = 'Card'; rec['sub'] = 'Enchant'; rec['loc'] = []
    elif kind == 'card':
        rec['type'] = 'Card'
        rec['loc'] = (['Right_Hand'] if (loc_label or '').startswith('weapon') else
                      TYPE_LOC.get(loc_label or '', []) or ['Both_Accessory'])
    elif kind in WEAPON:
        rec['type'] = 'Weapon'; rec['sub'] = WEAPON[kind]; rec['wlv'] = rec.get('wlv', 1)
        rec['loc'] = ['Both_Hand'] if rec['sub'] in TWO_HAND else ['Right_Hand']
    elif kind.startswith('shadow'):
        rec['type'] = 'ShadowGear'; rec['loc'] = [SHADOW_LOC.get(loc_label or '', 'Shadow_Armor')]
    elif kind.startswith('costume'):
        parts = re.split(r'\s*[,/]\s*', loc_label or 'upper')
        rec['loc'] = [COSTUME_LOC[p] for p in parts if p in COSTUME_LOC]
    elif kind.startswith(('headgear', 'heargear', 'helm')):
        parts = re.split(r'\s*[,/]\s*', loc_label or 'upper')
        rec['loc'] = sum((TYPE_LOC.get(p, []) for p in parts), []) or ['Head_Top']
    else:
        rec['loc'] = TYPE_LOC.get(kind, [])
    for k in ('Refineable',):
        pass
    rec['refine'] = not any('ไม่สามารถอัพเกรด' in l for l in lines)
    if any('[Grade' in l for l in lines):
        rec['grade'] = True

    # --- bonuses -----------------------------------------------------------------
    script, combo_list, todo = [], [], []
    target = script            # where statements go (item script or current combo)
    cond = None                # block condition (applies to following lines until a blank line / new header)
    block_cond_target = None
    stop = re.compile(r'^(ประเภท|ตำแหน่ง|ใช้กับ|น้ำหนัก|เลเวล|อาชีพ|Lv ที่|SLOT|ราคา|ใช้สำหรับ|\[วัตถุดิบ|\[Option|คำเตือน|―|_$|-$)')
    in_materials = False
    fresh_header = False
    last_skills = []
    NON_COMBAT = re.compile(r'ค่าประสบการณ์|EXP|Drop|ดรอป|Raid|Player|Potion|โอกาส|ฟื้นฟู|สูญเสีย|สามารถใช้งานสกิล|ความสามารถของสกิล|'
                            r'แลกเปลี่ยน|ลบหลัง|ถูกลบ|NAVI|Enchant|ถอด|WoE|ระยะเวลา \d+ วินาที|เป็นเวลา|คำเตือน|Collaboration')

    def emit(stmts, c):
        if c == '0' or c.startswith('0 &&'):
            return                              # inside a block whose condition could not be read
        if c:
            target.append(f'if ({c}) {{ ' + ' '.join(stmts) + ' }')
        else:
            target.extend(stmts)

    for raw in lines:
        l = raw.strip()
        if not l or l in ('_', '-') or l.startswith('―'):
            cond = None
            continue
        if l.startswith('[วัตถุดิบ'):
            in_materials = True; continue
        if in_materials:
            continue
        if stop.match(l):
            if l.startswith('[Option'):
                cond = None; target = script
            continue
        # combo header: "เมื่อสวมใส่ร่วมกับ X," (X can be "A และ B" / "A, B")
        m = re.match(r'เมื่อสวมใส่ร่วม(?:กัน)?กับ\s*(.+?)\s*,?\s*$', l)
        if m:
            names = [n for n in re.split(r'\s*,\s*|\s+และ\s+', m.group(1)) if n]
            # "A หรือ B และ C" -> sets [self, A, C] and [self, B, C]
            alts = [[find_item(x) for x in re.split(r'\s+หรือ\s+', n)] for n in names]
            ids = [all(a) for a in alts]
            if alts and all(ids):
                import itertools
                sets = [[int(iid)] + list(c) for c in itertools.product(*alts)]
                combo = {'sets': sets, 'script': [], 'src': 'ggt'}
                combo_list.append(combo); target = combo['script']; cond = None
            else:
                todo.append(l); target = []; cond = None          # unknown partner: drop the block
            continue
        # block conditions
        prefix_cond, rest = None, l
        m = re.match(r'\[Grade ([DCBA])\]\s*(.*)$', rest)
        if m:
            prefix_cond = f'getenchantgrade() >= {GRADE[m.group(1)]}'; rest = m.group(2)
        m = re.match(r'เมื่อ(?:อัพเกรดถึงขั้น|อัพเกรดตั้งแต่(?:ขั้น)?|ขั้นอัพเกรดตั้งแต่|ค่าอัพเกรดตั้งแต่)\s*(\d+)(?:\s*ขึ้นไป)?\s*,?\s*(.*)$', rest)
        if m:
            c = f'getrefine() >= {m.group(1)}'
            prefix_cond = f'{prefix_cond} && {c}' if prefix_cond else c; rest = m.group(2)
        m = re.match(r'เมื่อ (Armor|Boots|Shoes|Manteau|Garment|Helm|Shield|Weapon) (?:มี Grade ([DCBA])(?: ขึ้นไป)?|Grade ถึงขั้น ([DCBA]))\s*,?\s*(.*)$', rest)
        if m:
            eqi = {'Armor': 'EQI_ARMOR', 'Boots': 'EQI_SHOES', 'Shoes': 'EQI_SHOES', 'Manteau': 'EQI_GARMENT', 'Garment': 'EQI_GARMENT',
                   'Helm': 'EQI_HEAD_TOP', 'Shield': 'EQI_HAND_L', 'Weapon': 'EQI_HAND_R'}[m.group(1)]
            prefix_cond = f'getenchantgrade({eqi}) >= {GRADE[m.group(2) or m.group(3)]}'; rest = m.group(4)
        m = re.match(r'เมื่อขั้นอัพเกรด (Armor|Boots|Shoes|Manteau|Garment|Helm|Shield|Weapon)(?: ตั้งแต่)?\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            prefix_cond = f'getequiprefinerycnt({SLOT_EQI[m.group(1)]}) >= {m.group(2)}'; rest = m.group(3)
        m = re.match(r'เมื่ออาวุธ(เลเวล|ขั้นอัพเกรด)\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            fn = 'getequipweaponlv' if m.group(1) == 'เลเวล' else 'getequiprefinerycnt'
            prefix_cond = f'{fn}(EQI_HAND_R) >= {m.group(2)}'; rest = m.group(3)
        m = re.match(r'เมื่อผู้(?:ใช้งาน|สวมใส่)เป็น(?:อาชีพ)?\s*(.+?)\s*,\s*(.*)$', rest)
        if m:
            jc = job_condition(m.group(1))
            if not jc: todo.append(l); cond = '0'; continue
            prefix_cond = jc; rest = m.group(2)
        m = re.match(r'เมื่อ (STR|AGI|VIT|INT|DEX|LUK) มีค่าตั้งแต่\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            prefix_cond = f'readparam(b{m.group(1).capitalize()}) >= {m.group(2)}'; rest = m.group(3)
        m = re.match(r'เมื่อ Base Lv\.?\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            prefix_cond = f'BaseLevel >= {m.group(1)}'; rest = m.group(2)
        m = re.match(r'เมื่อ (.+?) มี(?:ขั้นอัพเกรดตั้งแต่|ขั้นอัพเกรด)\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            eqi = eqi_of_names(m.group(1), new_items)
            if not eqi: todo.append(l); cond = '0'; continue      # unknown item: drop the whole block, never apply it
            prefix_cond = f'getequiprefinerycnt({eqi}) >= {m.group(2)}'; rest = m.group(3)
        # "เมื่อ X มี Grade C ขึ้นไป," / "... มี Grade C ขึ้นไป และขั้นอัพเกรด 12 ขึ้นไป," / "... มี Grade C และขั้นอัพเกรด 10 ขึ้นไป,"
        m = re.match(r'เมื่อ (.+?) มี Grade ([DCBA])(?:\s*ขึ้นไป)?\s*(?:และ(?:มี)?(?:ขั้น)?อัพเกรด(?:ตั้งแต่)?\s*(\d+)\s*ขึ้นไป)?\s*,?\s*(.*)$', rest)
        if m:
            eqi = eqi_of_names(m.group(1), new_items)
            if not eqi: todo.append(l); cond = '0'; continue
            prefix_cond = f'getenchantgrade({eqi}) >= {GRADE[m.group(2)]}'; rest = m.group(4)
            if m.group(3):
                prefix_cond += f' && getequiprefinerycnt({eqi}) >= {m.group(3)}'
        m = re.match(r'เมื่อขั้นอัพเกรดของ Weapon และ (Helm|Armor|Garment|Shoes|Shield) รวมกันตั้งแต่\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m:
            eqi2 = {'Helm': 'EQI_HEAD_TOP', 'Armor': 'EQI_ARMOR', 'Garment': 'EQI_GARMENT', 'Shoes': 'EQI_SHOES', 'Shield': 'EQI_HAND_L'}[m.group(1)]
            prefix_cond = f'getequiprefinerycnt(EQI_HAND_R) + getequiprefinerycnt({eqi2}) >= {m.group(2)}'; rest = m.group(3)
        m = re.match(r'เมื่อ Base (STR|AGI|VIT|INT|DEX|LUK|POW|STA|WIS|SPL|CON|CRT)(?: ตั้งแต่)?\s*(\d+)(?:\s*ขึ้นไป)?\s*,?\s*(.*)$', rest)
        if m:
            prefix_cond = f'readparam(b{m.group(1).capitalize()}) >= {m.group(2)}'; rest = m.group(3)
        m = re.match(r'เมื่อ (Armor|Boots|Shoes|Manteau|Garment|Helm|Shield|Weapon) มี Grade ([DCBA])(?: ขึ้นไป)?\s*,?\s*(.*)$', rest)
        if m:
            eqi = {'Armor': 'EQI_ARMOR', 'Boots': 'EQI_SHOES', 'Shoes': 'EQI_SHOES', 'Manteau': 'EQI_GARMENT', 'Garment': 'EQI_GARMENT',
                   'Helm': 'EQI_HEAD_TOP', 'Shield': 'EQI_HAND_L', 'Weapon': 'EQI_HAND_R'}[m.group(1)]
            prefix_cond = f'getenchantgrade({eqi}) >= {GRADE[m.group(2)]}'; rest = m.group(3)
        m = re.match(r'เมื่อค่าอัพเกรดรวมกันตั้งแต่\s*(\d+)\s*ขึ้นไป\s*,?\s*(.*)$', rest)
        if m and target is not script and combo_list:
            eqis = [eqi_of(x, new_items) for x in combo_list[-1]['sets'][0]]
            if all(eqis):
                prefix_cond = ' + '.join(f'getequiprefinerycnt({e_})' for e_ in eqis) + f' >= {m.group(1)}'; rest = m.group(2)
        mult = None
        m = re.match(r'ทุก ?ๆ การอัพเกรด ?(Weapon|Helm|Armor|Garment|Manteau|Shoes|Boots|Shield|อาวุธ)?\s*(\d+)\s*ขั้น\s*,?\s*(.*)$', rest)
        if m:
            src = f'getequiprefinerycnt({SLOT_EQI[m.group(1)]})' if m.group(1) else 'getrefine()'
            mult = f'({src}/{m.group(2)})'; rest = m.group(3)
        m = re.match(r'ทุก ?ๆ\s*(\d+)\s*ขั้นอัพเกรด\s*(อาวุธ|Weapon|Helm|Armor)?\s*,?\s*(.*)$', rest)
        if m:
            src = {'Helm': 'getequiprefinerycnt(EQI_HEAD_TOP)', 'Armor': 'getequiprefinerycnt(EQI_ARMOR)'}.get(
                m.group(2), 'getequiprefinerycnt(EQI_HAND_R)' if m.group(2) else 'getrefine()')
            mult = f'({src}/{m.group(1)})'; rest = m.group(3)
        m = re.match(r'ทุก ?ๆ Base Lv\.?\s*(\d+)\s*,?\s*(.*)$', rest)
        if m:
            mult = f'(BaseLevel/{m.group(1)})'; rest = m.group(2)
        if not rest.strip():
            if prefix_cond:                             # header line: applies to the following lines
                cond = f'{cond} && {prefix_cond}' if (cond and fresh_header) else prefix_cond
                fresh_header = True
            continue
        fresh_header = False
        c = ' && '.join(x for x in (cond, prefix_cond) if x)
        # split "A, B" into parts, but keep skill lists ("Skill A, Skill B 10%") together
        parts = []
        rest = re.sub(r'(ได้(?:\s*\([^)]*\))?)\s*,\s*', lambda mm: mm.group(1) + '\x00', rest)     # "...ใช้งานสกิล X Lv.5 ได้, ..." ends a part
        for part in re.split(r'(?<=[\d%])\s*(?:,|และ)\s*|(?<=วินาที)\s*,\s*|\x00', rest):
            parts.append(part)
        if 'สกิลดังกล่าว' in rest and last_skills:
            parts = [x.replace('สกิลดังกล่าว', 'สกิล ' + ', '.join(last_skills)) for x in parts]
        stmts, ok = [], True
        for part in parts:
            r = effect(part, mult)
            if r is None:
                ok = False; break
            stmts += r
        if ok and stmts:
            emit(stmts, c)
            sk_ = [mm.group(1) for st_ in stmts for mm in [re.match(r'bonus2 bSkillAtk,"(\w+)"', st_)] if mm]
            if sk_: last_skills = sk_
        elif not ok:
            flavor = not re.search(r'\d|เพิ่ม|ลด|เพิกเฉย|ยกเลิก|ไม่ได้รับ|\+', l)
            todo.append(('skip ' if NON_COMBAT.search(l) or flavor else '') + l)
            if l.startswith('เมื่อ') and l.rstrip().endswith(',') and not re.search(r'โอกาส|ใช้งานสกิล|ใช้สกิล|โจมตี|ได้รับ|ร่าย', l):
                cond = '0'                     # a condition we could not read: the lines under it must not apply
    for combo in combo_list:
        combo['script'] = '\n'.join(combo['script'])
    combo_list = [c for c in combo_list if c['script']]
    if script:
        rec['script'] = '\n'.join(script)
    return rec, combo_list, todo


_cands = [f'{data_dir}/ggt-only.json', f'{data_dir}/../ggt-only.json', f'{data_dir}/../.cache/ggt-only.json']
_found = [c for c in _cands if os.path.exists(c)]
if not _found:
    raise SystemExit('ggt-only.json not found (written by build_equip_data.py; looked in data/, ./ and .cache/)')
ggt_only = json.load(open(_found[0], encoding='utf-8'))

new_items, new_combos, report = {}, [], []
# two passes so combos can find the location of other GGT-only items
for pass_no in (1, 2):
    new_items, new_combos, report = ({} if pass_no == 1 else new_items), [], []
    for sid, info in sorted(ggt_only.items(), key=lambda x: int(x[0])):
        rec, cmb, todo = translate(int(sid), info, new_items)
        if sid in manual:
            rec.update(manual[sid]); todo = []
        if not rec['loc'] and rec.get('sub') != 'Enchant':
            report.append(f'{sid}\t{info["name"]}\t(no equip location) ' + ' | '.join(l for l in info['desc'] if 'ประเภท' in l))
            continue
        new_items[sid] = rec
        new_combos += cmb
        for t in todo:
            report.append(f'{sid}\t{info["name"]}\t{t}')
report.sort(key=lambda x: x.split('\t')[2].startswith('skip '))

items.update(new_items)
combos += new_combos
json.dump(dict(sorted(items.items(), key=lambda x: int(x[0]))), open(f'{data_dir}/items.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump(combos, open(f'{data_dir}/combos.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
open(report_path, 'w', encoding='utf-8').write('\n'.join(report) + '\n')
with_script = sum(1 for v in new_items.values() if v.get('script'))
print('of which enchants:', sum(1 for v in new_items.values() if v.get('sub') == 'Enchant'),
      '| enchants with bonuses or combos:', sum(1 for k, v in new_items.items() if v.get('sub') == 'Enchant' and
                                                (v.get('script') or any(int(k) in s_ for c_ in new_combos for s_ in c_['sets']))))
print(f'GGT-only items added: {len(new_items)} (with bonuses: {with_script}), combos: {len(new_combos)}, '
      f'untranslated lines: {sum(1 for r in report if not r.split(chr(9))[2].startswith("skip "))} '
      f'(+{sum(1 for r in report if r.split(chr(9))[2].startswith("skip "))} non-combat lines skipped)')
