#!/usr/bin/env python3
"""Import combo routes from Applay's Tekken 8 Library (a public Google Sheet) into src/data/applay.json.

Only the combo routes are taken (starter → route): they are game facts. Applay's written tips,
layout and other sections are not copied. Every combo keeps a credit and a link to Applay's sheet.
Frame data still comes from Wavu Wiki.

Usage: python3 scripts/import-applay.py
"""
import csv, io, json, os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsgbCJNSTKajMNlJvQleJOl0eTiEcV-PbeU0obDg1lsSqmz0lTtcD2k6NzfTPt7Db9Ua2dz1o_34Sv/pub'
SECTIONS = ('MOST IMPORTANT COMBOS', 'IMPORTANT COMBOS', 'MORE COMBOS', 'WALL COMBOS', 'HEAT COMBOS')
# Stance and state prefixes written with a space in the sheet ("CJM uf+3") and with a dot in our notation ("CJM.uf+3").
COMMON = ['FC', 'BT', 'WS', 'SS', 'SSL', 'SSR']


def get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode('utf-8')


def char_id(name: str) -> str:
    name = re.sub(r'\s*(-\s*S\d+|\\x5bS\d+\\x5d|\[S\d+\])\s*$', '', name).strip()
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def legend(rows):
    """Applay's stance legend: code → entry input (e.g. HCS → f+3)."""
    out = {}
    for ri, r in enumerate(rows):
        for ci, c in enumerate(r):
            if c.strip() == 'LEGEND':
                for r2 in rows[ri + 1:ri + 12]:
                    code = r2[ci].strip() if ci < len(r2) else ''
                    entry = r2[ci + 1].strip() if ci + 1 < len(r2) else ''
                    if re.fullmatch(r'[A-Z]{2,5}', code) and entry:
                        out[code] = entry
                return out
    return out


def wavu_stances(cid: str):
    p = os.path.join(ROOT, 'src/data/characters', cid, 'curated.json')
    try:
        return json.load(open(p))['profile']['stances']
    except (OSError, KeyError):
        return []


def first_input(s: str) -> str:
    return re.split(r'[\s(]', s.replace('"', '').strip())[0].lower()


def normalize(route: str, codes: list[str], rename: dict[str, str]) -> str:
    s = route.replace('\n', ' ').replace('⏵', ' ').replace('NEW!', ' ')
    s = re.sub(r'\(hold forward\)', '', s, flags=re.I)
    for code in sorted(set(codes), key=len, reverse=True):
        s = re.sub(rf'\b{code} (?=[1-4udfbUDFB(])', f'{rename.get(code, code)}.', s)
    return re.sub(r'\s+', ' ', s).strip()


def parse_sheet(rows, cid):
    alias = legend(rows)
    wavu = wavu_stances(cid)
    # Same stance, different short name: match Applay's legend entry with Wavu's stance entry.
    rename = {}
    for code, entry in alias.items():
        for st in wavu:
            if first_input(st.get('entry', '')) == first_input(entry) and st['code'] != code:
                rename[code] = st['code']
    codes = COMMON + list(alias) + [st['code'] for st in wavu]
    combos = []
    route_cells = [(ri, ci) for ri, r in enumerate(rows) for ci, c in enumerate(r) if '⏵' in c]
    for ri, ci in route_cells:
        sc = ci - 1
        # Section: the nearest heading above in the starter column.
        section = 'Combos'
        for r in reversed(rows[:ri]):
            h = r[sc].strip() if sc < len(r) else ''
            if h in SECTIONS:
                section = h.capitalize()
                break
        # Starters: this row and the rows below it with no route of their own (merged cells in the sheet).
        starters = []
        for r in rows[ri:]:
            if r is not rows[ri] and ci < len(r) and '⏵' in r[ci]:
                break
            st = r[sc].strip() if sc < len(r) else ''
            if not st or st in SECTIONS:
                if r is not rows[ri]:
                    break
                continue
            starters.append(normalize(st, codes, rename))
        if starters:
            combos.append({'section': section, 'starters': starters, 'route': normalize(rows[ri][ci], codes, rename), 'raw': rows[ri][ci].replace('\n', ' ').strip()})
    return combos


def main():
    html = get(PUB + 'html')
    tabs = re.findall(r'items\.push\(\{name: "(.*?)", pageUrl: ".*?", gid: "(\d+)"', html)
    ids = {c['id'] for c in json.load(open(os.path.join(ROOT, 'public/data/manifest.json')))['characters']}
    out = {}
    for name, gid in tabs:
        cid = char_id(name)
        if cid not in ids:
            continue
        rows = list(csv.reader(io.StringIO(get(f'{PUB}?gid={gid}&single=true&output=csv'))))
        combos = parse_sheet(rows, cid)
        if combos:
            out[cid] = {'gid': gid, 'combos': combos}
        print(f'{cid:12} {len(combos):3} combos')
    dest = os.path.join(ROOT, 'src/data/applay.json')
    json.dump({'source': {'name': "Applay's Tekken 8 Library", 'url': PUB + 'html'}, 'characters': out}, open(dest, 'w'), ensure_ascii=False, indent=1)
    print('wrote', dest, sum(len(v['combos']) for v in out.values()), 'combos')


if __name__ == '__main__':
    main()
