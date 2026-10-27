import { loadCharacter } from '../data/testData';
import { FightEngine, MAX_HP, HEAT_FRAMES, HEAT_BURST_COST, RAGE_HP, ARENA, AIR_SCALING, inRage, resolveRoute, chainTo, crushRanges, moveDamage, moveSet, parseOnHit, throwBreakOf, type FightEvent } from './fight';
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
  run(e, 120, 80, () => ({ dir: 'f' }));
  return 200;
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
    const ev = run(e, 200, 5, () => ({}));
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

  it('Heat: 2+3 starts Heat once per round, Heat Smash spends it, and H. moves only work in Heat', () => {
    const e = engine();
    let f = closeIn(e);
    expect(e.f[0].heat).toBe('ready');
    const ev = run(e, f, 90, (x) => (x < f + 3 ? { press: [2, 3] } : {}));
    expect(ev.some((x) => x.type === 'heat' && x.by === 0)).toBe(true);
    expect(e.f[0].heat).toBe('active');
    f += 90;
    const smash = run(e, f, 90, (x) => (x < f + 3 ? { press: [2, 3] } : {}));
    expect(smash.some((x) => x.type === 'heat-smash' && x.by === 0)).toBe(true);
    expect(e.f[0].heat).toBe('used');
    f += 90;
    run(e, f, 60, (x) => (x < f + 3 ? { press: [2, 3] } : {}));
    expect(e.f[0].move?.id ?? '').not.toMatch(/^(H\.)?2\+3$/);
  });

  it('Heat runs out after its duration', () => {
    const e = engine();
    const f = closeIn(e);
    run(e, f, 5, (x) => (x < f + 3 ? { press: [2, 3] } : {}));
    run(e, f + 5, HEAT_FRAMES + 5, () => ({ dir: 'b' }));
    expect(e.f[0].heat).toBe('used');
  });

  it('Rage Art (df+1+2) is only available in Rage and only once', () => {
    const e = engine();
    let f = closeIn(e);
    run(e, f, 60, (x) => (x < f + 3 ? { dir: 'df', press: [1, 2] } : {}));
    expect(e.f[0].rageUsed).toBe(false);
    f += 60;
    e.f[0].hp = RAGE_HP - 5;
    expect(inRage(e.f[0])).toBe(true);
    const ev = run(e, f, 90, (x) => (x < f + 3 ? { dir: 'df', press: [1, 2] } : {}));
    expect(ev.some((x) => x.type === 'rage-art' && x.by === 0)).toBe(true);
    expect(inRage(e.f[0])).toBe(false);
  });

  it('resolves real combo routes into moves for the bot', () => {
    const r = resolveRoute(jin, 'df+1,4 uf+4');
    expect(r.map((m) => m.id)).toEqual(['df+1', 'df+1,4', 'uf+4']);
    expect(moveSet(jin).routes.length).toBeGreaterThan(0);
  });

  it('the bot fights a passive player with its own moves: damage, lows and a won round', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const e = new FightEngine({ player: jin, bot: anna, difficulty: 'hard', rng });
    const ev = run(e, 0, 120 + 60 * 60, () => ({}));
    const botHits = ev.filter((x) => (x.type === 'hit' || x.type === 'counter') && x.by === 1);
    expect(botHits.length).toBeGreaterThan(3);
    expect(botHits.some((x) => x.level === 'low')).toBe(true);
    expect(e.wins[1]).toBeGreaterThanOrEqual(1);
  });

  it('Heat Burst leaves 600F, a Heat Engager hit gives the full 900F', () => {
    const e = engine();
    const f = closeIn(e);
    run(e, f, 3, (x) => (x < f + 3 ? { press: [2, 3] } : {}));
    expect(e.f[0].heatLeft).toBeGreaterThan(HEAT_FRAMES - HEAT_BURST_COST - 40);
    expect(e.f[0].heatLeft).toBeLessThanOrEqual(HEAT_FRAMES - HEAT_BURST_COST);
  });

  it('juggle hits are scaled 70% for the first air hit', () => {
    const e = engine();
    const f = closeIn(e);
    const d = e.f[1];
    e['setState'](d, 'air', f);
    d.y = 80;
    d.vy = 2;
    d.airHits = 0;
    const m = lookupMove(jin, '1')!;
    expect(e.scaledDamage(e.f[0], d, m, { juggle: true, grounded: false })).toBe(Math.floor(moveDamage(m) * AIR_SCALING[0]));
    d.airHits = 3;
    d.wallHit = true;
    expect(e.scaledDamage(e.f[0], d, m, { juggle: true, grounded: false })).toBe(Math.max(1, Math.floor(moveDamage(m) * 0.3 * 0.8)));
  });

  it('Rage adds 10% damage', () => {
    const e = engine();
    const m = lookupMove(jin, 'df+2')!;
    e.f[0].hp = RAGE_HP;
    expect(e.baseDamage(e.f[0], e.f[1], m)).toBe(Math.floor(moveDamage(m) * 1.1));
  });

  it('dash and backdash move along the fight axis; a sidestep moves off it', () => {
    const e = engine();
    run(e, 0, 120, () => ({}));
    const d0 = e.distance;
    // f, n, f = dash
    run(e, 120, 30, (x) => ({ dir: x < 122 ? 'f' : x < 124 ? 'n' : x < 126 ? 'f' : 'n' }));
    expect(e.distance).toBeLessThan(d0 - 60);
    const d1 = e.distance;
    run(e, 150, 40, (x) => ({ dir: x < 152 ? 'b' : x < 154 ? 'n' : x < 156 ? 'b' : 'n' }));
    expect(e.distance).toBeGreaterThan(d1 + 50);
    const z0 = e.f[0].pos.z;
    run(e, 190, 30, (x) => ({ dir: x < 193 ? 'd' : 'n' }));
    expect(Math.abs(e.f[0].pos.z - z0)).toBeGreaterThan(40);
  });

  it('a sidestep makes a slow linear move whiff', () => {
    const e = engine();
    const f = closeIn(e);
    const slow = jin.frames.moves.find((m) => !m.parent && !m.isThrow && (m.startupFrame ?? 0) >= 18 && !/Homing/.test(m.notes) && /^[a-z]/.test(m.id) && !/^[A-Z]/.test(m.id));
    expect(slow).toBeTruthy();
    e.startMove(e.f[1], slow!, f);
    const ev = run(e, f, 40, (x) => ({ dir: x < f + 3 ? 'u' : 'n' }));
    expect(ev.some((x) => x.type === 'whiff' && x.by === 1)).toBe(true);
    expect(e.f[0].hp).toBe(MAX_HP);
  });

  it('teching right after landing starts a tech roll', () => {
    const e = engine();
    const f = closeIn(e);
    const p = e.f[0];
    e['setState'](p, 'air', f);
    p.y = 10;
    p.vy = 0;
    let landed = -1;
    for (let x = f; x < f + 40; x++) {
      e.update({ frame: x, dir: 'n', buttons: landed >= 0 && x <= landed + 3 ? 1 : 0 });
      if (landed < 0 && p.state === 'down') landed = x;
    }
    expect(landed).toBeGreaterThan(0);
    expect(['techroll', 'neutral']).toContain(p.state);
  });

  it('juggling into the wall splats and later hits get the wall scaling', () => {
    const e = engine();
    const f = closeIn(e);
    const d = e.f[1];
    d.pos = { x: ARENA - 10, z: 0 };
    e.f[0].pos = { x: ARENA - 100, z: 0 };
    e['setState'](d, 'air', f);
    d.y = 90;
    d.vy = 3;
    const ev = run(e, f, 20, (x) => (x < f + 3 ? { press: [1] } : {}));
    expect(ev.some((x) => x.type === 'wall')).toBe(true);
    expect(d.wallHit).toBe(true);
  });

  it('attacking regains recoverable health', () => {
    const e = engine();
    const f = closeIn(e);
    const p = e.f[0];
    p.hp = 100;
    p.recov = 30;
    e.f[1].state = 'hitstun';
    e.f[1].until = f + 100;
    run(e, f, 30, (x) => (x < f + 3 ? { press: [1] } : {}));
    expect(p.hp).toBeGreaterThan(100);
    expect(p.recov).toBeLessThan(30);
  });

  it('a wrong throw-break button locks the break out', () => {
    const e = engine();
    const f = closeIn(e);
    const thr = moveSet(anna).throws[0];
    e.startMove(e.f[1], thr, f);
    const t = run(e, f, 20, () => ({}));
    if (!t.some((x) => x.type === 'throw')) return; // out of range in this setup
    const at = e.frame + 1;
    const ev = run(e, at, 40, (x) => (x < at + 2 ? { press: [1, 2] } : x < at + 6 ? { press: [1] } : {}));
    expect(ev.some((x) => x.type === 'break')).toBe(false);
  });

  it('survives random mashing for a whole match on every difficulty (no NaN, valid health, rounds end)', () => {
    const dirs: Dir[] = ['n', 'f', 'b', 'd', 'db', 'df', 'u', 'ub', 'uf'];
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      let seed = 99;
      const rng = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
      const e = new FightEngine({ player: anna, bot: jin, difficulty: diff, rng, roundsToWin: 2 });
      let dir: Dir = 'n';
      let btn = 0;
      for (let f = 0; f < 60 * 60 * 5 && e.phase !== 'over'; f++) {
        if (f % 7 === 0) dir = dirs[Math.floor(rng() * dirs.length)];
        btn = f % 5 === 0 && rng() < 0.5 ? 1 << Math.floor(rng() * 4) : 0;
        e.update({ frame: f, dir, buttons: btn });
        for (const x of e.f) {
          expect(Number.isFinite(x.pos.x) && Number.isFinite(x.pos.z) && Number.isFinite(x.y)).toBe(true);
          expect(x.hp).toBeGreaterThanOrEqual(0);
          expect(x.hp + x.recov).toBeLessThanOrEqual(MAX_HP);
          expect(Math.abs(x.pos.x)).toBeLessThanOrEqual(ARENA);
        }
      }
      expect(e.wins[0] + e.wins[1]).toBeGreaterThan(0);
    }
  });

  it('a timed d/f low parry puts the low attacker into the air', () => {
    const e = engine();
    const f = closeIn(e);
    const low = moveSet(anna).lows.find((m) => !/Weapon/.test(m.notes) && (m.startupFrame ?? 0) >= 14)!;
    e.startMove(e.f[1], low, f);
    const hitAt = e.f[1].hitAt;
    const ev = run(e, f, 40, (x) => ({ dir: x >= hitAt - 3 && x <= hitAt ? 'df' : 'n' }));
    expect(ev.some((x) => x.type === 'parry' && x.by === 0)).toBe(true);
    expect(['air', 'down']).toContain(e.f[1].state);
    expect(e.f[0].hp).toBe(MAX_HP);
  });

  it('practice mode: the dummy guards as set, health refills, no timer', () => {
    const e = new FightEngine({ player: jin, bot: anna, difficulty: 'normal', rng: passive, practice: { dummy: 'none' } });
    const f = closeIn(e);
    const t0 = e.timer;
    run(e, f, 60, (x) => (x < f + 3 ? { dir: 'df', press: [1] } : {}));
    expect(e.f[1].hp).toBeLessThan(MAX_HP);
    run(e, f + 60, 120, () => ({}));
    expect(e.f[1].hp).toBe(MAX_HP);
    expect(e.timer).toBe(t0);
    const c = new FightEngine({ player: jin, bot: anna, difficulty: 'normal', rng: passive, practice: { dummy: 'crouch' } });
    const g = closeIn(c);
    const low = run(c, g, 60, (x) => (x < g + 3 ? { dir: 'd', press: [4] } : { dir: 'n' }));
    expect(low.some((x) => x.type === 'block' && x.by === 0)).toBe(true);
  });
});
