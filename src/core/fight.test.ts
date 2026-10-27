import { loadCharacter } from '../data/testData';
import { FightEngine, MAX_HP, chainTo, crushRanges, moveDamage, moveSet, parseOnHit, throwBreakOf, type FightEvent } from './fight';
import { lookupMove } from '../data';
import { maskOf } from './input';
import type { Dir, TekkenButton } from '../types';
import { moveTier } from './sim';

const jin = loadCharacter('jin');
const anna = loadCharacter('anna');

/** A bot that never attacks and always stand-guards (rng close to 1 fails every chance roll). */
const passive = () => 0.999;

function engine(rng = passive) {
  return new FightEngine({ player: jin, bot: anna, difficulty: 'normal', rng });
}

/** Run frames: `plan(f)` returns the input for frame f. */
function run(e: FightEngine, from: number, n: number, plan: (f: number) => { dir?: Dir; press?: TekkenButton[] }) {
  const ev: FightEvent[] = [];
  for (let f = from; f < from + n; f++) {
    const i = plan(f);
    ev.push(...e.update({ frame: f, dir: i.dir ?? 'n', buttons: i.press ? maskOf(i.press) : 0 }));
  }
  return ev;
}

/** Skip the intro and walk the player into close range. */
function closeIn(e: FightEngine) {
  run(e, 0, 120, () => ({}));
  run(e, 120, 60, () => ({ dir: 'f' }));
  return 180;
}

describe('move data helpers', () => {
  it('reads damage, on-hit flags, crush frames and throw breaks from the data', () => {
    expect(moveDamage(lookupMove(jin, 'df+1')!)).toBe(10);
    expect(parseOnHit('+33a (+23a)')).toMatchObject({ adv: 33, launch: true });
    expect(parseOnHit('+2d')).toMatchObject({ knockdown: true });
    expect(parseOnHit('-1')).toMatchObject({ adv: -1, launch: false });
    expect(crushRanges(lookupMove(jin, 'uf+4')!)).toEqual([{ kind: 'js', from: 9, to: 20 }]);
    expect(throwBreakOf(lookupMove(jin, '1+3')!)).toBe('either');
    expect(chainTo(jin, lookupMove(jin, '1,2,4')!).map((m) => m.id)).toEqual(['1', '1,2', '1,2,4']);
  });

  it('builds a bot move set from the character', () => {
    const s = moveSet(jin);
    expect(s.pokes.length).toBeGreaterThan(3);
    expect(s.lows.length).toBeGreaterThan(1);
    expect(s.launchers.length).toBeGreaterThan(1);
    expect(s.children.get('1')?.some((m) => m.id === '1,2')).toBe(true);
  });

  it('puts stance moves in the last Dojo stage and launchers in the middle one', () => {
    expect(moveTier(jin, lookupMove(jin, 'uf+4')!)).toBe(2);
    expect(moveTier(jin, lookupMove(jin, '1')!)).toBe(1);
    const stance = jin.frames.moves.find((m) => /^[A-Z]{2,}\./.test(m.id));
    if (stance) expect(moveTier(jin, stance)).toBe(3);
  });
});

describe('FightEngine', () => {
  it('starts with full health, a round intro and the 60 s timer', () => {
    const e = engine();
    expect(e.f[0].hp).toBe(MAX_HP);
    expect(e.phase).toBe('intro');
    const ev = run(e, 0, 120, () => ({}));
    expect(ev.some((x) => x.type === 'fight')).toBe(true);
    expect(e.phase).toBe('fight');
    expect(e.secondsLeft).toBeLessThanOrEqual(60);
  });

  it('a standing bot blocks a mid and takes a low', () => {
    const e = engine();
    let f = closeIn(e);
    const mid = run(e, f, 60, (x) => (x < f + 3 ? { dir: 'df', press: [1] } : {}));
    expect(mid.find((x) => x.type === 'block' && x.by === 0)).toBeTruthy();
    expect(e.f[1].hp).toBe(MAX_HP);
    f += 60;
    const low = run(e, f, 60, (x) => (x < f + 3 ? { dir: 'd', press: [4] } : { dir: 'n' }));
    const hit = low.find((x) => x.type === 'hit' && x.by === 0);
    expect(hit?.level).toBe('low');
    expect(e.f[1].hp).toBe(MAX_HP - moveDamage(lookupMove(jin, 'd+4')!));
  });

  it('a launcher on a stunned bot launches it and a follow-up juggles for scaled damage', () => {
    const e = engine();
    const f = closeIn(e);
    e.f[1].state = 'hitstun';
    e.f[1].until = f + 200;
    const ev = run(e, f, 30, (x) => (x < f + 3 ? { dir: 'uf', press: [4] } : {}));
    expect(ev.some((x) => x.type === 'launch' && x.by === 0)).toBe(true);
    expect(e.f[1].state).toBe('air');
    const before = e.f[1].hp;
    const jug = run(e, f + 30, 40, (x) => (x >= f + 46 && x < f + 49 ? { press: [1] } : {}));
    const hit = jug.find((x) => x.type === 'hit' && x.by === 0);
    expect(hit).toBeTruthy();
    expect(hit!.damage).toBeLessThan(moveDamage(lookupMove(jin, '1')!));
    expect(e.f[1].hp).toBeLessThan(before);
  });

  it('ends the round on time up and gives the round to the player with more health', () => {
    const e = engine();
    closeIn(e);
    e.f[1].hp = 100;
    e.timer = 3;
    const ev = run(e, 180, 5, () => ({}));
    expect(ev.some((x) => x.type === 'time-up')).toBe(true);
    expect(e.wins).toEqual([1, 0]);
  });

  it('wins the match after enough K.O.s', () => {
    const e = engine();
    let f = 0;
    for (let r = 0; r < 2; r++) {
      f = r === 0 ? closeIn(e) : f;
      e.f[1].hp = 1;
      run(e, f, 40, (x) => (x < f + 3 ? { dir: 'd', press: [4] } : {}));
      f += 40;
      run(e, f, 300, () => ({}));
      f += 300;
      if (r === 0) {
        run(e, f, 60, () => ({ dir: 'f' }));
        f += 60;
      }
    }
    expect(e.wins[0]).toBe(2);
    expect(e.phase).toBe('over');
    expect(e.winner).toBe(0);
  });
});
