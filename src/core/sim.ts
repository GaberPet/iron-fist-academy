// Training-bot simulation. A deliberately simple, frame-based model:
//  - the bot performs real moves (startup / block advantage / recovery from imported frame data)
//  - the player defends with real directions and answers with real moves of their character
//  - outcomes are decided with Tekken's frame rules (window = -block advantage, i-frame startup)
// It does NOT model range, pushback, hitboxes, tracking, animations or Tekken 8's engine.
import type { CharacterData, Dir, DrillId, Move } from '../types';
import { classifySafety, firstHitLevel, punishersFor, recoveryFrames } from './frames';
import { checkPress, DEFAULT_OPTIONS, InputHistory, type Frame, type PressGroup, type RecognizerOptions } from './recognizer';
import { isDownish, parseNotation, type InputStep } from './notation';
import type { Rng } from './quiz';
import { shuffle } from './quiz';
import type { Difficulty } from './progress';
import { lookupMove } from '../data';

export type RoundKind = 'punish' | 'block' | 'throw' | 'whiff' | 'safe';
export type ThrowBreak = 1 | 2 | 12;

export interface BotAction {
  kind: RoundKind;
  move: Move | null; // null for generic throws
  charName: string;
  level: 'high' | 'mid' | 'low' | 'throw';
  startup: number;
  blockAdv: number; // bot's advantage on block (negative = punishable)
  recovery: number; // whiff recovery (frames after active)
  throwBreak?: ThrowBreak;
  label: string;
  /** Character the move belongs to (drawn as that character). */
  charId?: string;
  /** 1 = basic moves, 2 = signature moves and string enders, 3 = stance and Heat moves. */
  tier?: 1 | 2 | 3;
}

/** What the bot adds in each stage of a session. */
export const TIER_NAMES: Record<1 | 2 | 3, string> = {
  1: 'basic moves',
  2: 'signature moves: launchers, Heat Engagers, power crushes, string enders',
  3: 'stance and Heat moves',
};

const SIGNATURE_RE = /Heat Engager|Power Crush|Homing|Tornado|Balcony Break/i;
const STANCE_RE = /^([A-Z][A-Za-z]{0,5})\./;

/** Tier of a move for the stage system (see TIER_NAMES). */
export function moveTier(c: CharacterData, m: Move): 1 | 2 | 3 {
  if (STANCE_RE.test(m.id)) return 3;
  if (m.parent || SIGNATURE_RE.test(m.notes) || /a/.test(m.hit) || c.profile.keyLaunchers.includes(m.id) || c.profile.heatEngagers.includes(m.id)) return 2;
  return 1;
}

export type Outcome =
  | 'punished' | 'too-slow' | 'not-guaranteed' | 'missed-punish' | 'got-hit' | 'pressed-early'
  | 'blocked' | 'ducked' | 'broke-throw' | 'wrong-break' | 'late-break' | 'thrown'
  | 'whiff-punished' | 'pressed-into-safe' | 'held-turn' | 'wrong-stance';

export const OUTCOME_TEXT: Record<Outcome, string> = {
  punished: 'Punished!',
  'too-slow': 'Too slow: pressed after the window',
  'not-guaranteed': 'Not guaranteed: your move is slower than the window',
  'missed-punish': 'Missed punish: you blocked but did nothing',
  'got-hit': 'Got hit: wrong guard',
  'pressed-early': 'Pressed during the opponent\'s attack and got counter-hit',
  blocked: 'Blocked',
  ducked: 'Ducked it',
  'broke-throw': 'Throw broken',
  'wrong-break': 'Wrong break button',
  'late-break': 'Break too late',
  thrown: 'Thrown (no break)',
  'whiff-punished': 'Whiff punished!',
  'pressed-into-safe': 'Pressed after a safe/plus move and got counter-hit',
  'held-turn': 'Correct decision after a safe move',
  'wrong-stance': 'That move is not available instantly from a crouch block',
};

export const SUCCESS_OUTCOMES = new Set<Outcome>(['punished', 'blocked', 'ducked', 'broke-throw', 'whiff-punished', 'held-turn']);

export interface RoundResult {
  outcome: Outcome;
  success: boolean;
  detail: string;
  /** Extra coaching, e.g. the optimal punisher. */
  tip?: string;
  playerMove?: Move;
  reactionFrames?: number; // frames from cue to the correct guard / press
}

export interface DifficultyParams {
  /** Frames before impact at which the hit level is revealed. */
  revealBefore: number;
  idleMin: number;
  idleMax: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { revealBefore: 40, idleMin: 50, idleMax: 90 },
  normal: { revealBefore: 26, idleMin: 35, idleMax: 75 },
  hard: { revealBefore: 18, idleMin: 25, idleMax: 60 },
};

/** Fixed abstract blockstun the player suffers (the window logic is relative, so the value only affects pacing). */
export const BLOCKSTUN = 14;
export const GENERIC_THROW_STARTUP = 12;

// ---------- player move matching ----------

interface Candidate {
  move: Move;
  step: InputStep;
  score: number;
}

const STANCE_PREFIX_OK = new Set(['ws', 'iws', 'FC', 'hFC', 'SS', 'ss']);

/** Matches a press group to the most specific starter move of a character. */
export class MoveMatcher {
  candidates: Candidate[] = [];
  constructor(c: CharacterData) {
    for (const m of c.frames.moves) {
      if (m.parent || m.startupFrame === null) continue;
      let steps: InputStep[];
      try {
        steps = parseNotation(m.id);
      } catch {
        continue;
      }
      const first = steps.find((s) => s.kind === 'press');
      if (!first || first.heat || first.rage || first.counterHit) continue;
      if (first.stance && !STANCE_PREFIX_OK.has(first.stance)) continue;
      if (steps.indexOf(first) !== 0) continue;
      const score = first.motion.length * 10 + (first.stance ? 6 : 0) + first.buttons.length * 2 + (first.pressDir !== 'any' && first.pressDir !== 'n' ? 1 : 0);
      this.candidates.push({ move: m, step: first, score });
    }
    this.candidates.sort((a, b) => b.score - a.score);
  }

  match(group: PressGroup, history: InputHistory, opts: RecognizerOptions): Move | null {
    for (const c of this.candidates) if (checkPress(c.step, group, history, opts).ok) return c.move;
    return null;
  }
}

/** Root move of a string (startup of a string = startup of its first hit). */
export function rootMove(c: CharacterData, m: Move): Move {
  let cur = m;
  for (let i = 0; i < 12 && cur.parent; i++) {
    const p = lookupMove(c, cur.parent);
    if (!p) break;
    cur = p;
  }
  return cur;
}

// ---------- bot move pools ----------

export function botPools(opponents: CharacterData[]) {
  const unsafeHighMid: BotAction[] = [];
  const unsafeLow: BotAction[] = [];
  const blockable: BotAction[] = [];
  const safe: BotAction[] = [];
  const whiffable: BotAction[] = [];
  for (const c of opponents) {
    for (const m of c.frames.moves) {
      if (m.isThrow || m.startupFrame === null || m.startupFrame < 10) continue;
      if (m.hitLevels.length !== 1) continue; // single-hit moves (or single-hit string enders) keep the model honest
      const lv = firstHitLevel(m);
      if (lv !== 'high' && lv !== 'mid' && lv !== 'low') continue;
      if (!m.blockRange || m.blockRange[0] !== m.blockRange[1] || m.blockFrame === null) continue;
      if (m.id.startsWith('R.')) continue; // rage moves need rage
      const tier = moveTier(c, m);
      const stance = STANCE_RE.exec(m.id)?.[1];
      const from = stance ? (stance === 'H' ? ' in Heat' : ` from ${c.profile.stances.find((s) => s.code === stance)?.name ?? stance}`) : m.parent ? ' (string ender)' : '';
      const base = { move: m, charName: c.profile.short, charId: c.profile.id, tier, level: lv, startup: m.startupFrame, blockAdv: m.blockFrame, recovery: recoveryFrames(m) ?? 0, label: `${c.profile.short} ${m.input || m.id}${m.name ? ` (${m.name})` : ''}${from}` } as const;
      const s = classifySafety(m);
      if ((s === 'punishable' || s === 'launch-punishable') && m.blockFrame >= -24) {
        if (lv === 'low') unsafeLow.push({ ...base, kind: 'punish' });
        else unsafeHighMid.push({ ...base, kind: 'punish' });
      }
      if (lv !== 'high' && m.startupFrame >= 12) blockable.push({ ...base, kind: 'block' });
      if ((s === 'safe' || s === 'plus') && lv !== 'low' && m.blockFrame >= -6) safe.push({ ...base, kind: 'safe' });
      if (base.recovery >= 15 && base.recovery <= 45) whiffable.push({ ...base, kind: 'whiff' });
    }
  }
  return { unsafeHighMid, unsafeLow, blockable, safe, whiffable };
}

export function throwAction(rng: Rng, c?: CharacterData): BotAction {
  const r = rng();
  const tb: ThrowBreak = r < 0.4 ? 1 : r < 0.8 ? 2 : 12;
  const label = tb === 1 ? 'Throw: left arm first (1+3)' : tb === 2 ? 'Throw: right arm first (2+4)' : 'Throw: both arms (1+2 type)';
  return { kind: 'throw', move: null, charName: c?.profile.short ?? 'Bot', charId: c?.profile.id, tier: 1, level: 'throw', startup: GENERIC_THROW_STARTUP, blockAdv: 0, recovery: 0, throwBreak: tb, label };
}

// ---------- round engine ----------

export type RoundPhase = 'idle' | 'startup' | 'impact' | 'recovery' | 'done';

export interface RoundTimeline {
  t0: number; // bot attack starts
  impact: number; // frame the attack connects / whiffs
  reveal: number; // frame the hit-level cue appears
  playerActionable: number; // after blockstun
  botActionable: number;
  end: number; // last frame the round can resolve
}

export interface EngineEvent {
  type: 'round-start' | 'reveal' | 'impact' | 'player-move' | 'result';
  frame: number;
  action?: BotAction;
  result?: RoundResult;
  move?: Move;
}

export interface EngineConfig {
  drill: DrillId;
  player: CharacterData;
  opponents: CharacterData[];
  difficulty: Difficulty;
  throwBreakWindow: number;
  rng: Rng;
  recognizer?: RecognizerOptions;
  /** Session length; the bot unlocks signature (2nd third) and stance/Heat moves (last third). */
  reps?: number;
}

const STAND_GUARD = new Set<Dir>(['n', 'b']);

export function guardAt(dir: Dir): 'stand' | 'crouch' | 'none' {
  if (STAND_GUARD.has(dir)) return 'stand';
  if (isDownish(dir)) return 'crouch';
  return 'none';
}

export class DrillEngine {
  readonly cfg: EngineConfig;
  readonly matcher: MoveMatcher;
  readonly pools: ReturnType<typeof botPools>;
  history = new InputHistory(300);
  action: BotAction | null = null;
  timeline: RoundTimeline | null = null;
  phase: RoundPhase = 'idle';
  blocked = false;
  crouchBlocked = false;
  playerMove: { move: Move; frame: number } | null = null;
  result: RoundResult | null = null;
  private group: PressGroup | null = null;
  /** Recent outcomes per kind for adaptive selection (mixed-pressure). */
  recentByKind: Record<RoundKind, boolean[]> = { punish: [], block: [], throw: [], whiff: [], safe: [] };
  private forced: BotAction | null = null;
  /** Rounds started so far. */
  roundIndex = 0;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.matcher = new MoveMatcher(cfg.player);
    this.pools = botPools(cfg.opponents);
  }

  get opts(): RecognizerOptions {
    return this.cfg.recognizer ?? DEFAULT_OPTIONS;
  }

  /** For tests: force the next round's action. */
  forceNext(a: BotAction) {
    this.forced = a;
  }

  /** Current stage: 1 basic, 2 adds signature moves, 3 adds stance and Heat moves. */
  get stage(): 1 | 2 | 3 {
    const reps = this.cfg.reps;
    if (!reps) return 3;
    const i = Math.max(0, this.roundIndex - 1);
    return i < reps / 3 ? 1 : i < (2 * reps) / 3 ? 2 : 3;
  }

  private pick<T>(arr: T[]): T | null {
    return arr.length ? arr[Math.floor(this.cfg.rng() * arr.length)] : null;
  }

  /** Picks a bot move allowed in the current stage, favouring the newest unlocked tier. */
  private pickTiered(arr: BotAction[]): BotAction | null {
    const st = this.stage;
    const allowed = arr.filter((a) => (a.tier ?? 1) <= st);
    const pool = allowed.length ? allowed : arr;
    const newest = pool.filter((a) => (a.tier ?? 1) === st);
    if (st > 1 && newest.length && this.cfg.rng() < 0.6) return this.pick(newest);
    return this.pick(pool);
  }

  /** Adaptive weights: kinds you fail more often come up more often. */
  adaptiveWeights(): Record<RoundKind, number> {
    const w = {} as Record<RoundKind, number>;
    for (const k of Object.keys(this.recentByKind) as RoundKind[]) {
      const r = this.recentByKind[k].slice(-8);
      const failRate = r.length ? r.filter((x) => !x).length / r.length : 0.5;
      w[k] = 1 + 3 * failRate;
    }
    return w;
  }

  chooseAction(): BotAction {
    if (this.forced) {
      const f = this.forced;
      this.forced = null;
      return f;
    }
    const p = this.pools;
    const rng = this.cfg.rng;
    switch (this.cfg.drill) {
      case 'punish-standing':
        return this.pickTiered(p.unsafeHighMid.filter((a) => a.level === 'mid' || a.level === 'high'))!;
      case 'punish-crouching':
        return this.pickTiered(p.unsafeLow)!;
      case 'block-mixup':
        return this.pickTiered(p.blockable)!;
      case 'throw-break':
        return throwAction(rng, this.pick(this.cfg.opponents) ?? undefined);
      case 'whiff-punish':
        return this.pickTiered(p.whiffable)!;
      case 'mixed-pressure': {
        const w = this.adaptiveWeights();
        const kinds: [RoundKind, number][] = [['punish', w.punish], ['block', w.block], ['throw', w.throw], ['safe', w.safe]];
        let r = rng() * kinds.reduce((s, [, x]) => s + x, 0);
        let kind: RoundKind = 'block';
        for (const [k, x] of kinds) {
          if ((r -= x) <= 0) {
            kind = k;
            break;
          }
        }
        if (kind === 'throw') return throwAction(rng, this.pick(this.cfg.opponents) ?? undefined);
        if (kind === 'punish') return this.pickTiered(shuffle([...p.unsafeHighMid, ...p.unsafeLow], rng))!;
        if (kind === 'safe') return this.pickTiered(p.safe)!;
        return this.pickTiered(p.blockable)!;
      }
    }
  }

  startRound(atFrame: number): EngineEvent[] {
    this.roundIndex++;
    const a = this.chooseAction();
    const d = DIFFICULTY[this.cfg.difficulty];
    const idle = d.idleMin + Math.floor(this.cfg.rng() * (d.idleMax - d.idleMin));
    const t0 = atFrame + idle;
    const impact = t0 + a.startup - 1; // an iN move connects on its Nth frame
    const reveal = Math.max(t0, impact - d.revealBefore);
    const playerActionable = impact + 1 + BLOCKSTUN;
    const botActionable = playerActionable - a.blockAdv; // bot -12 => recovers 12f after the player
    const end = a.kind === 'whiff' ? impact + a.recovery + 40 : a.kind === 'throw' ? impact + this.cfg.throwBreakWindow + 30 : Math.max(botActionable, playerActionable) + 45;
    this.action = a;
    this.timeline = { t0, impact, reveal, playerActionable, botActionable, end };
    this.phase = 'idle';
    this.blocked = false;
    this.crouchBlocked = false;
    this.playerMove = null;
    this.result = null;
    this.group = null;
    return [{ type: 'round-start', frame: atFrame, action: a }];
  }

  private finish(r: RoundResult, f: number, events: EngineEvent[]) {
    this.result = r;
    this.phase = 'done';
    if (this.action) this.recentByKind[this.action.kind].push(r.success);
    events.push({ type: 'result', frame: f, result: r, action: this.action ?? undefined });
  }

  /** Player move detection (press groups), returns a matched move if a group just completed. */
  private detectPress(input: Frame): { move: Move | null; group: PressGroup } | null {
    const fresh = this.history.newPresses();
    if (fresh) {
      if (!this.group) this.group = { start: input.frame, mask: fresh, dirAtStart: input.dir };
      else this.group.mask |= fresh;
    }
    if (!this.group) return null;
    if (input.frame - this.group.start < this.opts.simulWindow - 1) return null;
    const g = this.group;
    this.group = null;
    return { move: this.matcher.match(g, this.history, this.opts), group: g };
  }

  update(input: Frame): EngineEvent[] {
    const events = this.step(input);
    const pm = events.find((e) => e.type === 'player-move');
    if (pm?.move) this.playerMove = { move: rootMove(this.cfg.player, pm.move), frame: pm.frame };
    return events;
  }

  private step(input: Frame): EngineEvent[] {
    const events: EngineEvent[] = [];
    this.history.push(input);
    const a = this.action;
    const tl = this.timeline;
    if (!a || !tl || this.phase === 'done') return events;
    const f = input.frame;

    if (f === tl.t0) this.phase = 'startup';
    if (f === tl.reveal) events.push({ type: 'reveal', frame: f, action: a });

    const press = this.detectPress(input);
    const pressFrame = press?.group.start ?? -1;

    // ----- throws -----
    if (a.kind === 'throw') {
      if (press && pressFrame >= tl.t0) {
        const mask = press.group.mask;
        const want = a.throwBreak === 1 ? 0b0001 : a.throwBreak === 2 ? 0b0010 : 0b0011;
        if (pressFrame < tl.impact - 3) {
          this.finish({ outcome: 'pressed-early', success: false, detail: `Pressed ${pressFrame - tl.impact} frames before the throw connected. In Tekken you would have attacked instead of breaking.` }, f, events);
        } else if (pressFrame > tl.impact + this.cfg.throwBreakWindow) {
          this.finish({ outcome: 'late-break', success: false, detail: `Break came ${pressFrame - tl.impact} frames after the grab; window is ${this.cfg.throwBreakWindow}.` }, f, events);
        } else if ((mask & 0b0011) === want) {
          this.finish({ outcome: 'broke-throw', success: true, detail: `Broken ${pressFrame - tl.impact} frames after the grab.`, reactionFrames: pressFrame - tl.reveal }, f, events);
        } else {
          this.finish({ outcome: 'wrong-break', success: false, detail: `Needed ${a.throwBreak === 12 ? '1+2' : a.throwBreak}.` }, f, events);
        }
        return events;
      }
      if (f === tl.impact) {
        events.push({ type: 'impact', frame: f, action: a });
        if (guardAt(input.dir) === 'crouch') {
          this.finish({ outcome: 'ducked', success: true, detail: 'Crouching makes standing throws whiff.' }, f, events);
          return events;
        }
      }
      if (f > tl.impact + this.cfg.throwBreakWindow + this.opts.simulWindow) this.finish({ outcome: 'thrown', success: false, detail: `No break within ${this.cfg.throwBreakWindow} frames. Needed ${a.throwBreak === 12 ? '1+2' : a.throwBreak}.` }, f, events);
      return events;
    }

    // ----- whiff punish -----
    if (a.kind === 'whiff') {
      if (press?.move && pressFrame >= tl.t0) {
        const m = press.move;
        const s = rootMove(this.cfg.player, m).startupFrame ?? 99;
        events.push({ type: 'player-move', frame: pressFrame, move: m });
        if (pressFrame <= tl.impact) {
          this.finish({ outcome: 'pressed-early', success: false, detail: 'You pressed before the attack finished its active frames; in Tekken this usually trades or gets you counter-hit.', playerMove: m }, f, events);
        } else {
          const hitFrame = pressFrame + s - 1;
          const vulnerableUntil = tl.impact + a.recovery;
          if (hitFrame <= vulnerableUntil)
            this.finish({ outcome: 'whiff-punished', success: true, detail: `${m.input} (i${s}) landed with ${vulnerableUntil - hitFrame} frame(s) to spare.`, playerMove: m, reactionFrames: pressFrame - tl.impact }, f, events);
          else
            this.finish({ outcome: 'too-slow', success: false, detail: `${m.input} (i${s}) arrived ${hitFrame - vulnerableUntil} frame(s) after the bot recovered (recovery ${a.recovery}f).`, playerMove: m }, f, events);
        }
        return events;
      }
      if (f === tl.impact) events.push({ type: 'impact', frame: f, action: a });
      if (f > tl.impact + a.recovery + 30) this.finish({ outcome: 'missed-punish', success: false, detail: `The bot recovered after ${a.recovery} frames.` }, f, events);
      return events;
    }

    // ----- attacks: punish / block / safe -----
    if (f < tl.impact && press?.move && pressFrame >= tl.t0) {
      this.finish({ outcome: 'pressed-early', success: false, detail: 'You attacked while the bot\'s move was already coming out.', playerMove: press.move }, f, events);
      return events;
    }
    if (f === tl.impact) {
      events.push({ type: 'impact', frame: f, action: a });
      const g = guardAt(this.history.dirAt(f));
      const lv = a.level;
      const ok = (lv === 'low' && g === 'crouch') || ((lv === 'mid' || lv === 'high') && g === 'stand');
      if (lv === 'high' && g === 'crouch') {
        this.finish({ outcome: 'ducked', success: true, detail: 'Ducked the high. (This drill wants a block, but ducking is valid defence.)' }, f, events);
        return events;
      }
      if (!ok) {
        this.finish({ outcome: 'got-hit', success: false, detail: `${a.label} is a ${lv}: ${lv === 'low' ? 'crouch-block it (d/b)' : 'stand-block it (b or neutral)'}.` }, f, events);
        return events;
      }
      this.blocked = true;
      this.crouchBlocked = g === 'crouch';
      this.phase = 'recovery';
      if (a.kind === 'block') {
        this.finish({ outcome: 'blocked', success: true, detail: `Blocked the ${lv}.`, reactionFrames: undefined }, f, events);
      }
      return events;
    }

    if (this.blocked && a.kind === 'safe') {
      // Bot follows its safe/plus move with a jab (i10) as soon as it can act.
      const botJabHit = tl.botActionable + 10 - 1;
      if (press?.move && pressFrame > tl.impact) {
        const s = rootMove(this.cfg.player, press.move).startupFrame ?? 99;
        const start = Math.max(pressFrame, tl.playerActionable);
        const myHit = start + s - 1;
        events.push({ type: 'player-move', frame: pressFrame, move: press.move });
        if (myHit < botJabHit)
          this.finish({ outcome: 'held-turn', success: true, detail: `Your ${press.move.input} (i${s}) beat the bot's follow-up: the bot was ${a.blockAdv} on block.`, playerMove: press.move }, f, events);
        else
          this.finish({ outcome: 'pressed-into-safe', success: false, detail: `${a.label} is ${a.blockAdv >= 0 ? '+' : ''}${a.blockAdv} on block. Your i${s} lost to the bot's i10 follow-up. Block once more instead.`, playerMove: press.move }, f, events);
        return events;
      }
      if (f >= botJabHit) {
        const g = guardAt(input.dir);
        if (g !== 'none') this.finish({ outcome: 'held-turn', success: true, detail: `Correct: ${a.label} is ${a.blockAdv} on block, not punishable. You ${g === 'stand' ? 'blocked' : 'ducked'} the follow-up.` }, f, events);
        else this.finish({ outcome: 'got-hit', success: false, detail: 'The bot\'s follow-up jab (high) hit you: you were not stand-blocking or crouching.' }, f, events);
      }
      return events;
    }

    if (this.blocked && a.kind === 'punish') {
      const window = tl.botActionable - tl.playerActionable; // = -blockAdv
      if (press?.move) {
        const m = press.move;
        const root = rootMove(this.cfg.player, m);
        const s = root.startupFrame ?? 99;
        events.push({ type: 'player-move', frame: pressFrame, move: m });
        const fromCrouch = this.crouchBlocked;
        const stanceOk = !fromCrouch || /^(ws|iws|FC|hFC|d\+|db\+|df\+|uf\+|u\+|ub\+)/.test(m.id) || this.cfg.player.punishers.some((p) => p.stance === 'crouching' && rootMove(this.cfg.player, lookupMove(this.cfg.player, p.moveId) ?? m).id === m.id);
        const best = punishersFor(this.cfg.player.punishers, a.blockAdv, fromCrouch ? 'crouching' : 'standing');
        const tip = best.length ? `Best listed punisher for ${a.blockAdv}: ${best.map((b) => b.moveId).join(' / ')}.` : undefined;
        if (!stanceOk) {
          this.finish({ outcome: 'wrong-stance', success: false, detail: `${m.input} is a standing move; after a crouch block use ws/FC moves or your crouching punishers.`, tip, playerMove: m }, f, events);
          return events;
        }
        const start = Math.max(pressFrame, tl.playerActionable);
        const delay = start - tl.playerActionable;
        if (s > window) {
          this.finish({ outcome: 'not-guaranteed', success: false, detail: `${m.input} is i${s}; the window was ${window} frames.`, tip, playerMove: m }, f, events);
        } else if (delay + s > window) {
          this.finish({ outcome: 'too-slow', success: false, detail: `${m.input} (i${s}) fits the ${window}f window, but you pressed ${delay} frame(s) late.`, tip, playerMove: m }, f, events);
        } else {
          const optimal = best.some((b) => rootMove(this.cfg.player, lookupMove(this.cfg.player, b.moveId) ?? m).id === root.id);
          this.finish({ outcome: 'punished', success: true, detail: `${m.input} (i${s}) inside a ${window}f window, ${delay ? `${delay}f after recovering` : 'on the first frame'}.`, tip: optimal ? undefined : tip, playerMove: m, reactionFrames: delay }, f, events);
        }
        return events;
      }
      if (f > tl.botActionable + 20) this.finish({ outcome: 'missed-punish', success: false, detail: `${a.label} was ${a.blockAdv} on block: a ${-a.blockAdv}-frame window.` }, f, events);
    }
    return events;
  }
}
