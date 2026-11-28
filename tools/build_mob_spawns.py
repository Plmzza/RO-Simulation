"""Where each monster spawns, from the server's NPC scripts (the files the server loads: npc/re/scripts_main.conf and
its imports). Lines: "map[,x,y[,xs,ys]]\tmonster|boss_monster|miniboss_monster\tName[,lv]\tID,amount[,...]".
Usage: python build_mob_spawns.py <server root> <out data/mobspawn.json>
Memorial dungeons come from tools/md_spawns.py as maps "md:<name>" with zone type 'memorial'.
Out: { "mobs": { id: [[map, amount], ...] }, "maps": { map: area }, "zones": { map: [zone name, field|dungeon|other] } } (zones from tools/zones.json)  (area = the spawn file with most of the map's monsters, e.g. glastheim)"""
import json, os, re, sys

root, out_p = sys.argv[1:3]
seen, files = set(), []


def conf(path):
    if path in seen or not os.path.exists(os.path.join(root, path)):
        return
    seen.add(path)
    for l in open(os.path.join(root, path), encoding='utf-8', errors='replace'):
        l = l.split('//')[0].strip()
        m = re.match(r'(npc|import)\s*:\s*(\S+)', l)
        if not m:
            continue
        if m.group(1) == 'import':
            conf(m.group(2))
        else:
            files.append(m.group(2))


for c in ('npc/re/scripts_main.conf', 'npc/scripts_custom.conf', 'conf/import/npc_conf.txt', 'npc/scripts_athena.conf'):
    conf(c)
SPAWN = re.compile(r'^([\w@\-]+)(?:,\d+,\d+(?:,\d+,\d+)?)?\t(?:boss_|miniboss_)?monster\t[^\t]*\t(\d+),(\d+)')
mobs, maps, area_n = {}, {}, {}
for f in dict.fromkeys(files):
    p = os.path.join(root, f)
    if not os.path.exists(p):
        continue
    area = re.sub(r'_(re|pre)$', '', os.path.splitext(os.path.basename(f))[0])
    for l in open(p, encoding='utf-8', errors='replace'):
        if l.lstrip().startswith('//'):
            continue
        m = SPAWN.match(l.strip('\n'))
        if not m:
            continue
        mp, mid, n = m.group(1), m.group(2), int(m.group(3))
        area_n.setdefault(mp, {})[area] = area_n.setdefault(mp, {}).get(area, 0) + n
        lst = mobs.setdefault(mid, {})
        lst[mp] = lst.get(mp, 0) + n
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from md_spawns import md_spawns
mobdb = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'mobs.json'), encoding='utf-8'))
md = md_spawns(root, list(dict.fromkeys(files)), mobdb)
for name, cnt in md.items():                     # memorial dungeons: one pseudo map per instance
    mp = 'md:' + name
    area_n[mp] = {'memorial': 1}
    for mid, n in cnt.items():
        mobs.setdefault(mid, {})[mp] = n
maps = {mp: max(c, key=c.get) for mp, c in area_n.items()}         # area = the file with most of the map's spawns
zr = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zones.json'), encoding='utf-8'))['zones']
zr = sorted(zr, key=lambda z: -len(z[0]))
zones = {}
for mp in area_n:
    z = [None, mp[3:], 'memorial'] if mp.startswith('md:') else next((z for z in zr if mp.startswith(z[0])), None)
    zones[mp] = [z[1], z[2]] if z else [maps[mp].replace('_', ' ').title(), 'other']
out = {'zones': zones, 'mobs': {k: sorted(v.items(), key=lambda x: -x[1]) for k, v in mobs.items()}, 'maps': maps}
json.dump(out, open(out_p, 'w', encoding='utf-8'), separators=(',', ':'))
print('files', len(files), '| monsters that spawn', len(mobs), '| maps', len(maps))
