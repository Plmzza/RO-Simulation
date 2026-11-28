"""Thai skill descriptions (thROG) from the Divine Pride skill pages (the API only gives English / Korean).
Usage: python fetch_skill_desc_th.py <data dir>
One page per 1.1 s (Divine Pride allows 1 req/s). From each page only the "thROG - Thai" card text is kept, as
client text (^rrggbb colour codes, \\n line breaks), in .cache/divine-pride/skill-th/<id>.txt; a stopped run
continues where it left off. build_skill_desc.py prefers this text over the English one."""
import html, json, os, re, sys, time, urllib.request

data = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cache = os.path.join(root, '.cache', 'divine-pride', 'skill-th')
os.makedirs(cache, exist_ok=True)
info = json.load(open(os.path.join(data, 'skillinfo.json'), encoding='utf-8'))
ids = sorted({v['id'] for v in info.values() if v.get('id')})
todo = [i for i in ids if not os.path.exists(os.path.join(cache, f'{i}.txt')) or os.path.getsize(os.path.join(cache, f'{i}.txt')) == 0]
print('skills', len(ids), 'to fetch', len(todo), flush=True)
HDR = {'Cookie': 'dp_region=thROG; dp_language=thai; dp_ui_language=th', 'Accept-Language': 'th', 'User-Agent': 'RO-Simulation'}


def p_after(page, i):
    m = re.search(r'<p[^>]*>(.*?)</p>', page[i:i + 20000], re.S)
    return m.group(1) if m else None


def card_text(page, server='thROG - Thai'):
    # with the thROG cookie the main card is the thROG text; otherwise it is under "Other servers"
    t = None
    i = page.find('card card-lg')
    if i >= 0:
        t = p_after(page, i)
        if t and not re.search('[\u0e00-\u0e7f]', t):
            t = None
    if t is None:
        i = page.find(server)
        t = p_after(page, i) if i >= 0 else None
    if t is None:
        return None
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'<span style="color:\s*#([0-9a-fA-F]{6});?">', r'^\1', t)
    t = re.sub(r'</span>', '^000000', t)
    t = re.sub(r'<[^>]+>', '', t)
    return html.unescape(t).strip()


for n, i in enumerate(todo, 1):
    txt = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(f'https://www.divine-pride.net/database/skill/{i}', headers=HDR)
            with urllib.request.urlopen(req, timeout=30) as r:
                page = r.read().decode('utf-8', 'replace')
            txt = card_text(page) or ''
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                txt = ''
                break
            time.sleep(5 * (attempt + 1))
        except Exception:
            time.sleep(5 * (attempt + 1))
    if txt is not None:
        open(os.path.join(cache, f'{i}.txt'), 'w', encoding='utf-8').write(txt)
    if n % 50 == 0:
        print(n, '/', len(todo), flush=True)
    time.sleep(1.1)
print('done', flush=True)
