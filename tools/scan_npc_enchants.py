"""Scan rAthena NPC scripts for enchant NPCs (survey only).

For every script block: equipment targets (weapon/armor ids that appear in
`case N:` or setarray lists), enchant stones referenced (items.json sub=Enchant)
and the card indexes the block writes. Output: JSON lines for review.

usage: python3 scan_npc_enchants.py <npc_dir> <items.json> > survey.jsonl
"""
import json, os, re, sys

npc_dir, items_path = sys.argv[1], sys.argv[2]
items = json.load(open(items_path, encoding='utf-8'))
ENCH = {int(k) for k, v in items.items() if v.get('sub') == 'Enchant'}
EQUIP = {int(k) for k, v in items.items() if v.get('type') in ('Weapon', 'Armor', 'ShadowGear')}

HEAD = re.compile(r'^\S.*\t(?:script|duplicate\([^)]*\))\t')
NUM = re.compile(r'\b(\d{4,6})\b')
SLOTW = [re.compile(r'\.@\w*card\w*\[\s*(\d)\s*\]\s*=(?!=)'),
         re.compile(r'setarray\s+\.@\w*(?:card|enchant)\w*\[\s*(\d)\s*\]')]


def strip(line):
    return re.sub(r'//.*', '', line)


for root, _, files in os.walk(npc_dir):
    if 'pre-re' in root:
        continue
    for fn in files:
        if not fn.endswith('.txt') or fn.endswith('_pre.txt'):
            continue
        path = os.path.join(root, fn)
        lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
        blocks, cur = [], None
        for i, ln in enumerate(lines):
            if HEAD.match(ln):
                cur = {'name': ln.split('\t')[2] if ln.count('\t') >= 2 else ln, 'line': i + 1, 'body': []}
                blocks.append(cur)
            elif cur:
                cur['body'].append(strip(ln))
        for b in blocks:
            body = '\n'.join(b['body'])
            nums = {int(n) for n in NUM.findall(body)}
            ench = sorted(nums & ENCH)
            if len(ench) < 2:
                continue
            targets = sorted({int(n) for n in re.findall(r'case\s+(\d{4,6})\s*:', body)} & EQUIP)
            if not targets:
                targets = sorted(nums & EQUIP)
            slots = sorted({int(s) for rx in SLOTW for s in rx.findall(body)})
            print(json.dumps({'file': os.path.relpath(path, npc_dir), 'npc': b['name'], 'line': b['line'],
                              'targets': targets, 'ench': ench, 'slots': slots}, ensure_ascii=False))
