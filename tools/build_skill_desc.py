"""Skill descriptions for the sim's skill window, from the Divine Pride cache: Thai (thROG page text,
fetch_skill_desc_th.py) when there is one, else English (API, fetch_skill_desc.py).
Usage: python build_skill_desc.py <data dir>
Out: data/skilldesc.json { SKILL_NAME: text }  (color codes ^rrggbb kept; the sim colours them like the client)

The client text breaks lines at a fixed width, often in the middle of a sentence. Here every line is joined to the
one before unless it starts something new: a "[Level n]" line, a "Label: value" line, a list mark, or the line
before ended a sentence. Spaces are tidied the same way everywhere."""
import glob, json, os, re, sys

data = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cache = os.path.join(root, '.cache', 'divine-pride', 'skill')
info = json.load(open(os.path.join(data, 'skillinfo.json'), encoding='utf-8'))
by_id = {v['id']: k for k, v in info.items() if v.get('id')}

COL = r'(?:\^[0-9a-fA-F]{6})*'
NEW_LINE = re.compile(r'^' + COL + r'\s*(?:(?=\^(?!000000)[0-9a-fA-F]{6})|\[(?:Level|Lv)\s*\d+|[-•*]\s|\d+\.\s|[A-Z][A-Za-z0-9 ./&\'()+-]{1,32}\s*:)')
END = re.compile(r'[.!?:)\]]' + COL + r'\s*$')


THAI = re.compile('[\u0e00-\u0e7f]')


def clean_th(t):
    """Thai text: the translators' line breaks are kept; spaces are tidied (doubled spaces, spaces inside colour
    codes, "label  :  value")."""
    t = t.replace('\r', '')
    t = re.sub(r'\^ffffff_\^000000', '', t, flags=re.I)                   # the client's blank-line trick
    lines = []
    for l in t.split('\n'):
        l = re.sub(r'(?<=[A-Za-z]):(?=\d)', ': ', l)                          # "Bonus:10%" -> "Bonus: 10%"
        l = re.sub(r'[ \t\u00a0]+', ' ', l)
        l = re.sub(r'(\^[0-9a-fA-F]{6}) +', r'\1', l)                      # "^777777 text" -> "^777777text"
        l = re.sub(r' +(\^000000)', r'\1', l)                               # "text ^000000" -> "text^000000"
        l = re.sub(r' *: *', ' : ', l, count=1) if ':' in l else l           # one "label : value" form
        lines.append(l.strip())
    if lines and not re.search(r':', lines[0]) and not lines[0].upper().startswith('MAX'):
        lines = lines[1:]                                                     # first line is the skill name
    t = '\n'.join(lines).strip()
    return re.sub(r'\n{3,}', '\n\n', t)


def clean(desc, name):
    t = desc.replace('\r', '')
    t = re.sub(r'\^ffffff_\^000000', '\n', t, flags=re.I)          # the client's blank-line trick
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in t.split('\n')]
    norm = lambda x: re.sub(r'[^a-z0-9]', '', x.lower())
    if lines and (norm(re.sub(COL, '', lines[0])) == norm(name) or not re.search(r':', lines[0]) and not lines[0].upper().startswith('MAX')):
        lines = lines[1:]                                           # first line repeats the skill name
    out = []
    for l in lines:
        plain = re.sub(COL, '', l).strip()
        if not plain:
            if out and out[-1] != '':
                out.append('')
            continue
        if out and out[-1] != '' and not NEW_LINE.match(l) and not END.search(out[-1]):
            out[-1] = out[-1] + ' ' + l
        else:
            out.append(l)
    t = '\n'.join(out).strip()
    t = re.sub(r'\s+:', ':', t)                                     # "Label :" -> "Label:"
    t = re.sub(r':(?=\S)', ': ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t


out, missing = {}, 0
for f in glob.glob(os.path.join(cache, '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if not d or not d.get('description'):
        missing += 1
        continue
    n = by_id.get(d['id']) or d.get('databaseName')
    if n not in info:
        continue
    out[n] = clean(d['description'], d.get('name') or info[n]['name'])
th_cache = os.path.join(root, '.cache', 'divine-pride', 'skill-th')
th = 0
for n, v in info.items():
    f = os.path.join(th_cache, f"{v.get('id')}.txt")
    if os.path.exists(f):
        t = open(f, encoding='utf-8').read().strip()
        if THAI.search(t):
            out[n] = clean_th(t); th += 1
print('Thai', th)
json.dump(out, open(os.path.join(data, 'skilldesc.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print('skills with text', len(out), '| no text', missing)
