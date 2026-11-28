"""Fetch monsters from the Divine Pride API (server thROG) into .cache/divine-pride/mob/<id>.json, for monsters whose
server mob_db entry is only a stub (no stats / aegis name as name). Key: .secrets/divine-pride-api-key.txt (never
committed, never printed). One request per 1.1 s (Divine Pride allows 1 req/s).
Usage: python fetch_mob_dp.py <id> [<id> ...]"""
import json, os, sys, time, urllib.request, urllib.error

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
key = open(os.path.join(root, '.secrets', 'divine-pride-api-key.txt'), encoding='utf-8').readline().strip()
cache = os.path.join(root, '.cache', 'divine-pride', 'mob')
os.makedirs(cache, exist_ok=True)
for i in sys.argv[1:]:
    p = os.path.join(cache, f'{i}.json')
    if os.path.exists(p) and os.path.getsize(p) > 2:
        continue
    req = urllib.request.Request(f'https://www.divine-pride.net/api/database/Monster/{i}?apiKey={key}&server=thROG',
                                 headers={'Accept-Language': 'en-US', 'User-Agent': 'ro-sim'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            open(p, 'wb').write(r.read())
        print(i, 'ok')
    except urllib.error.HTTPError as e:
        print(i, 'HTTP', e.code)
    time.sleep(1.1)
