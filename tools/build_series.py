"""Equipment series for the sim's craft window.
Usage: python build_series.py <tools/series_rules.json> <data/items.json> <out data/series.json> [review.csv]
Rules match the English item name (see series_rules.json). Output: {"series": [[name, [ids...]], ...]} in rule order."""
import csv, json, re, sys

rules_p, items_p, out_p = sys.argv[1:4]
conf = json.load(open(rules_p, encoding='utf-8'))
rules, removed = conf['series'], set(conf.get('removed', []))
pinned = {i for r in rules for i in r.get('ids', [])}      # set by hand: only in the series that list them
items = json.load(open(items_p, encoding='utf-8'))
EQUIP = {'Armor', 'Weapon', 'ShadowGear'}
out, rows = [], []
for r in rules:
    rx = re.compile(r['re'], re.I) if r.get('re') else None
    no = re.compile(r['not'], re.I) if r.get('not') else None
    ids = []
    for k, it in (items.items() if rx else []):
        if int(k) in removed or int(k) in pinned:
            continue
        if it['type'] not in EQUIP or not it.get('loc'):
            continue
        n = it['name']
        if not r.get('costume') and any(l.startswith('Costume') for l in it['loc']):
            continue
        if rx.search(n) and not (no and no.search(n)):
            ids.append(int(k))
    ids = sorted((set(ids) | set(r.get('ids', []))) - removed)
    out.append([r['name'], ids])
    rows += [[r['name'], i, items.get(str(i), {}).get('name', '?'), items.get(str(i), {}).get('loc', [''])[0]] for i in ids]
json.dump({'series': out}, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
if len(sys.argv) > 4:
    with open(sys.argv[4], 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(['series', 'id', 'name', 'position']); w.writerows(rows)
print('series', len(out), 'items', len(rows))
for n, ids in out:
    if len(ids) < 3: print('  few:', n, len(ids))
