#!/usr/bin/env python3
"""Build src/data/characters/<id>/curated.json from a hand-written spec in scripts/curate/specs/<id>.json.

The spec holds the coaching (playstyle, stance notes, key-move notes, combo tips). Facts that Wavu Wiki
already lists (overview, strengths, weaknesses, Heat notes, sources) are copied from the imported data,
so they are never retyped. Lessons are left empty: the app builds them from the coach notes and the data.

Usage: python3 scripts/curate/build.py [id ...]   (no ids = every spec)
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPECS = os.path.join(ROOT, 'scripts/curate/specs')
FIELDS = ['summary', 'purpose', 'use', 'avoid', 'counterplay', 'afterBlock', 'afterHit', 'afterEvade', 'gamePlan']


def build(cid):
    spec = json.load(open(os.path.join(SPECS, cid + '.json')))
    data = json.load(open(os.path.join(ROOT, 'public/data/characters', cid + '.json')))
    p = data['profile']
    combo_src = data['combos']['source']
    key_moves = []
    for row in spec['keyMoves']:
        assert len(row) == 2 + len(FIELDS), f'{cid}: key move {row[0]} needs {2 + len(FIELDS)} fields'
        key_moves.append({'id': row[0], 'roles': row[1].split(','), **dict(zip(FIELDS, row[2:]))})
    combos = [
        {**c, 'source': {'name': f"{combo_src['name']}: {data['name']}", 'url': combo_src['url'], 'revision': combo_src.get('revision'), 'verified': 'source'}}
        for c in spec.get('combos', [])
    ]
    sources = [p['source'], data['frames']['source'], combo_src, data['punishers']['source']]
    curated = {
        'profile': {
            'id': cid,
            'name': spec.get('name', data['name']),
            'short': spec.get('short', data['name']),
            'color': p['color'],
            'overview': spec.get('overview', p.get('overview', '')),
            'playstyle': spec['playstyle'],
            'strengths': spec.get('strengths', p.get('strengths', [])),
            'weaknesses': spec.get('weaknesses', p.get('weaknesses', [])),
            'stances': spec.get('stances', []),
            'heat': spec.get('heat', p.get('heat', [])),
            'heatEngagers': spec.get('heatEngagers', p.get('heatEngagers', [])),
            'keyLaunchers': spec['keyLaunchers'],
            **({'stanceAliases': spec['stanceAliases']} if spec.get('stanceAliases') else {}),
            'sources': [s for s in sources if s],
        },
        'keyMoves': key_moves,
        'combos': combos,
        'punishers': [],  # empty = use the imported Wavu punisher table, which stays current
        'whiffPunishers': spec.get('whiffPunishers', []),
        'lessons': [],  # empty = built in the app from the coach notes and the data
    }
    out = os.path.join(ROOT, 'src/data/characters', cid)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'curated.json'), 'w') as f:
        json.dump(curated, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('built', cid, len(key_moves), 'key moves,', len(combos), 'combos')


ids = sys.argv[1:] or sorted(n[:-5] for n in os.listdir(SPECS) if n.endswith('.json'))
for i in ids:
    build(i)
