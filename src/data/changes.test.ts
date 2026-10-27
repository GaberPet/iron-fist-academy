import { diffCharacter, stampFirstSeen } from './changes.js';

const file = (moves: [string, string][], combos: [string, string][], punishers: unknown[] = []) => ({
  id: 'x',
  name: 'X',
  frames: { moves: moves.map(([id, block]) => ({ id, name: id, startup: 'i10', block, hit: '+1', ch: '', damage: '5' })) },
  combos: { items: combos.map(([id, route]) => ({ id, route, section: 'Staples', starters: ['df+2'] })) },
  punishers: { items: punishers },
});

describe('diffCharacter', () => {
  it('reports new characters', () => {
    expect(diffCharacter(null, file([['1', '+1']], [['a', '1,2']]))).toMatchObject({ newCharacter: true, totals: { moves: 1, combos: 1 } });
  });

  it('lists added/removed/changed moves and combos', () => {
    const before = file([['1', '+1'], ['2', '-3']], [['a', '1,2'], ['b', '2,1']]);
    const after = file([['1', '-1'], ['3', '-12']], [['a', '1,2'], ['c', 'df+2 1']], [{ window: -10 }]);
    const d = diffCharacter(before, after)!;
    expect(d.totals).toEqual({ movesAdded: 1, movesRemoved: 1, movesChanged: 1, combosAdded: 1, combosRemoved: 1 });
    expect(d.movesChanged[0]).toEqual({ id: '1', name: '1', fields: { block: ['+1', '-1'] } });
    expect(d.combosAdded[0]).toMatchObject({ id: 'c', route: 'df+2 1' });
    expect(d.punishersChanged).toBe(true);
    expect(d.otherChanges).toBeUndefined();
  });

  it('flags text-only changes', () => {
    const f = file([['1', '+1']], [['a', '1,2']]);
    expect(diffCharacter(f, f)).toMatchObject({ otherChanges: true });
  });
});

describe('stampFirstSeen', () => {
  it('dates only new combos of an existing character and keeps old dates', () => {
    const before = file([], [['a', '1']]) as any;
    before.combos.items[0].firstSeen = '2026-10-01';
    const after = file([], [['a', '1'], ['b', '2']]) as any;
    stampFirstSeen(before, after, '2026-10-27');
    expect(after.combos.items.map((c: any) => c.firstSeen)).toEqual(['2026-10-01', '2026-10-27']);
  });

  it('does not stamp baseline data or brand-new characters', () => {
    const before = file([], [['a', '1']]);
    const after = file([], [['a', '1']]) as any;
    stampFirstSeen(before, after, '2026-10-27');
    expect('firstSeen' in after.combos.items[0]).toBe(false);
    const fresh = file([], [['z', '1']]) as any;
    stampFirstSeen(null, fresh, '2026-10-27');
    expect('firstSeen' in fresh.combos.items[0]).toBe(false);
  });
});
