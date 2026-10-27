// Free Fight: a full match against a character-driven bot (health, rounds, timer).
//
// Everything a move does comes from its imported frame data: startup, damage, hit level,
// block / hit / counter-hit advantage, recovery, launch / knockdown on hit, crouch / jump
// status (crush) and power crush frames, throw breaks. The bot punishes with its character's
// real punisher table.
//
// What is a simplification (this is NOT Tekken 8's engine): range (estimated from the move
// type), movement speeds, pushback, juggle gravity and damage scaling, string timing between
// hits, no sidesteps, Heat or Rage. The UI states this.
import type { CharacterData, Dir, Move } from '../types';
import { firstHitLevel, punishersFor, recoveryFrames } from './frames';
import { checkPress, DEFAULT_OPTIONS, InputHistory, type Frame, type PressGroup, type RecognizerOptions } from './recognizer';
import { isDownish, parseNotation, type InputStep } from './notation';
import { MoveMatcher } from './sim';
import type { Rng } from './quiz';
import type { Difficulty } from './progress';
import { lookupMove } from '../data';

export const MAX_HP = 180;
export const ROUND_SECONDS = 60;
export const FPS = 60;
export const STAGE_MIN = 70;
export const STAGE_MAX = 890;
export const MIN_GAP = 66;
const WALK_F = 2.6;
const WALK_B = 2.2;
const INTRO_FRAMES = 110;
const KO_FRAMES = 150;
/** Heat lasts about 10 seconds (simulation value). */
export const HEAT_FRAMES = 600;
/** Rage turns on at low health (simulation value: 20%). */
export const RAGE_HP = Math.round(MAX_HP * 0.2);

export type Level = 'high' | 'mid' | 'low' | 'throw';
export type FighterState = 'neutral' | 'attack' | 'blockstun' | 'hitstun' | 'air' | 'down' | 'throwing' | 'thrown' | 'ko';

export interface Fighter {
  side: 0 | 1; // 0 = player (left, facing right)
  char: CharacterData;
  x: number;
  hp: number;
  state: FighterState;
  until: number; // end of a stun / air / down / throw state
  crouching: boolean;
  guard: 'stand' | 'crouch' | 'none';
  walking: -1 | 0 | 1; // towards (+1) / away from (-1) the opponent
  move: Move | null;
  moveStart: number;
  hitAt: number;
  endAt: number;
  outcome: 'pending' | 'hit' | 'block' | 'whiff' | 'counter';
  lunge: number; // px per frame during startup
  queued: Move | null; // next segment of a string
  air: { t0: number; dur: number; h: number } | null;
  combo: { hits: number; damage: number };
  lastHit: number; // frame of the last hit taken (for flashes)
  throwBreak: '1' | '2' | '1+2' | 'either' | null;
  /** Damage this fighter dealt in the round. */
  dealt: number;
  /** Heat: one per round. Heat Burst (2+3) or a Heat Engager hit starts it; a Heat Smash spends it. */
  heat: 'ready' | 'active' | 'used';
  heatUntil: number;
  /** Rage Art used this round. */
  rageUsed: boolean;
}

export const inRage = (x: Fighter) => x.hp > 0 && x.hp <= RAGE_HP && !x.rageUsed;

export interface FightEvent {
  type: 'hit' | 'counter' | 'block' | 'whiff' | 'launch' | 'throw' | 'break' | 'ko' | 'round-start' | 'fight' | 'time-up' | 'round-end' | 'match-end' | 'punish' | 'crush' | 'heat' | 'heat-smash' | 'rage' | 'rage-art';
  by?: 0 | 1;
  x?: number;
  level?: Level;
  damage?: number;
  text?: string;
}

export interface FightConfig {
  player: CharacterData;
  bot: CharacterData;
  difficulty: Difficulty;
  rng: Rng;
  roundsToWin?: number;
  throwBreakWindow?: number;
  recognizer?: RecognizerOptions;
}

// ---------- move helpers (exported for tests) ----------

export function moveDamage(m: Move): number {
  return (m.damage.match(/\d+/g) ?? []).reduce((s, d) => s + Number(d), 0);
}

export function moveLevel(m: Move): Level {
  if (m.isThrow) return 'throw';
  const l = firstHitLevel(m);
  return l === 'high' || l === 'low' || l === 'throw' ? l : 'mid';
}

const lastPressButtons = (id: string) => (/([1-4](?:\+[1-4])*)[^1-4]*$/.exec(id)?.[1] ?? '');
const isRunning = (m: Move) => /f,F|f,f|WR|wr/.test(m.id);

/** Estimated reach in px (the data has no range): kicks reach further than punches, running moves lunge. */
export function moveRange(m: Move): number {
  if (m.isThrow) return 84;
  const b = lastPressButtons(m.id);
  let r = /[34]/.test(b) ? 118 : 100;
  if (isRunning(m)) r += 80;
  if (m.parent) r += 10;
  return r;
}

/** Parse a hit / counter-hit advantage string like "+33a (+23a)", "+2d", "-1". */
export function parseOnHit(s: string): { adv: number; launch: boolean; knockdown: boolean } {
  const first = s.trim().split(/\s|\(/)[0] ?? '';
  const n = /([+-]?\d+)/.exec(first);
  return { adv: n ? Number(n[1]) : 0, launch: /\d+a/.test(first), knockdown: /\d+d/.test(first) || /^\+?\d*d$/.test(first) };
}

/** Frame ranges of crush properties ("cs6~31, js9~20, pc8~") relative to the start of the move. */
export function crushRanges(m: Move): { kind: 'cs' | 'js' | 'pc'; from: number; to: number }[] {
  const out: { kind: 'cs' | 'js' | 'pc'; from: number; to: number }[] = [];
  for (const part of (m.crush || '').split(/[,\s]+/)) {
    const r = /^(cs|js|pc)(\d+)(?:~(\d+)?)?/i.exec(part);
    if (r) out.push({ kind: r[1].toLowerCase() as 'cs' | 'js' | 'pc', from: Number(r[2]), to: r[3] ? Number(r[3]) : 999 });
  }
  return out;
}

export function throwBreakOf(m: Move): Fighter['throwBreak'] {
  const t = /Throw break ([12+ or]+)/i.exec(m.notes)?.[1]?.trim() ?? '';
  if (/1\+2/.test(t)) return '1+2';
  if (/1 or 2/.test(t)) return 'either';
  if (t === '1' || t === '2') return t;
  return /1\+3/.test(m.id) ? '1' : /2\+4/.test(m.id) ? '2' : 'either';
}

/** Chain of string segments that leads to a move: "1,2,4" -> [1, 1,2, 1,2,4]. */
export function chainTo(c: CharacterData, m: Move): Move[] {
  const out = [m];
  let cur = m;
  for (let i = 0; i < 8 && cur.parent; i++) {
    const p = lookupMove(c, cur.parent);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
}

// ---------- per-character move sets ----------

const STANCE_PREFIX = /^[A-Za-z]{1,5}\./;
const SIGNATURE = /Heat Engager|Power Crush|Homing|Tornado|Balcony Break/i;

export interface MoveSet {
  roots: Move[];
  children: Map<string, Move[]>;
  pokes: Move[];
  lows: Move[];
  launchers: Move[];
  signature: Move[];
  strings: Move[];
  throws: Move[];
  fast: Move[];
  running: Move[];
  childStep: Map<Move, InputStep>;
  heatBurst: Move | null;
  heatMoves: Move[]; // H. roots (Heat Smash first)
  rageArt: Move | null;
  /** Real juggle routes from the character's combos, resolved to moves (string segments in order). */
  routes: Move[][];
  /** Player-side matching for H. / R. moves (prefix stripped). */
  special: { move: Move; step: InputStep; kind: 'heat' | 'rage' }[];
}

const stripHR = (id: string) => id.replace(/^[HR]\./, '');

/** Resolve a combo route ("df+3 f+3,2~DF CD.1 T! dash f+1+2") into moves; stops at the first unknown token. */
export function resolveRoute(c: CharacterData, route: string): Move[] {
  const out: Move[] = [];
  for (const raw of route.split(/\s+/)) {
    const tok = raw.replace(/[(),]+$/, '').replace(/~[A-Za-z]+$/, '');
    if (!tok || /^(T!|W!|B!|dash|ff|f,f|ss|SS|\.\.\.)$/i.test(tok)) continue;
    const m = lookupMove(c, tok);
    if (!m || m.startupFrame === null || m.isThrow) break;
    if (STANCE_PREFIX.test(m.id) && !/^(H)\./.test(m.id)) break; // needs a stance transition the sim does not model
    for (const seg of chainTo(c, m)) if (out[out.length - 1] !== seg) out.push(seg);
  }
  return out;
}

export function moveSet(c: CharacterData): MoveSet {
  const usable = (m: Move) => m.startupFrame !== null && m.startupFrame > 0 && !STANCE_PREFIX.test(m.id) && !/^(R|H)\./.test(m.id);
  const roots = c.frames.moves.filter((m) => !m.parent && usable(m));
  const children = new Map<string, Move[]>();
  const childStep = new Map<Move, InputStep>();
  for (const m of c.frames.moves) {
    if (!m.parent || m.startupFrame === null) continue;
    try {
      const steps = parseNotation(stripHR(m.id)).filter((s) => s.kind === 'press');
      const last = steps[steps.length - 1];
      if (!last) continue;
      childStep.set(m, last);
    } catch {
      continue;
    }
    const list = children.get(m.parent) ?? [];
    list.push(m);
    children.set(m.parent, list);
  }
  const lv = (m: Move) => moveLevel(m);
  const sf = (m: Move) => m.startupFrame ?? 99;
  const special: MoveSet['special'] = [];
  for (const m of c.frames.moves) {
    if (m.parent || m.startupFrame === null || !/^[HR]\./.test(m.id)) continue;
    try {
      const first = parseNotation(stripHR(m.id)).find((s) => s.kind === 'press');
      if (first && !first.stance) special.push({ move: m, step: first, kind: m.id.startsWith('H.') ? 'heat' : 'rage' });
    } catch {
      /* unparseable: not offered */
    }
  }
  special.sort((a, b) => b.step.motion.length - a.step.motion.length || b.step.buttons.length - a.step.buttons.length);
  const heatMoves = c.frames.moves.filter((m) => !m.parent && m.id.startsWith('H.') && m.startupFrame !== null && !STANCE_PREFIX.test(stripHR(m.id)));
  heatMoves.sort((a, b) => Number(/Heat Smash/.test(b.notes)) - Number(/Heat Smash/.test(a.notes)));
  const routes = c.combos
    .map((x) => resolveRoute(c, x.route))
    .filter((r) => r.length >= 2 && r.every((m) => !m.id.startsWith('R.')));
  return {
    heatBurst: roots.find((m) => /Heat Burst/.test(m.notes)) ?? null,
    heatMoves,
    rageArt: c.frames.moves.find((m) => m.id.startsWith('R.') && /Rage Art/.test(m.notes)) ?? null,
    routes,
    special,
    roots,
    children,
    childStep,
    pokes: roots.filter((m) => !/Heat Burst/.test(m.notes) && !m.isThrow && lv(m) !== 'low' && sf(m) <= 15 && (m.blockFrame ?? -99) >= -6),
    lows: roots.filter((m) => lv(m) === 'low' && sf(m) <= 26),
    launchers: roots.filter((m) => !m.isThrow && /\d+a/.test(m.hit) && lv(m) !== 'high'),
    signature: roots.filter((m) => !m.isThrow && !/Heat Burst/.test(m.notes) && (SIGNATURE.test(m.notes) || c.profile.heatEngagers.includes(m.id) || c.profile.keyLaunchers.includes(m.id))),
    strings: roots.filter((m) => !m.isThrow && children.has(m.id)),
    throws: roots.filter((m) => m.isThrow && /^(1\+3|2\+4)$/.test(m.id)),
    fast: roots.filter((m) => !m.isThrow && lv(m) !== 'low' && sf(m) <= 13).sort((a, b) => sf(a) - sf(b)),
    running: roots.filter((m) => !m.isThrow && isRunning(m)),
  };
}

// ---------- bot personality ----------

export interface BotSkill {
  react: number; // frames to react to an attack
  guard: number; // chance to pick the right guard once reacted
  punish: number; // chance to punish a punishable block
  aggression: number; // chance to attack on a neutral decision
  breakThrow: number;
  combo: number; // chance to continue a string / juggle
}

export const BOT_SKILL: Record<Difficulty, BotSkill> = {
  easy: { react: 26, guard: 0.35, punish: 0.3, aggression: 0.28, breakThrow: 0.2, combo: 0.45 },
  normal: { react: 20, guard: 0.6, punish: 0.65, aggression: 0.42, breakThrow: 0.45, combo: 0.75 },
  hard: { react: 15, guard: 0.85, punish: 0.92, aggression: 0.55, breakThrow: 0.7, combo: 0.95 },
};

// ---------- engine ----------

export type FightPhase = 'intro' | 'fight' | 'ko' | 'over';

export class FightEngine {
  readonly cfg: FightConfig;
  readonly sets: [MoveSet, MoveSet];
  readonly matcher: MoveMatcher;
  readonly skill: BotSkill;
  history = new InputHistory(300);
  frame = 0;
  phase: FightPhase = 'intro';
  phaseAt = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timer = ROUND_SECONDS * FPS;
  f: [Fighter, Fighter];
  winner: 0 | 1 | null = null; // of the match
  roundWinner: 0 | 1 | 'draw' | null = null;
  banner: { text: string; until: number } | null = null;
  private group: PressGroup | null = null;
  private buffered: { move: Move; frame: number } | null = null;
  // bot memory
  private botNext = 0;
  private botGuardSet = -1;
  private botPlan: Move[] = [];
  private botBlocked: { adv: number; free: number; crouch: boolean } | null = null;
  private rageShown: [boolean, boolean] = [false, false];
  /** What the player tends to do, for the bot's reads. */
  habits = { stand: 1, crouch: 1, mash: 1, patient: 1 };
  /** Bot's expected frame advantage after the last exchange, valid until `until`. */
  private botAdv = { adv: 0, until: -1 };

  constructor(cfg: FightConfig) {
    this.cfg = cfg;
    this.sets = [moveSet(cfg.player), moveSet(cfg.bot)];
    this.matcher = new MoveMatcher(cfg.player);
    this.skill = BOT_SKILL[cfg.difficulty];
    this.f = [this.newFighter(0, cfg.player), this.newFighter(1, cfg.bot)];
    this.startRound(0);
  }

  get roundsToWin() {
    return this.cfg.roundsToWin ?? 2;
  }
  get opts() {
    return this.cfg.recognizer ?? DEFAULT_OPTIONS;
  }

  private newFighter(side: 0 | 1, char: CharacterData): Fighter {
    return {
      side, char, x: side === 0 ? 360 : 600, hp: MAX_HP, state: 'neutral', until: 0, crouching: false, guard: 'stand', walking: 0,
      move: null, moveStart: 0, hitAt: 0, endAt: 0, outcome: 'pending', lunge: 0, queued: null, air: null, combo: { hits: 0, damage: 0 }, lastHit: -999, throwBreak: null, dealt: 0, heat: 'ready', heatUntil: 0, rageUsed: false,
    };
  }

  private startRound(at: number) {
    const keep = this.f.map((x) => x.char);
    this.f = [this.newFighter(0, keep[0]), this.newFighter(1, keep[1])];
    this.phase = 'intro';
    this.phaseAt = at;
    this.timer = ROUND_SECONDS * FPS;
    this.roundWinner = null;
    this.botPlan = [];
    this.botBlocked = null;
    this.buffered = null;
    this.rageShown = [false, false];
    this.banner = { text: this.wins[0] === this.roundsToWin - 1 && this.wins[1] === this.roundsToWin - 1 ? 'FINAL ROUND' : `ROUND ${this.round}`, until: at + 70 };
  }

  get secondsLeft() {
    return Math.ceil(this.timer / FPS);
  }

  /** Advance one frame with the player's input. */
  update(input: Frame): FightEvent[] {
    const ev: FightEvent[] = [];
    this.frame = input.frame;
    this.history.push(input);
    const now = input.frame;
    const [p, b] = this.f;

    if (this.phase === 'over') return ev;
    if (this.phase === 'intro') {
      if (now - this.phaseAt === 70) {
        this.banner = { text: 'FIGHT!', until: now + 40 };
        ev.push({ type: 'fight' });
      }
      if (now - this.phaseAt >= INTRO_FRAMES) this.phase = 'fight';
      this.idleUpdate(p, now);
      this.idleUpdate(b, now);
      this.detectPress(input); // swallow presses
      return ev;
    }
    if (this.phase === 'ko') {
      this.idleUpdate(p, now);
      this.idleUpdate(b, now);
      if (now - this.phaseAt >= KO_FRAMES) this.afterRound(now, ev);
      return ev;
    }

    // ----- fight -----
    this.timer--;
    this.tickStates(p, now);
    this.tickStates(b, now);
    this.playerControl(input, ev);
    this.botControl(now, ev);
    this.advanceAttack(p, b, now, ev);
    this.advanceAttack(b, p, now, ev);
    this.resolveThrow(p, b, now, ev, input);
    this.resolveThrow(b, p, now, ev, input);
    this.separate();
    if (this.pending.length) {
      ev.push(...this.pending);
      this.pending = [];
    }
    for (const x of [p, b]) {
      if (inRage(x) && !this.rageShown[x.side]) {
        this.rageShown[x.side] = true;
        ev.push({ type: 'rage', by: x.side, text: `${x.char.profile.short}: RAGE` });
      }
      if (x.hp <= 0 && x.state !== 'ko') {
        x.hp = 0;
        x.state = 'ko';
        x.air = x.air ?? { t0: now, dur: 40, h: 50 };
      }
    }
    if (p.state === 'ko' || b.state === 'ko') {
      const winner: 0 | 1 | 'draw' = p.state === 'ko' && b.state === 'ko' ? 'draw' : p.state === 'ko' ? 1 : 0;
      this.endRound(winner, now, ev, 'K.O.');
    } else if (this.timer <= 0) {
      const winner: 0 | 1 | 'draw' = p.hp === b.hp ? 'draw' : p.hp > b.hp ? 0 : 1;
      this.endRound(winner, now, ev, 'TIME UP');
    }
    return ev;
  }

  private endRound(winner: 0 | 1 | 'draw', now: number, ev: FightEvent[], text: string) {
    this.roundWinner = winner;
    if (winner === 'draw') {
      this.wins[0]++;
      this.wins[1]++;
    } else this.wins[winner]++;
    this.phase = 'ko';
    this.phaseAt = now;
    this.banner = { text: winner === 'draw' && text === 'K.O.' ? 'DOUBLE K.O.' : text === 'TIME UP' && winner === 'draw' ? 'DRAW' : text, until: now + 90 };
    ev.push({ type: text === 'K.O.' ? 'ko' : 'time-up', text });
    ev.push({ type: 'round-end', by: winner === 'draw' ? undefined : winner });
  }

  private afterRound(now: number, ev: FightEvent[]) {
    const [w0, w1] = this.wins;
    const need = this.roundsToWin;
    if (w0 >= need || w1 >= need) {
      this.winner = w0 === w1 ? null : w0 > w1 ? 0 : 1;
      this.phase = 'over';
      this.banner = { text: this.winner === 0 ? 'YOU WIN' : this.winner === 1 ? 'YOU LOSE' : 'DRAW', until: Infinity };
      ev.push({ type: 'match-end', by: this.winner ?? undefined });
      return;
    }
    this.round++;
    this.startRound(now);
    ev.push({ type: 'round-start' });
  }

  private idleUpdate(x: Fighter, now: number) {
    if (x.state === 'ko') return;
    this.tickStates(x, now);
    if (this.phase === 'intro') {
      x.state = 'neutral';
      x.move = null;
    }
  }

  private tickStates(x: Fighter, now: number) {
    if (x.side === 0 && this.botAdv.until === now && this.botAdv.adv >= 0 && x.state === 'neutral') this.habits.patient++;
    if (x.state === 'ko') return;
    if (x.heat === 'active' && now >= x.heatUntil) x.heat = 'used';
    if ((x.state === 'blockstun' || x.state === 'hitstun') && now >= x.until) {
      x.state = 'neutral';
      x.combo = { hits: 0, damage: 0 };
    }
    if (x.state === 'air' && now >= x.until) {
      x.state = 'down';
      x.until = now + 34;
      x.air = null;
    }
    if (x.state === 'down' && now >= x.until) {
      x.state = 'neutral';
      x.combo = { hits: 0, damage: 0 };
    }
    if (x.state === 'attack' && now >= x.endAt) {
      if (x.queued) this.beginSegment(x, x.queued, now);
      else {
        x.state = 'neutral';
        x.move = null;
      }
    }
  }

  canAct(x: Fighter) {
    return x.state === 'neutral';
  }

  /** Start a move (root) for a fighter. */
  startMove(x: Fighter, m: Move, now: number) {
    x.state = 'attack';
    x.queued = null;
    this.beginSegment(x, m, now, true);
    if (/Heat Burst/.test(m.notes) && x.heat === 'ready') this.startHeat(x, now);
    if (m.id.startsWith('H.') && /Heat Smash/.test(m.notes)) {
      x.heat = 'used';
      this.pending.push({ type: 'heat-smash', by: x.side, text: `${x.char.profile.short}: Heat Smash` });
    }
    if (m.id.startsWith('R.')) {
      x.rageUsed = true;
      this.pending.push({ type: 'rage-art', by: x.side, text: `${x.char.profile.short}: RAGE ART` });
    }
  }

  private pending: FightEvent[] = [];

  private startHeat(x: Fighter, now: number) {
    x.heat = 'active';
    x.heatUntil = now + HEAT_FRAMES;
    this.pending.push({ type: 'heat', by: x.side, text: `${x.char.profile.short}: HEAT` });
  }

  /** Can this fighter use the move right now (Heat / Rage requirements)? */
  allowed(x: Fighter, m: Move) {
    if (m.id.startsWith('H.')) return x.heat === 'active';
    if (m.id.startsWith('R.')) return inRage(x);
    if (/Heat Burst/.test(m.notes)) return x.heat === 'ready';
    return true;
  }

  private beginSegment(x: Fighter, m: Move, now: number, root = false) {
    const prev = x.move;
    x.move = m;
    x.state = 'attack';
    x.queued = null;
    x.outcome = 'pending';
    x.crouching = /^(d|db|df|FC)\b|^(d|db|df)\+/.test(m.id);
    if (root || !prev) {
      x.moveStart = now;
      x.hitAt = now + (m.startupFrame ?? 12) - 1;
    } else {
      // String timing is not in the data: next hit 12 frames after the previous one (or the listed gap).
      const gap = m.startupFrame && prev.startupFrame && m.startupFrame > prev.startupFrame ? Math.min(24, m.startupFrame - prev.startupFrame) : 12;
      x.moveStart = Math.min(now, x.hitAt + 1);
      x.hitAt = Math.max(now + 4, x.hitAt + gap);
    }
    x.endAt = x.hitAt + 1 + (recoveryFrames(m) ?? 20);
    const range = moveRange(m);
    const dist = Math.abs(this.f[1].x - this.f[0].x);
    const need = Math.max(0, dist - range + 20);
    x.lunge = isRunning(m) || need > 0 ? Math.min(need, isRunning(m) ? 90 : 30) / Math.max(1, x.hitAt - now) : 0;
    if (m.isThrow) x.throwBreak = throwBreakOf(m);
  }

  /** Queue the next segment of a string if `m` follows the current move. */
  queueChild(x: Fighter, m: Move) {
    if (x.state !== 'attack' || !x.move || m.parent !== x.move.id) return false;
    x.queued = m;
    // continue right after the current hit instead of waiting for full recovery
    x.endAt = Math.min(x.endAt, Math.max(this.frame + 1, x.hitAt + 6));
    return true;
  }

  // ---------- player ----------

  private detectPress(input: Frame): PressGroup | null {
    const fresh = this.history.newPresses();
    if (fresh) {
      if (!this.group) this.group = { start: input.frame, mask: fresh, dirAtStart: input.dir };
      else this.group.mask |= fresh;
    }
    if (!this.group) return null;
    if (input.frame - this.group.start < this.opts.simulWindow - 1) return null;
    const g = this.group;
    this.group = null;
    return g;
  }

  private playerControl(input: Frame, ev: FightEvent[]) {
    const p = this.f[0];
    const now = input.frame;
    const dir = input.dir;
    const group = this.detectPress(input);

    if (p.state === 'thrown' && group) {
      const mask = group.mask & 0b0011;
      const want = p.throwBreak;
      const ok = mask && (want === 'either' || (want === '1+2' ? mask === 0b0011 : want === '1' ? mask & 0b0001 : mask & 0b0010));
      if (ok) this.breakThrow(this.f[1], p, now, ev);
      return;
    }
    if (group) {
      // string follow-up?
      if (p.state === 'attack' && p.move) {
        const kids = this.sets[0].children.get(p.move.id) ?? [];
        for (const k of kids) {
          const step = this.sets[0].childStep.get(k);
          if (step && checkPress({ ...step, motion: [], pressDir: step.pressDir === 'any' ? 'any' : step.pressDir }, group, this.history, this.opts).ok) {
            if (this.queueChild(p, k)) return;
          }
        }
      }
      let m: Move | null = null;
      for (const sp of this.sets[0].special) {
        if (!this.allowed(p, sp.move)) continue;
        if (checkPress(sp.step, group, this.history, this.opts).ok) {
          m = sp.move;
          break;
        }
      }
      m ??= this.matcher.match(group, this.history, this.opts);
      if (m && !this.allowed(p, m)) m = null;
      if (m) this.buffered = { move: m, frame: now };
      // habit: pressing right after blocking the bot's move
      if (this.botAdv.until >= now && this.botAdv.adv >= 0) this.habits.mash++;
    }
    if (this.canAct(p) && this.buffered && now - this.buffered.frame <= 10) {
      this.startMove(p, this.buffered.move, now);
      this.buffered = null;
      return;
    }
    if (this.buffered && now - this.buffered.frame > 10) this.buffered = null;
    if (!this.canAct(p)) {
      p.walking = 0;
      p.guard = p.state === 'blockstun' ? (isDownish(dir) ? 'crouch' : 'stand') : 'none';
      if (p.state === 'blockstun') p.crouching = isDownish(dir);
      return;
    }
    p.crouching = isDownish(dir);
    p.guard = dir === 'd' || dir === 'db' ? 'crouch' : dir === 'n' || dir === 'b' || dir === 'ub' ? 'stand' : 'none';
    p.walking = p.crouching ? 0 : dir === 'f' || dir === 'uf' ? 1 : dir === 'b' || dir === 'ub' ? -1 : 0;
    if (p.walking === 1) p.x += WALK_F;
    if (p.walking === -1) p.x -= WALK_B;
  }

  // ---------- bot ----------

  private pick<T>(arr: T[]): T | null {
    return arr.length ? arr[Math.floor(this.cfg.rng() * arr.length)] : null;
  }

  private botControl(now: number, ev: FightEvent[]) {
    const b = this.f[1];
    const p = this.f[0];
    const S = this.skill;
    const set = this.sets[1];
    const rng = this.cfg.rng;
    const dist = b.x - p.x;

    if (b.state === 'thrown') {
      if (b.until - now === 8 && rng() < S.breakThrow) this.breakThrow(p, b, now, ev);
      return;
    }
    // continue strings: the planned route first, otherwise a follow-up that suits the situation
    if (b.state === 'attack' && b.move && !b.queued && b.outcome !== 'pending') {
      const planned = this.botPlan[0];
      if (planned && planned.parent === b.move.id) {
        this.botPlan.shift();
        this.queueChild(b, planned);
      } else if (b.outcome !== 'whiff') {
        const kids = (set.children.get(b.move.id) ?? []).filter((k) => moveLevel(k) !== 'throw' && this.allowed(b, k));
        const onHit = b.outcome === 'hit' || b.outcome === 'counter';
        // on hit: finish the string; on block: only continue if the next hit is safe-ish (no free punish)
        const choices = onHit ? kids : kids.filter((k) => (k.blockFrame ?? -99) >= -9);
        if (choices.length && rng() < (onHit ? S.combo : S.combo * 0.5)) this.queueChild(b, this.pick(choices)!);
      }
    }
    if (!this.canAct(b)) {
      if (b.state === 'blockstun') {
        b.guard = b.crouching ? 'crouch' : 'stand';
        if (p.state === 'attack' && p.move && p.move.blockFrame !== null) this.botBlocked = { adv: p.move.blockFrame, free: b.until, crouch: b.crouching };
      } else b.guard = 'none';
      b.walking = 0;
      return;
    }

    const go = (m: Move | null | undefined, plan: Move[] = []) => {
      if (!m || !this.allowed(b, m)) return false;
      this.startMove(b, m, now);
      this.botPlan = plan;
      return true;
    };

    // 1. punish a blocked unsafe move with the character's real punisher table (or the Rage Art)
    if (this.botBlocked) {
      const bl = this.botBlocked;
      this.botBlocked = null;
      if (bl.adv <= -10 && now - bl.free <= 2 && rng() < S.punish) {
        if (bl.adv <= -20 && set.rageArt && inRage(b) && rng() < 0.6 && go(set.rageArt)) return;
        const entry = this.pick(punishersFor(b.char.punishers, bl.adv, bl.crouch ? 'crouching' : 'standing'));
        const mv = entry ? lookupMove(b.char, entry.moveId) : null;
        if (mv && mv.startupFrame !== null) {
          const chain = chainTo(b.char, mv);
          if (go(chain[0], chain.slice(1))) {
            ev.push({ type: 'punish', by: 1, text: `${b.char.profile.short} punishes with ${entry!.moveId} (i${chain[0].startupFrame})` });
            return;
          }
        }
      }
    }
    // 2. juggle: follow the character's real combo route, else fast hits
    if (p.state === 'air' && dist < 170) {
      const next = this.botPlan[0];
      if (next && !next.parent) {
        this.botPlan.shift();
        if (go(next, this.botPlan)) return;
      }
      if (rng() < S.combo) {
        const route = this.pick(set.routes);
        if (route && go(route[0], route.slice(1))) return;
        if (go(this.pick(set.fast.slice(0, 6)) ?? this.pick(set.pokes))) return;
      }
    }
    this.botPlan = [];
    // 3. whiff punish
    if (p.state === 'attack' && p.outcome === 'whiff' && p.endAt - now > 12 && dist < 190 && rng() < S.punish * 0.7) {
      if (go(this.pick(set.launchers.filter((x) => (x.startupFrame ?? 99) <= 16)) ?? this.pick(set.pokes))) return;
    }
    // 4. an attack is coming: guard (after reaction time), or reversal with Rage Art / Heat Burst armor
    if (p.state === 'attack' && p.move && now < p.hitAt) {
      b.walking = 0;
      if (this.botGuardSet !== p.moveStart && now - p.moveStart >= S.react) {
        this.botGuardSet = p.moveStart;
        const lv = moveLevel(p.move);
        if (lv !== 'low' && lv !== 'throw' && dist < 120 && p.hitAt - now > 6) {
          if (set.rageArt && inRage(b) && rng() < S.guard * 0.25 && go(set.rageArt)) return;
          if (set.heatBurst && b.heat === 'ready' && rng() < S.guard * 0.12 && go(set.heatBurst)) return;
        }
        const right = lv === 'low' ? 'crouch' : 'stand';
        const wrong = right === 'crouch' ? 'stand' : 'crouch';
        b.guard = rng() < S.guard ? right : rng() < 0.5 ? wrong : 'stand';
        b.crouching = b.guard === 'crouch';
      }
      return;
    }
    if (now < this.botNext) {
      b.x -= b.walking === 1 ? WALK_F : b.walking === -1 ? -WALK_B : 0;
      return;
    }
    this.botNext = now + 6 + Math.floor(rng() * 10);
    b.crouching = false;
    b.guard = 'stand';
    b.walking = 0;

    const adv = this.botAdv.until >= now ? this.botAdv.adv : 0;
    const poke = Math.max(...set.pokes.map(moveRange), 100);
    // 5. minus: respect the opponent's turn (block, or step back when very minus)
    if (adv <= -4) {
      if (adv <= -8 && rng() < 0.4) b.walking = -1;
      return;
    }
    // 6. Heat: spend it with a Heat Smash / Heat move, or start it with a Heat Burst at close range
    if (b.heat === 'active' && dist < 140 && rng() < 0.25 && go(set.heatMoves[0] && rng() < 0.6 ? set.heatMoves[0] : this.pick(set.heatMoves))) return;
    if (b.heat === 'ready' && set.heatBurst && dist < 120 && rng() < (adv > 0 ? 0.12 : 0.03) && go(set.heatBurst)) return;
    // 7. plus or close: a read-based mixup on what the player tends to do
    if (adv > 0 || (dist < poke + 10 && rng() < S.aggression)) {
      const standRate = this.habits.stand / (this.habits.stand + this.habits.crouch);
      const mashRate = this.habits.mash / (this.habits.mash + this.habits.patient);
      const r = rng();
      let pool: Move[];
      if (adv > 0 && mashRate > 0.55 && r < 0.4) pool = set.fast; // they press after blocking: beat it with a fast poke
      else if (r < standRate * 0.45) pool = set.lows; // they stand a lot: go low
      else if (r < 0.62) pool = set.pokes.concat(set.strings.filter((m) => (m.startupFrame ?? 99) <= 14));
      else if (r < 0.86) pool = set.signature.concat(set.launchers); // mids that launch / big reward
      else pool = dist < 95 && standRate > 0.5 ? set.throws : set.pokes;
      if (go(this.pick(pool.length ? pool : set.pokes))) return;
    }
    // 8. neutral spacing: stay just outside the opponent's poke range, step in to attack
    const ideal = poke + 15;
    if (dist > ideal + 60) {
      if (set.running.length && dist < 280 && rng() < S.aggression * 0.3 && go(this.pick(set.running))) return;
      b.walking = 1;
    } else if (dist > ideal) b.walking = rng() < 0.7 ? 1 : 0;
    else if (dist < ideal - 40) b.walking = rng() < 0.5 ? -1 : 0;
    else b.walking = rng() < 0.3 ? -1 : rng() < 0.5 ? 1 : 0;
    // whiff bait: sometimes step back right after the player attacks
    if (p.state === 'attack' && rng() < 0.3) b.walking = -1;
  }

  // ---------- attacks ----------

  private advanceAttack(a: Fighter, d: Fighter, now: number, ev: FightEvent[]) {
    if (a.state !== 'attack' || !a.move) return;
    const toward = a.side === 0 ? 1 : -1;
    if (now < a.hitAt && a.lunge) a.x += a.lunge * toward;
    if (now !== a.hitAt || a.outcome !== 'pending') return;
    const m = a.move;
    const lv = moveLevel(m);
    const dist = Math.abs(d.x - a.x);
    const hitX = (a.x + d.x) / 2;
    const whiff = (why?: string) => {
      a.outcome = 'whiff';
      ev.push({ type: 'whiff', by: a.side, level: lv, text: why });
    };
    if (dist > moveRange(m)) return whiff();
    if (d.state === 'down' || d.state === 'ko' || d.state === 'thrown' || d.state === 'throwing') return whiff();

    // crush properties of the defender's own move
    if (d.state === 'attack' && d.move) {
      const t = now - d.moveStart + 1;
      // Rage Arts and Heat Bursts absorb hits during startup (power-crush-like)
      if (/Rage Art|Heat Burst/.test(d.move.notes) && now < d.hitAt && lv !== 'low' && lv !== 'throw') {
        a.outcome = 'hit';
        this.damage(a, d, Math.round(moveDamage(m) * 0.5), now, false);
        ev.push({ type: 'crush', by: d.side, x: hitX, text: `${d.move.id} absorbs the hit` });
        return;
      }
      for (const c of crushRanges(d.move)) {
        if (t < c.from || t > c.to) continue;
        if ((c.kind === 'cs' && lv === 'high') || (c.kind === 'js' && lv === 'low')) {
          ev.push({ type: 'crush', by: d.side, x: hitX, text: `${d.move.id} ${c.kind === 'cs' ? 'ducks under the high' : 'jumps over the low'}` });
          return whiff(c.kind === 'cs' ? 'crushed (crouch status)' : 'crushed (jump status)');
        }
        if (c.kind === 'pc' && lv !== 'low' && lv !== 'throw') {
          a.outcome = 'hit';
          this.damage(a, d, Math.round(moveDamage(m) * 0.5), now);
          ev.push({ type: 'crush', by: d.side, x: hitX, text: `${d.move.id} power crushes through` });
          return;
        }
      }
    }

    if (lv === 'throw') {
      if (d.state === 'air' || d.crouching || d.state === 'hitstun' || d.state === 'blockstun') return whiff(d.crouching ? 'ducked the throw' : undefined);
      a.state = 'throwing';
      a.outcome = 'hit';
      d.state = 'thrown';
      d.throwBreak = throwBreakOf(m);
      const w = this.cfg.throwBreakWindow ?? 20;
      a.until = d.until = now + w;
      ev.push({ type: 'throw', by: a.side, x: hitX, text: `Throw! Break with ${d.throwBreak === 'either' ? '1 or 2' : d.throwBreak}` });
      return;
    }
    if (lv === 'high' && d.crouching && d.state !== 'air') return whiff('ducked');
    if (a.side === 1 && !d.crouching) this.habits.stand++;
    else if (a.side === 1) this.habits.crouch++;

    const juggle = d.state === 'air';
    const stunned = d.state === 'hitstun';
    const canGuard = !juggle && !stunned && (d.state === 'neutral' || d.state === 'blockstun') && d.walking !== 1;
    const blocks = canGuard && ((lv === 'low' && d.guard === 'crouch') || ((lv === 'mid' || lv === 'high') && d.guard === 'stand'));
    const attackerEnd = a.hitAt + 1 + (recoveryFrames(m) ?? 20);

    if (blocks) {
      a.outcome = 'block';
      d.state = 'blockstun';
      d.until = attackerEnd + (m.blockFrame ?? -2);
      d.crouching = d.guard === 'crouch';
      const chip = /(\d+) chip damage/.exec(m.notes);
      if (chip) this.damage(a, d, Number(chip[1]), now, false);
      this.push(a, d, 12);
      if (a.side === 1) {
        this.botAdv = { adv: m.blockFrame ?? 0, until: attackerEnd + 20 };
      }
      ev.push({ type: 'block', by: a.side, x: hitX, level: lv });
      return;
    }

    const counter = !juggle && !stunned && d.state === 'attack' && now < d.hitAt;
    const res = parseOnHit(counter && m.ch ? m.ch : m.hit);
    let dmg = moveDamage(m);
    if (juggle) dmg = Math.max(1, Math.round(dmg * Math.max(0.3, 0.7 - 0.08 * d.combo.hits)));
    a.outcome = counter ? 'counter' : 'hit';
    this.damage(a, d, dmg, now);
    if (/Heat Engager/.test(m.notes) && a.heat === 'ready') this.startHeat(a, now);
    if (a.side === 1) this.botAdv = { adv: res.launch ? 30 : res.adv, until: attackerEnd + 20 };
    d.move = null;
    d.queued = null;
    if (juggle) {
      const left = Math.max(10, d.air!.t0 + d.air!.dur - now);
      d.air = { t0: now, dur: d.combo.hits > 7 ? 16 : Math.max(22, Math.min(36, left + 14)), h: 46 };
      d.until = now + d.air.dur;
      this.push(a, d, 10);
    } else if (res.launch) {
      d.state = 'air';
      d.air = { t0: now, dur: 58, h: 100 };
      d.until = now + 58;
      this.push(a, d, 6);
      ev.push({ type: 'launch', by: a.side, x: hitX });
    } else if (res.knockdown) {
      d.state = 'air';
      d.air = { t0: now, dur: 26, h: 40 };
      d.until = now + 26;
      this.push(a, d, 30);
    } else {
      d.state = 'hitstun';
      d.until = Math.max(now + 4, attackerEnd + res.adv);
      d.crouching = false;
      this.push(a, d, 16);
    }
    ev.push({ type: counter ? 'counter' : 'hit', by: a.side, x: hitX, level: lv, damage: dmg, text: counter ? 'COUNTER HIT' : undefined });
  }

  private damage(a: Fighter, d: Fighter, dmg: number, now: number, combo = true) {
    d.hp = Math.max(0, d.hp - dmg);
    d.lastHit = now;
    a.dealt += dmg;
    if (combo) {
      d.combo = { hits: d.combo.hits + 1, damage: d.combo.damage + dmg };
    }
  }

  private push(a: Fighter, d: Fighter, px: number) {
    const dirAway = d.x > a.x ? 1 : -1;
    const nx = d.x + px * dirAway;
    if (nx < STAGE_MIN || nx > STAGE_MAX) a.x -= px * dirAway; // at the wall the attacker is pushed instead
    d.x = Math.max(STAGE_MIN, Math.min(STAGE_MAX, nx));
  }

  private resolveThrow(a: Fighter, d: Fighter, now: number, ev: FightEvent[], _input: Frame) {
    if (a.state !== 'throwing' || d.state !== 'thrown' || now < a.until - 0 || !a.move) return;
    const dmg = moveDamage(a.move);
    this.damage(a, d, dmg, now);
    d.state = 'down';
    d.until = now + 50;
    a.state = 'attack';
    a.outcome = 'hit';
    a.endAt = now + 30;
    this.push(a, d, 40);
    ev.push({ type: 'hit', by: a.side, x: d.x, level: 'throw', damage: dmg, text: 'THROW' });
  }

  private breakThrow(a: Fighter, d: Fighter, now: number, ev: FightEvent[]) {
    a.state = 'neutral';
    d.state = 'neutral';
    a.move = null;
    this.push(a, d, 40);
    ev.push({ type: 'break', by: d.side, x: (a.x + d.x) / 2, text: 'THROW BREAK' });
    void now;
  }

  private separate() {
    const [p, b] = this.f;
    p.x = Math.max(STAGE_MIN, Math.min(STAGE_MAX, p.x));
    b.x = Math.max(STAGE_MIN, Math.min(STAGE_MAX, b.x));
    if (b.x - p.x < MIN_GAP) {
      const mid = (p.x + b.x) / 2;
      p.x = mid - MIN_GAP / 2;
      b.x = mid + MIN_GAP / 2;
      if (p.x < STAGE_MIN) {
        p.x = STAGE_MIN;
        b.x = STAGE_MIN + MIN_GAP;
      }
      if (b.x > STAGE_MAX) {
        b.x = STAGE_MAX;
        p.x = STAGE_MAX - MIN_GAP;
      }
    }
  }

  /** Lift (px above the floor) of an airborne fighter at `now`. */
  liftOf(x: Fighter, now: number) {
    if (!x.air) return 0;
    const t = Math.min(1, Math.max(0, (now - x.air.t0) / x.air.dur));
    return Math.sin(Math.PI * t) * x.air.h;
  }

  /** For the HUD: the pressing direction of the player's current guard. */
  guardOf(dir: Dir) {
    return dir === 'd' || dir === 'db' ? 'crouch' : dir === 'n' || dir === 'b' ? 'stand' : 'none';
  }
}
