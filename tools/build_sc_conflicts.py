"""Which statuses end or block each other, from rAthena db/re/status.yml.
Usage: python build_sc_conflicts.py <rathena db/re/status.yml> <out data/scconflict.json>

  end   EndOnStart: starting this status ends these (Endow ends Enchant Poison, a song ends the other songs...)
  fail  Fail: this status does not start while one of these is on
Both use SC_ names, as in data/sc.json. The simulator uses them so that the buff turned on last wins."""
import json, re, sys

src, out_p = sys.argv[1:3]
res, cur, key = {}, None, None
for line in open(src, encoding='utf-8'):
    m = re.match(r'  - Status: (\w+)\s*$', line)
    if m:
        cur, key = 'SC_' + m.group(1).upper(), None
        continue
    if cur is None:
        continue
    m = re.match(r'    (\w+):\s*$', line)
    if m:
        key = {'EndOnStart': 'end', 'Fail': 'fail'}.get(m.group(1))
        continue
    if re.match(r'    \S', line):
        key = None
        continue
    m = re.match(r'      (\w+): true\s*$', line)
    if key and m:
        res.setdefault(cur, {}).setdefault(key, []).append('SC_' + m.group(1).upper())
json.dump(res, open(out_p, 'w', encoding='utf-8'), separators=(',', ':'), sort_keys=True)
print('statuses with conflicts:', len(res))
