"""Add random-option groups the server data lacks (tools/randomopt_extra.json) to data/randomopt.json.
Run after build_randomopt.py.  usage: build_randomopt_extra.py <data dir>"""
import json, os, sys
data = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
ex = json.load(open(os.path.join(here, 'randomopt_extra.json'), encoding='utf-8'))
p = os.path.join(data, 'randomopt.json')
ro = json.load(open(p, encoding='utf-8'))
for k, g in ex['groups'].items():
    g = {kk: vv for kk, vv in g.items() if kk != 'src'}
    for lst in g['slots'] + [g['random']]:
        lst[:] = [o for o in lst if o['o'] in ro['options']]
    ro['groups'][k] = g
for k, r in ex.get('reshape', {}).items():           # fix server groups to match the GGT pages
    g = ro['groups'].get(k)
    if not g:
        continue
    for lst in g['slots'] + [g['random']]:
        for o in lst:
            o['o'] = r.get('rename', {}).get(o['o'], o['o'])
    if r.get('secondLineRandom') and len(g['slots']) == 2:
        g['random'], g['maxRandom'], g['slots'] = g['slots'][1], 1, g['slots'][:1]
for iid, groups in ex['items'].items():
    cur = ro['items'].setdefault(iid, [])
    for gname in groups:
        if gname not in cur:
            cur.append(gname)
json.dump(ro, open(p, 'w', encoding='utf-8'), separators=(',', ':'))
print('groups', len(ro['groups']), 'items', len(ro['items']))
