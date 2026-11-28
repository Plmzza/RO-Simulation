"""Download skill descriptions from the Divine Pride API (English text; Divine Pride has no Thai skill text).
Usage: python fetch_skill_desc.py <data dir>
Key: .secrets/divine-pride-api-key.txt (never committed). One request per 1.1 s (Divine Pride allows 1 req/s).
Responses are cached in .cache/divine-pride/skill/<id>.json, so a stopped run continues where it left off.
Then run build_skill_desc.py to make data/skilldesc.json."""
import json, os, sys, time, urllib.request, urllib.error

data = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
key = open(os.path.join(root, '.secrets', 'divine-pride-api-key.txt'), encoding='utf-8').readline().strip()
cache = os.path.join(root, '.cache', 'divine-pride', 'skill')
os.makedirs(cache, exist_ok=True)
info = json.load(open(os.path.join(data, 'skillinfo.json'), encoding='utf-8'))
ids = sorted({v['id'] for v in info.values() if v.get('id')})
todo = [i for i in ids if not os.path.exists(os.path.join(cache, f'{i}.json'))]
print('skills', len(ids), 'to fetch', len(todo), flush=True)
for n, i in enumerate(todo, 1):
    url = f'https://www.divine-pride.net/api/database/Skill/{i}?apiKey={key}&server=thROG'
    req = urllib.request.Request(url, headers={'Accept-Language': 'th', 'User-Agent': 'RO-Simulation'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            open(os.path.join(cache, f'{i}.json'), 'wb').write(body)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                open(os.path.join(cache, f'{i}.json'), 'w').write('null')
                break
            time.sleep(5 * (attempt + 1))          # 429 / 5xx: wait longer and try again
        except Exception:
            time.sleep(5 * (attempt + 1))
    if n % 50 == 0:
        print(n, '/', len(todo), flush=True)
    time.sleep(1.1)
print('done', flush=True)
