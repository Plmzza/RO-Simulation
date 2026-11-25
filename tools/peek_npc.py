"""Compact view of one enchant NPC for writing a handler: arrays of enchant ids, slot writes, targets.
usage: peek_npc.py <npc_dir> <items.json> <file> <npc name substring>"""
import json, re, sys
npc_dir, items_path, rel, name = sys.argv[1:5]
it = json.load(open(items_path, encoding='utf-8'))
ENCH = {int(k) for k, v in it.items() if v.get('sub') == 'Enchant' or v.get('type') == 'Card'}
txt = open(npc_dir + '/' + rel, encoding='utf-8', errors='replace').read()
i = txt.index(name)
m = re.search(r'\n\S[^\n]*\t(?:script|duplicate\([^)]*\))\t', txt[i + 1:])
b = txt[i: i + 1 + m.start()] if m else txt[i:]
nm = lambda x: it.get(str(x), {}).get('name', '?')
for ln_no, ln in enumerate(b.split('\n')):
    code = re.sub(r'//.*', '', ln).strip()
    if not code or code.startswith('mes '):
        continue
    ids = [int(x) for x in re.findall(r'\b(\d{4,6})\b', code)]
    en = [x for x in ids if x in ENCH]
    eq = [x for x in ids if it.get(str(x), {}).get('type') in ('Weapon', 'Armor')]
    slotw = re.search(r'card\w*\[\s*\d\s*\]\s*=|enchant\w*\[\s*\d\s*\]|getitem2|delequip|getequipcardid|setarray|case |callsub|callfunc|function|^\w+:|getarg', code)
    if en or eq or slotw:
        tag = ''
        if en:
            tag += ' E[' + ','.join(nm(x) for x in en[:12]) + (' …%d' % len(en) if len(en) > 12 else '') + ']'
        if eq:
            tag += ' T[' + ','.join(nm(x) for x in eq[:6]) + (' …%d' % len(eq) if len(eq) > 6 else '') + ']'
        print(ln_no, re.sub(r'\d{4,6}(,\s*\d{4,6})+', '<ids>', code)[:110] + tag)
