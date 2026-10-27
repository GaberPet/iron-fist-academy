import { parseCombosPage, parsePunishersPage, normalizeComboNotation, looksLikeNotation, parseCharacterPage } from './wavuParse.js';

const COMBOS = `{{Navbox X}}
== Bread n' butter ==
{{Combolist|columns=1|
; Regular launch (e.g. df+2)
; uf+4
: [+66; 42] df+3 f+3,2~DF CD.1<ref name="a">Works on all sizes</ref> T! dash
: combo here
}}
== Mini-combos ==
{{Combolist|
; [20] CH df+2
: [41] 2,1<ref name="a"/>
: [10] WS1,2<sup>Close range</sup>
<!-- : 9,9,9 commented out -->
}}
== Fake Combos ==
{{Combolist|
; df+1
: 1,2 T! 3
}}
`;

describe('parseCombosPage', () => {
  const r = parseCombosPage(COMBOS, { characterId: 'x', url: 'u', revision: 1, validate: () => true });

  it('groups starters with their routes and keeps damage verbatim', () => {
    expect(r.items[0]).toMatchObject({ section: "Bread n' butter", starters: ['Regular launch (e.g. df+2)', 'uf+4'], damage: '[+66; 42]', route: 'df+3 f+3,2~DF CD.1 T! dash' });
    expect(r.items[0].notes).toEqual(['Works on all sizes']);
  });

  it('resolves reused refs, sup notes, WS notation and starter damage', () => {
    const mini = r.items.filter((i) => i.section === 'Mini-combos');
    expect(mini[0]).toMatchObject({ starters: ['CH df+2'], route: '2,1', notes: ['Works on all sizes'] });
    expect(mini[0].starterNotes).toContain('CH df+2: [20]');
    expect(mini[1]).toMatchObject({ route: 'ws1,2', notes: ['Close range'] });
  });

  it('drops placeholders, comments and the Fake Combos section', () => {
    expect(r.items.map((i) => i.route)).not.toContain('combo here');
    expect(r.items.some((i) => i.route.includes('9,9,9'))).toBe(false);
    expect(r.items.some((i) => i.section.startsWith('Fake'))).toBe(false);
    expect(r.dropped.map((d) => d.line)).toContain('combo here');
  });

  it('gives stable ids', () => {
    const again = parseCombosPage(COMBOS, { characterId: 'x', url: 'u', revision: 2 });
    expect(again.items.map((i) => i.id)).toEqual(r.items.map((i) => i.id));
  });
});

describe('notation normalization', () => {
  it('handles common Wavu shorthands', () => {
    expect(normalizeComboNotation('ff3 md 1,2 (x3) iWS3 b+1&#58;1+2 qcf+4/d,DB+4')).toBe('f,f+3 microdash 1,2 iws3 b+1:1+2 qcf+4');
    expect(looksLikeNotation('combo when you anti-air with jab here')).toBe(false);
    expect(looksLikeNotation('df+1 dash 3,4')).toBe(true);
  });
});

describe('parsePunishersPage', () => {
  it('reads the PunisherTable template, skipping comments and non-standing/crouching groups', () => {
    const t = `{{PunisherTable|character=Jin
|standing={{o
  |{{o| moveId = Jin-2,4 | enemy = -10 }}
  <!--|{{o| moveId = Jin-f,n,d,df#2 | enemy = -14 }}-->
  |{{o| moveId = Jin-f+1+2 }}
  }}
|crouching={{o
  |{{o| moveId = Jin-ws4,4 | enemy = -11 | moveNote=<ref>Close only</ref> }}
  }}
|backTurnedOpponent={{o
  |{{o| moveId = Jin-1,2,1 }}
  }}
}}`;
    expect(parsePunishersPage(t, 'Jin')).toEqual([
      { window: -10, moveId: '2,4', stance: 'standing' },
      { window: null, moveId: 'f+1+2', stance: 'standing' },
      { window: -11, moveId: 'ws4,4', stance: 'crouching', note: 'Close only' },
    ]);
  });

  it('reads plain wiki tables with rowspans, unicode minus and no closing tag', () => {
    const t = `{| class="punishers"
| colspan="4" class="table-cat" | Standing
|-
! Enemy !! Move !! Damage
|-
| rowspan="2" | -10
| 1,2,3 || 17
|-
| 1,2,4 || 17
|-
| ‐17 || f,n,d,df+1 || 22
|-
| colspan="4" class="table-cat" | Crouching
|-
| -11 || WS+4,4 || 28`;
    expect(parsePunishersPage(t, 'X')).toEqual([
      { window: -10, moveId: '1,2,3', stance: 'standing' },
      { window: -10, moveId: '1,2,4', stance: 'standing' },
      { window: -17, moveId: 'f,n,d,df+1', stance: 'standing' },
      { window: -11, moveId: 'ws4,4', stance: 'crouching' },
    ]);
  });
});

describe('parseCharacterPage', () => {
  it('extracts intro, strengths/weaknesses and infobox lists', () => {
    const t = `{{Infobox fighter
|name=Zed
|stances={{Plainlist|
* HAM ''(Hammer)'' &ndash; f+3}}
|heatEngagers={{Plainlist|
* i14 &ndash; 3+4}}
}}
'''Zed''' is a '''very''' fast character.
{{BlueRed
|blue=
* '''Fast''': good pokes
|red=
* '''Slow''': bad range
}}`;
    const p = parseCharacterPage(t, 'Zed');
    expect(p.overview).toBe('Zed is a very fast character.');
    expect(p.strengths).toEqual(['Fast: good pokes']);
    expect(p.weaknesses).toEqual(['Slow: bad range']);
    expect(p.stances[0]).toContain('HAM');
    expect(p.heatEngagers[0]).toContain('3+4');
  });
});
