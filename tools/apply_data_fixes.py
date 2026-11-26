"""Apply tools/data_fixes.json (corrections to the server data) to data/items.json and data/combos.json.
Usage: python apply_data_fixes.py <data dir>      (build_equip_data.py calls apply() before writing)
Every fix must change something; a fix that no longer matches is reported, so a server update that already
corrected the data (or changed it) is noticed."""
import json, os, sys

FIXES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data_fixes.json')


def apply(items, combos, log=print):
    fx = json.load(open(FIXES, encoding='utf-8'))
    for f in fx['items']:
        old, new = f['replace']
        for i in f['ids']:
            it = items.get(str(i))
            if it and old in (it.get('script') or ''):
                it['script'] = it['script'].replace(old, new)
            else:
                log(f'  fix not applied: item {i} ({f["why"][:50]})')
    for f in fx['combos']:
        if 'with' in f:
            old, new = f['replace']
            n = 0
            for c in combos:
                if any(i in s for s in c['sets'] for i in f['with']) and old in c['script']:
                    c['script'] = c['script'].replace(old, new); n += 1
            if not n: log(f'  fix not applied: combo with {f["with"]}')
        elif 'remove' in f:
            n = 0
            for c in combos:
                k = len(c['sets'])
                c['sets'] = [s for s in c['sets'] if sorted(s) != sorted(f['remove'])]
                n += k - len(c['sets'])
            if not n: log(f'  fix not applied: remove set {f["remove"]}')
        elif 'add_to' in f:
            c = next((c for c in combos if any(sorted(s) == sorted(f['add_to']) for s in c['sets'])), None)
            if not c: log(f'  fix not applied: no combo with set {f["add_to"]}'); continue
            for s in f['sets']:
                if not any(sorted(x) == sorted(s) for x in c['sets']): c['sets'].append(s)
    combos[:] = [c for c in combos if c['sets']]


if __name__ == '__main__':
    d = sys.argv[1]
    items = json.load(open(f'{d}/items.json', encoding='utf-8'))
    combos = json.load(open(f'{d}/combos.json', encoding='utf-8'))
    apply(items, combos)
    json.dump(items, open(f'{d}/items.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(combos, open(f'{d}/combos.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('fixes applied')
