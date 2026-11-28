"""Monsters of memorial dungeons (instances). Their scripts spawn monsters with monster/areamonster commands at run
time, so there are no spawn lines; this reads the commands and resolves the monster id when it is a number, an
aegis name ("MD_MARIN") or a variable set in the same file (.@mob = 3200; setarray .@mob, 3200, 3201; ...).
Used by build_mob_spawns.py: each instance becomes one pseudo map "md:<instance name>"."""
import os, re

FIX_NAMES = {'Villaof Deception': 'Villa of Deception', 'Last room': 'Last Room', 'Werner Laboratory central room#1': 'Werner Laboratory Central Room',
             'Nydhoggs Nest': "Nidhoggur's Nest", 'Orcs Memory': "Orc's Memory", 'Ritual Of Blessing': 'Ritual of Blessing', 'Room Of Consciousness': 'Room of Consciousness'}
CALL = re.compile(r'\b(?:area)?monster\s*\(?\s*(.*?);', re.S)
STR = re.compile(r'"(?:[^"\\]|\\.)*"')


def split_args(s):
    out, depth, cur, q = [], 0, '', False
    for ch in s:
        if ch == '"':
            q = not q
        if not q:
            if ch in '([':
                depth += 1
            elif ch in ')]':
                depth -= 1
            elif ch == ',' and depth == 0:
                out.append(cur.strip()); cur = ''; continue
        cur += ch
    out.append(cur.strip())
    return out


def instance_name(text, folder):
    m = re.search(r'\.@md_name\$\s*=\s*"([^"]+)"', text) or re.search(r'instance_create\s*\(\s*"([^"]+)"', text)
    if m:
        return m.group(1)
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', folder).replace('_', ' ')


def md_spawns(root, files, mobs):
    aegis = {m['aegis'].upper(): int(i) for i, m in mobs.items() if m.get('aegis')}
    def ids_of(tok, text):
        tok = tok.strip()
        if re.fullmatch(r'\d+', tok):
            return [int(tok)]
        if re.fullmatch(r'"\w+"', tok):
            return [aegis[tok[1:-1].upper()]] if tok[1:-1].upper() in aegis else []
        if re.search(r'[?():]', tok):                     # expression, e.g. ('ogh_h ? 3145 : 2470): every id in it
            lit = [int(x) for x in re.findall(r'\b\d{4,5}\b', tok)] + [aegis[x.upper()] for x in re.findall(r'"(\w+)"', tok) if x.upper() in aegis]
            if lit:
                return lit
        var = re.match(r"[\.\$@'\w]+", tok)
        if not var:
            return []
        v = re.escape(var.group(0))
        found = []
        for m in re.finditer(rf'(?:setarray\s+{v}(?:\[\d+\])?\s*,|set\s+{v}(?:\[\d+\])?\s*,|{v}(?:\[\d+\])?\s*=(?!=))([^;]*);', text):
            for t in split_args(m.group(1)):
                found += [x for x in ids_of(t, '') if x] if (t.isdigit() or t.startswith('"')) else []
        return found
    map_md = {}                 # instance map -> instance name (db/re + db/import instance_db.yml), for files with several instances
    for y in ('db/re/instance_db.yml', 'db/import/instance_db.yml'):
        if os.path.exists(os.path.join(root, y)):
            name = None
            for l in open(os.path.join(root, y), encoding='utf-8', errors='replace'):
                m = re.match(r'\s+Name:\s*(.+?)\s*$', l) if not l.lstrip().startswith('#') else None
                if m:
                    name = m.group(1)
                m = re.match(r'\s+(?:Map|- )\s*:?\s*(\d@[\w\-]+)', l) if not l.lstrip().startswith('#') else None
                if m and name:
                    map_md.setdefault(m.group(1), name)
    out = {}
    for f in files:
        if not f.replace('\\', '/').startswith('npc/instances/'):
            continue
        p = os.path.join(root, f)
        if not os.path.exists(p):
            continue
        text = re.sub(r'//[^\n]*|/\*.*?\*/', '', open(p, encoding='utf-8', errors='replace').read(), flags=re.S)
        name = instance_name(text, f.split('/')[2])
        multi = len(set(re.findall(r'\.@md_name\$\s*=\s*"([^"]+)"', text))) > 1     # several instances in one file: split them by map
        cnt = out.setdefault(name, {})
        for m in CALL.finditer(text):
            a = split_args(m.group(1))
            si = next((i for i, x in enumerate(a) if STR.fullmatch(x)), None)    # the monster's display name
            if si is None or si + 1 >= len(a):
                continue
            n = int(a[si + 2]) if si + 2 < len(a) and a[si + 2].isdigit() else 1
            mm = re.search(r'"(\d@[\w\-]+)"', a[0]) if multi else None
            if multi and not mm and re.fullmatch(r"[\.\$@'\w]+", a[0]):     # map in a variable: its last instance_mapname("1@...") before the call
                sets = list(re.finditer(re.escape(a[0]) + r'\s*=\s*instance_mapname\(\s*("?)([^")\s]+)"?\s*\)', text[:m.start()]))
                if sets:
                    arg = sets[-1].group(2)
                    if not sets[-1].group(1):                     # instance_mapname($MAP$): the map name set elsewhere in the file
                        v = re.search(re.escape(arg) + r'\s*=\s*"(\d@[\w\-]+)"', text)
                        arg = v.group(1) if v else ''
                    mm = re.match(r'(\d@[\w\-]+)', arg)
            cnt = out.setdefault(map_md[mm.group(1)], {}) if mm and mm.group(1) in map_md else out[name]
            for mid in ids_of(a[si + 1], text):
                m2 = mobs.get(str(mid))
                if m2 and m2.get('class') != 'Battlefield' and m2['hp'] > 1:     # skip script helpers (event markers, 1-HP objects)
                    cnt[str(mid)] = cnt.get(str(mid), 0) + n
    return {FIX_NAMES.get(k, k): v for k, v in out.items() if v}
