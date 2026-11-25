"""Build status/data.json for the Status Calculator from rAthena (renewal) db files.
Usage: python build_status_data.py <rathena_dir> <resolver.json> <sim-data.json> <out.json>"""
import json, sys, yaml
rdir, resolver_p, simdata_p, out_p = sys.argv[1:5]
L = lambda f: yaml.safe_load(open(f'{rdir}/db/re/{f}.yml', encoding='utf-8'))['Body']
stats, basep, expd, aspd, statp = L('job_stats'), L('job_basepoints'), L('job_exp'), L('job_aspd'), L('statpoint')

def per_job(body):
    m = {}
    for e in body:
        for j in e['Jobs']:
            m.setdefault(j, {}).update({k: v for k, v in e.items() if k != 'Jobs'})
    return m
S, B, E, A = per_job(stats), per_job(basep), per_job(expd), per_job(aspd)

NINJA = {25, 4211, 4212, 4304, 4305}; GUNS = {24, 4215, 4306}
SUMMONER = {4218, 4308}; SNOVICE = {23, 4190, 4307}
def calc_hp(lv, s, jid):  # JobDatabase::calc_basehp (renewal)
    hp = 35. + int(lv * (s.get('HpIncrease', 500) / 100.))
    for i in range(2, lv + 1): hp += int((s.get('HpFactor', 0) / 100.) * i + 0.5)
    if jid in SUMMONER: hp += int(hp / 2 + 0.5)
    elif jid in SNOVICE: hp += (2000 if lv >= 99 else 0) + (2000 if lv >= 150 else 0)
    return int(hp)
def calc_sp(lv, s, jid):  # JobDatabase::calc_basesp
    sp = 10. + int(lv * (s.get('SpIncrease', 100) / 100.))
    for i in range(2, lv + 1): sp += int((s.get('SpFactor', 0) / 100.) * i + 0.5)
    if jid in NINJA: sp = sp - 22 if lv >= 10 else 11 + 3 * lv
    elif jid in GUNS: sp = sp - 18 if lv >= 10 else 9 + 3 * lv
    elif jid in SUMMONER: sp += int(sp / 2 + 0.5)
    return int(sp)
def calc_ap(lv, s, jid):  # JobDatabase::calc_baseap
    ap = (200. if lv >= 200 else 0.) + int(lv * (s.get('ApIncrease', 0) / 100.))
    for i in range(2, lv + 1): ap += int((s.get('ApFactor', 0) / 100.) * i + 0.5)
    return int(ap)
def table(rows, key, maxlv, fallback):
    vals = {r['Level']: r[key] for r in rows or []}
    return [vals.get(lv) or fallback(lv) for lv in range(1, maxlv + 1)]

STAT_KEYS = ['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk', 'Pow', 'Sta', 'Wis', 'Spl', 'Con', 'Crt']
def job_entry(name, jid):
    s, b, e, a = S.get(name, {}), B.get(name, {}), E.get(name, {}), A.get(name, {})
    maxb, maxj = e.get('MaxBaseLevel', 99), e.get('MaxJobLevel', 50)
    bonus = [[r['Level']] + [r.get(k, 0) for k in STAT_KEYS] for r in s.get('BonusStats', [])]
    return {
        'maxBase': maxb, 'maxJob': maxj, 'maxWeight': s.get('MaxWeight', 20000),
        'hp': table(b.get('BaseHp'), 'Hp', maxb, lambda lv: calc_hp(lv, s, jid)),
        'sp': table(b.get('BaseSp'), 'Sp', maxb, lambda lv: calc_sp(lv, s, jid)),
        'ap': table(b.get('BaseAp'), 'Ap', maxb, lambda lv: calc_ap(lv, s, jid)),
        'bonus': bonus, 'aspd': a.get('BaseASPD', {}),
    }

FIRST = {1, 2, 3, 4, 5, 6, 4046}
SECOND = set(range(7, 21)) | {23, 24, 25, 4047, 4049}
TRANS2 = set(range(4008, 4022))
THIRD = set(range(4054, 4073))
EXT = {4211, 4212, 4215, 4218, 4239, 4240}
FOURTH = set(range(4252, 4265))
FOURTH_EXP = set(range(4302, 4309))
RANGED = ['Bow', 'Musical', 'Whip', 'Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade']

res = json.load(open(resolver_p, encoding='utf-8'))['jobs']
ui = json.load(open(simdata_p, encoding='utf-8'))['jobs']
jobs, classes = [], {}
# Jobs the costume simulator has no sprite list for, but which the calculator needs
EXTRA_JOBS = [[4190, 'Super Novice E', 0]]
ui = ui + [j for j in EXTRA_JOBS if j[0] not in {x[0] for x in ui}]
THIRD = THIRD | {4190}
for j in ui:
    jid = j[0]
    en = res[str(jid)]['name_en'] if str(jid) in res else j[1]
    rname = en.replace(' ', '_')
    third_like = jid in THIRD | EXT | FOURTH | FOURTH_EXP
    entry = {'id': jid, 'name': en, 'icon': bool(j[2]), 'class': rname,
             'maxStat': 130 if third_like else 99,
             'maxAspd': 193 if third_like else 190,
             'upper': jid in TRANS2 or jid in FOURTH,
             'traits': jid in FOURTH | FOURTH_EXP}
    classes[rname] = job_entry(rname, jid)
    if jid in THIRD and f'{rname}_T' in E:
        entry['transClass'] = f'{rname}_T'; classes[f'{rname}_T'] = job_entry(f'{rname}_T', jid)
    jobs.append(entry)

points = [0] * 300; traits = [0] * 300
for r in statp:
    points[r['Level'] - 1] = r['Points']; traits[r['Level'] - 1] = r.get('TraitPoints', 0)
last_p = last_t = 0
for i in range(300):
    last_p = points[i] or last_p; points[i] = last_p
    last_t = traits[i] or last_t; traits[i] = last_t
out = {'source': 'rAthena db/re (renewal)', 'statKeys': STAT_KEYS, 'rangedWeapons': RANGED,
       'transcendentPoints': 52, 'traitJobChangePoints': 7, 'maxTrait': 110,
       'statPoints': points, 'traitPoints': traits, 'jobs': jobs, 'classes': classes}
json.dump(out, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(jobs), 'jobs', len(classes), 'classes')
