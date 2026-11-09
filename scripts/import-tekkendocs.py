#!/usr/bin/env python3
"""Import combo routes from the TekkenDocs character guides into src/data/tekkendocs.json.

Only combo routes (starter → route) are taken, not the written guides. TekkenDocs allows use of its
data with credit to tekkendocs.com and rbnorway.org; every combo also credits its guide's author.

Usage: python3 scripts/import-tekkendocs.py
"""
import json, os, re, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = 'https://raw.githubusercontent.com/pbruvoll/tekkendocs/main/data/guides'
SECTIONS = {'combos_beginner': 'Beginner combos', 'combos_small': 'Small combos', 'combos_normal': 'Main combos', 'combos_wall': 'Wall combos'}
PROSE = re.compile(r'\b(if|you|your|need|want|the|for|then|must|when|with|into|optional|only|can)\b', re.I)
MOTION = {'bf': 'b,f', 'ff': 'f,f', 'fff': 'f,f,F'}


def get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode('utf-8')


def stance_codes(cid: str) -> list[str]:
    p = os.path.join(ROOT, 'src/data/characters', cid, 'curated.json')
    try:
        return [s['code'] for s in json.load(open(p))['profile']['stances']]
    except (OSError, KeyError):
        return []


def tidy(s: str, codes: list[str]) -> str:
    """Bring the guides' shorthand (df2, bf2, 3f,(ZEN)2, df:1) to the notation the rest of the app uses."""
    s = s.replace('"', ' ').strip()
    for code in sorted(codes, key=len, reverse=True):
        s = re.sub(rf',?f?,?\s*\({code}\),?\s*', f'~F {code}.', s)  # 3f,(ZEN)2 = 3~F ZEN.2
        s = re.sub(rf'\b{code} ?(?=[1-4udfbUDFB(])', f'{code}.', s)
    s = re.sub(r'\bCH(?=[a-z1-4])', 'CH ', s)
    s = re.sub(r'\b(?:CD\.df|cd)[:+]?(?=[1-4])', 'f,n,d,df+', s)  # crouch dash
    s = re.sub(r'\b(fff|bf|ff)(?=[1-4])', lambda m: MOTION[m[1]] + '+', s)
    s = re.sub(r'\b(qcf|qcb|hcf|hcb|ub|uf|db|df|u|d|f|b)[:#]?(?=[1-4])', lambda m: m[1].lower() + '+', s, flags=re.I)
    s = re.sub(r'\b(ws|WS)\+?(?=[1-4])', 'ws', s)
    s = re.sub(r',\s+', ',', s)
    return re.sub(r'\s+', ' ', s).strip()


def route_of(text: str, codes: list[str]) -> str | None:
    # A step can list alternatives ("b3,2 OR b2,1", "a | b"): the first one is the route.
    text = re.sub(r'\(\s[^)]*\)', ' ', text)  # "( advanced combo )": a remark, not an input
    steps = [re.split(r'\s+or\s+|\|', part, flags=re.I)[0] for part in text.split('>')]
    route = tidy(' '.join(steps), codes)
    if not re.search(r'[1-4]', route) or PROSE.search(re.sub(r'\([^)]*\)', '', route)):
        return None
    return route


def starters_of(text: str, codes: list[str]) -> list[str]:
    return [tidy(re.sub(r'\s+\([^)]*\)\s*$', '', s), codes).rstrip('.') for s in text.split('|') if s.strip()]


def parse_guide(text: str, cid: str):
    codes = stance_codes(cid)
    section, combos, authors, by_route = None, [], [], {}
    for line in map(str.strip, text.splitlines()):
        if line.startswith('#'):
            section = line[1:].rstrip(',').strip()
            continue
        if not line or line.startswith(('Starter;', 'Type;', 'name;')):
            continue
        if section == 'credits':
            name = line.split(';')[0].strip()
            if name and name not in authors:
                authors.append(name)
        if section not in SECTIONS or ';' not in line:
            continue
        first, rest = line.split(';', 1)
        route = route_of(rest, codes)
        if not route:
            continue
        wall = section == 'combos_wall'
        starters = ['Tornado at the wall' if first == 'tornado' else 'At the wall'] if wall else starters_of(first, codes)
        # The same route listed for several starters is one combo.
        known = by_route.get((section, route))
        if known:
            known['starters'] += [s for s in starters if s not in known['starters']]
        elif starters:
            by_route[(section, route)] = c = {'section': SECTIONS[section], 'starters': starters, 'route': route}
            combos.append(c)
    return combos, authors


def main():
    ids = [c['id'] for c in json.load(open(os.path.join(ROOT, 'public/data/manifest.json')))['characters']]
    out = {}
    for cid in ids:
        try:
            combos, authors = parse_guide(get(f'{RAW}/{cid}/{cid}-guide.csv'), cid)
        except urllib.error.HTTPError:
            print(f'{cid:12} no guide')
            continue
        if combos:
            out[cid] = {'authors': authors, 'combos': combos}
        print(f'{cid:12} {len(combos):3} combos  by {", ".join(authors) or "?"}')
    dest = os.path.join(ROOT, 'src/data/tekkendocs.json')
    json.dump({'source': {'name': 'TekkenDocs', 'url': 'https://tekkendocs.com'}, 'characters': out}, open(dest, 'w'), ensure_ascii=False, indent=1)
    print('wrote', dest, sum(len(v['combos']) for v in out.values()), 'combos')


if __name__ == '__main__':
    main()
