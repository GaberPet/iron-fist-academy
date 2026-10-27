import { loadCharacter } from '../data/testData';
import { DrillEngine, MoveMatcher, BLOCKSTUN, type BotAction, type EngineEvent } from './sim';
import { seededRng } from './quiz';
import type { Frame } from './recognizer';
import { maskOf } from './input';
import type { Dir, Move, TekkenButton } from '../types';

const chars = [loadCharacter('anna'), loadCharacter('armor-king')];
const anna = chars.find((c) => c.profile.id === 'anna')!;
const ak = chars.find((c) => c.profile.id === 'armor-king')!;

function fakeMove(over: Partial<Move>): Move {
  return { id: 'x', num: 1, name: 'Test', alt: [], input: 'x', parent: null, hitLevels: ['m'], damage: '10', startup: 'i15', startupFrame: 15, block: '-12', blockFrame: -12, blockRange: [-12, -12], hit: '+5', hitFrame: 5, ch: '', crush: '', recovery: 'r30', reach: '', tracks: '', notes: '', isThrow: false, ...over };
}

function action(kind: BotAction['kind'], level: BotAction['level'], startup: number, blockAdv: number, recovery = 30): BotAction {
  return { kind, move: fakeMove({ startupFrame: startup, blockFrame: blockAdv }), charName: 'Bot', level, startup, blockAdv, recovery, label: 'Bot test move' };
}

/** Drive the engine: hold `guard` until `pressAt`, then press buttons with `dir` for 3 frames. */
function runRound(engine: DrillEngine, opts: { guard: Dir; pressAt?: (tl: NonNullable<DrillEngine['timeline']>) => number; pressDir?: Dir; buttons?: TekkenButton[]; until?: number }) {
  engine.startRound(0);
  const tl = engine.timeline!;
  const press = opts.pressAt ? opts.pressAt(tl) : -1;
  const events: EngineEvent[] = [];
  for (let f = 0; f <= tl.end + 5 && !engine.result; f++) {
    const pressing = press >= 0 && f >= press && f < press + 3;
    const frame: Frame = { frame: f, dir: pressing ? (opts.pressDir ?? 'n') : opts.guard, buttons: pressing ? maskOf(opts.buttons ?? [1]) : 0 };
    events.push(...engine.update(frame));
  }
  return { result: engine.result!, tl, events };
}

describe('MoveMatcher', () => {
  it('builds candidates from character frame data', () => {
    const m = new MoveMatcher(ak);
    expect(m.candidates.length).toBeGreaterThan(50);
    expect(m.candidates.some((c) => c.move.id === 'f,n,d,df+2')).toBe(true);
  });
});

describe('DrillEngine punish rules', () => {
  const mk = () => new DrillEngine({ drill: 'punish-standing', player: ak, opponents: [anna], difficulty: 'normal', throwBreakWindow: 20, rng: seededRng(1) });

  it('i10 2,1 punishes a -10 move when pressed on the first actionable frame (buffered in blockstun)', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -10));
    const { result } = runRound(e, { guard: 'b', pressAt: (tl) => tl.playerActionable - 4, buttons: [2] });
    expect(result.outcome).toBe('punished');
    expect(result.playerMove?.id).toBe('2');
  });

  it('flags a late press as too slow', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -10));
    const { result } = runRound(e, { guard: 'b', pressAt: (tl) => tl.playerActionable + 2, buttons: [2] });
    expect(result.outcome).toBe('too-slow');
  });

  it('flags a move slower than the window as not guaranteed (uf+4 i15 vs -12)', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -12));
    const { result } = runRound(e, { guard: 'b', pressAt: (tl) => tl.playerActionable - 2, pressDir: 'uf', buttons: [4] });
    expect(result.outcome).toBe('not-guaranteed');
    expect(result.tip).toMatch(/b\+1,2|d\+1\+3|d\+2\+4/);
  });

  it('getting hit by a mid while crouching is a fail', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -12));
    expect(runRound(e, { guard: 'db' }).result.outcome).toBe('got-hit');
  });

  it('pressing before the attack lands is a counter-hit fail', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 20, -12));
    expect(runRound(e, { guard: 'b', pressAt: (tl) => tl.t0 + 2 }).result.outcome).toBe('pressed-early');
  });

  it('blocking without pressing is a missed punish', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -14));
    expect(runRound(e, { guard: 'b' }).result.outcome).toBe('missed-punish');
  });

  it('timeline encodes the window as -block advantage', () => {
    const e = mk();
    e.forceNext(action('punish', 'mid', 15, -13));
    e.startRound(0);
    const tl = e.timeline!;
    expect(tl.botActionable - tl.playerActionable).toBe(13);
    expect(tl.playerActionable - tl.impact).toBe(BLOCKSTUN + 1);
  });
});

describe('DrillEngine other drills', () => {
  it('requires a crouch block for lows', () => {
    const e = new DrillEngine({ drill: 'block-mixup', player: anna, opponents: [ak], difficulty: 'easy', throwBreakWindow: 20, rng: seededRng(2) });
    e.forceNext(action('block', 'low', 17, -12));
    expect(runRound(e, { guard: 'b' }).result.outcome).toBe('got-hit');
    e.forceNext(action('block', 'low', 17, -12));
    expect(runRound(e, { guard: 'db' }).result.outcome).toBe('blocked');
  });

  it('breaks a 1+3 throw with 1 inside the window, and rejects 2', () => {
    const e = new DrillEngine({ drill: 'throw-break', player: anna, opponents: [ak], difficulty: 'normal', throwBreakWindow: 20, rng: seededRng(3) });
    const t = (tb: 1 | 2 | 12): BotAction => ({ kind: 'throw', move: null, charName: 'Bot', level: 'throw', startup: 12, blockAdv: 0, recovery: 0, throwBreak: tb, label: 'throw' });
    e.forceNext(t(1));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 5, buttons: [1] }).result.outcome).toBe('broke-throw');
    e.forceNext(t(1));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 5, buttons: [2] }).result.outcome).toBe('wrong-break');
    e.forceNext(t(12));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 21, buttons: [1, 2] }).result.outcome).toBe('late-break');
    e.forceNext(t(12));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 40, buttons: [1, 2] }).result.outcome).toBe('thrown');
    e.forceNext(t(2));
    expect(runRound(e, { guard: 'db' }).result.outcome).toBe('ducked');
  });

  it('whiff punish succeeds when the hit lands inside the recovery', () => {
    const e = new DrillEngine({ drill: 'whiff-punish', player: anna, opponents: [ak], difficulty: 'normal', throwBreakWindow: 20, rng: seededRng(4) });
    e.forceNext(action('whiff', 'mid', 15, -12, 30));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 2, pressDir: 'df', buttons: [2] }).result.outcome).toBe('whiff-punished');
    e.forceNext(action('whiff', 'mid', 15, -12, 12));
    expect(runRound(e, { guard: 'n', pressAt: (tl) => tl.impact + 8, pressDir: 'df', buttons: [2] }).result.outcome).toBe('too-slow');
  });

  it('safe-move rounds punish mashing into plus frames', () => {
    const e = new DrillEngine({ drill: 'mixed-pressure', player: anna, opponents: [ak], difficulty: 'normal', throwBreakWindow: 20, rng: seededRng(5) });
    e.forceNext(action('safe', 'mid', 13, +2));
    expect(runRound(e, { guard: 'b', pressAt: (tl) => tl.playerActionable, pressDir: 'df', buttons: [2] }).result.outcome).toBe('pressed-into-safe');
    e.forceNext(action('safe', 'mid', 13, +2));
    expect(runRound(e, { guard: 'b' }).result.outcome).toBe('held-turn');
  });

  it('builds non-empty bot pools from real data and adapts weights to failures', () => {
    const e = new DrillEngine({ drill: 'mixed-pressure', player: anna, opponents: [ak, anna], difficulty: 'normal', throwBreakWindow: 20, rng: seededRng(6) });
    expect(e.pools.unsafeHighMid.length).toBeGreaterThan(5);
    expect(e.pools.unsafeLow.length).toBeGreaterThan(2);
    expect(e.pools.safe.length).toBeGreaterThan(5);
    e.recentByKind.throw = [false, false, false, false];
    e.recentByKind.block = [true, true, true, true];
    const w = e.adaptiveWeights();
    expect(w.throw).toBeGreaterThan(w.block);
  });
});
