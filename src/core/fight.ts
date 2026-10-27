// Free Fight: a full match against a character-driven bot, modelled on Tekken 8's systems.
//
// From each character's imported frame data: startup, damage, hit levels, block / hit /
// counter-hit advantage, recovery, launch / knockdown / tornado / spike / homing properties,
// crouch / jump / power-crush frames, throw breaks, Heat Engagers, Heat Dash, Heat-only
// moves, Heat Smash, Rage Art, "Removes Recoverable Health", chip damage, real punishers and
// real combo routes.
//
// From Tekken 8's documented rules (Wavu Wiki, Bandai Namco): 180 HP, recoverable health,
// Heat (900F gauge, Heat Burst costs 300F, once per round, chip on block), Rage at 45 HP or
// less (+10% damage, -70% chip taken, Rage Art i20 with armour from frame 8), air combo scaling
// 70/50/40/30% and x0.8 after a wall hit, grounded hits x0.8, throw break window 20F (14F on
// counter hit), generic throws broken with 1 or 2, tech roll window 10F (32F total).
//
// Approximations (NOT Tekken 8's engine): reach (no range data exists), movement speeds,
// tracking angles, juggle gravity, string timing between hits, recoverable health amounts.
// The UI says so.
import type { CharacterData, Dir, Move } from '../types';
import { firstHitLevel, punishersFor, recoveryFrames } from './frames';
import { checkPress, DEFAULT_OPTIONS, InputHistory, type Frame, type PressGroup, type RecognizerOptions } from './recognizer';
import { isDownish, parseNotation, type InputStep } from './notation';
import { MoveMatcher } from './sim';
import type { Rng } from './quiz';
import type { Difficulty } from './progress';
import { lookupMove } from '../data';

// ---------- Tekken 8 constants (documented) ----------
export const MAX_HP = 180;
export const ROUND_SECONDS = 60;
export const FPS = 60;
export const HEAT_FRAMES = 900; // full gauge (Heat Engager start)
export const HEAT_BURST_COST = 300; // Heat Burst start leaves 600F
export const RAGE_HP = 45;
export const AIR_SCALING = [0.7, 0.5, 0.4, 0.3];
export const WALL_SCALING = 0.8;
export const GROUND_SCALING = 0.8;
export const THROW_BREAK = 20;
export const THROW_BREAK_CH = 14;
export const TECH_WINDOW = 10;
export const TECH_ROLL = 32;

// ---------- simulation values (approximations, cm and cm/frame) ----------
export const ARENA = 620; // square arena half-size (walls at +-ARENA)
export const MIN_GAP = 72;
const WALK_F = 2.7;
const WALK_B = 2.2;
const DASH_FRAMES = 18;
const DASH_DIST = 120;
const BACKDASH_FRAMES = 24;
const BACKDASH_DIST = 95;
const STEP_FRAMES = 22;
const STEP_DIST = 85;
const JUMP_FRAMES = 40;
const GRAVITY = 0.42;
const LAUNCH_VY = 9.6;
const INTRO_FRAMES = 110;
const KO_FRAMES = 170;

export type Level = 'high' | 'mid' | 'low' | 'throw';
export type FighterState =
  | 'neutral' | 'attack' | 'blockstun' | 'hitstun' | 'air' | 'splat' | 'down' | 'techroll' | 'getup'
  | 'step' | 'dash' | 'backdash' | 'jump' | 'throwing' | 'thrown' | 'ko';

export interface Vec { x: number; z: number }
const v = (x: number, z: number): Vec => ({ x, z });
const add = (a: Vec, b: Vec, k = 1): Vec => v(a.x + b.x * k, a.z + b.z * k);
const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.z - b.z);
const len = (a: Vec) => Math.hypot(a.x, a.z);
const norm = (a: Vec): Vec => { const l = len(a) || 1; return v(a.x / l, a.z / l); };
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;

export interface Fighter {
  side: 0 | 1;
  char: CharacterData;
  pos: Vec;
  hp: number;
  /** Recoverable part of the lost health (shown white). Regained by attacking. */
  recov: number;
  state: FighterState;
  stateAt: number; // frame the state started
  until: number;
  crouching: boolean;
  guard: 'stand' | 'crouch' | 'none';
  walking: -1 | 0 | 1;
  move: Move | null;
  moveStart: number;
  hitAt: number;
  endAt: number;
  outcome: 'pending' | 'hit' | 'block' | 'whiff' | 'counter';
  aim: Vec | null; // attack direction, locked after tracking frames
  lunge: number;
  queued: Move | null;
  /** Airborne / juggle physics: height (cm) and vertical speed. */
  y: number;
  vy: number;
  airHits: number;
  tornadoUsed: boolean;
  wallHit: boolean;
  noTech: boolean;
  step: { dir: 1 | -1; ssr: boolean } | null; // dir: +1 = foreground
  combo: { hits: number; damage: number };
  lastHit: number;
  hitHeight: number;
  throwBreak: '1' | '2' | '1+2' | 'either' | null;
  breakLocked: boolean;
  dealt: number;
  heat: 'ready' | 'active' | 'used';
  heatLeft: number;
  rageUsed: boolean;
  /** For the renderer: frame of the last impact this fighter landed / blocked. */
  impactAt: number;
  /** Bot only: low parry attempt active until this frame. */
  parryUntil: number;
  facing: Vec;
}

export const inRage = (x: Fighter) => x.hp > 0 && x.hp <= RAGE_HP && !x.rageUsed;
export const heatShare = (x: Fighter) => (x.heat === 'ready' ? 1 : x.heat === 'active' ? x.heatLeft / HEAT_FRAMES : 0);

export interface FightEvent {
  type:
    | 'hit' | 'counter' | 'block' | 'whiff' | 'launch' | 'throw' | 'break' | 'ko' | 'round-start' | 'fight'
    | 'time-up' | 'round-end' | 'match-end' | 'punish' | 'crush' | 'heat' | 'heat-smash' | 'heat-dash' | 'rage'
    | 'rage-art' | 'tornado' | 'wall' | 'tech' | 'step-evade' | 'armor' | 'parry';
  by?: 0 | 1;
  at?: Vec;
  y?: number; // height of the impact (cm)
  level?: Level;
  damage?: number;
  text?: string;
  /** Attacker's frame advantage after this hit / block, from the data ("+8", "-12", "KND", "LAUNCH"). */
  adv?: string;
}

export interface FightConfig {
  player: CharacterData;
  bot: CharacterData;
  difficulty: Difficulty;
  rng: Rng;
  roundsToWin?: number;
  recognizer?: RecognizerOptions;
  /** Practice mode (like Tekken's training mode): a configurable dummy, health refills, no timer. */
  practice?: { dummy: DummyMode };
}

export type DummyMode = 'stand' | 'crouch' | 'random' | 'none' | 'fight';

// ---------- move helpers (exported for tests) ----------

export function moveDamage(m: Move): number {
  if (/Heat Burst/.test(m.notes)) return 12;
  return (m.damage.replace(/\([^)]*\)/g, '').match(/\d+/g) ?? []).reduce((s, d) => s + Number(d), 0);
}

export function moveLevel(m: Move): Level {
  if (m.isThrow) return 'throw';
  const l = firstHitLevel(m);
  return l === 'high' || l === 'low' || l === 'throw' ? l : 'mid';
}

const hitCode = (m: Move) => (m.hitLevels[0] ?? 'm').toLowerCase();
const lastPressButtons = (id: string) => (/([1-4](?:\+[1-4])*)[^1-4]*$/.exec(id)?.[1] ?? '');
const isRunning = (m: Move) => /f,F|f,f|WR|wr/.test(m.id);
export const isHoming = (m: Move) => /Homing|Tornado/.test(m.notes) && /Homing/.test(m.notes);

/** Estimated reach in cm (the data has no range): kicks reach further than punches, running moves lunge. */
export function moveRange(m: Move): number {
  if (m.isThrow) return 95;
  const b = lastPressButtons(m.id);
  let r = /[34]/.test(b) ? 130 : 112;
  if (isRunning(m)) r += 90;
  if (/^(b|db|ub)\+/.test(m.id)) r -= 8;
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
  if (/Heat Burst/.test(m.notes) && !out.some((c) => c.kind === 'pc')) out.push({ kind: 'pc', from: 7, to: 16 });
  return out;
}

export function throwBreakOf(m: Move): Fighter['throwBreak'] {
  const t = /Throw break ([12+ or]+)/i.exec(m.notes)?.[1]?.trim() ?? '';
  if (/1\+2/.test(t)) return '1+2';
  if (/1 or 2/.test(t)) return 'either';
  if (t === '1' || t === '2') return t;
  return /^f?\+?1\+3$/.test(m.id) ? 'either' : /^f?\+?2\+4$/.test(m.id) ? 'either' : 'either';
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

const STANCE_PREFIX = /^[A-Za-z]{1,5}\./;
const SIGNATURE = /Heat Engager|Power Crush|Homing|Tornado|Balcony Break/i;
const stripHR = (id: string) => id.replace(/^[HR]\./, '');
const consumesHeat = (m: Move) => Number(/Consumes (\d+)F of remaining Heat/i.exec(m.notes)?.[1] ?? 0);
const chipOf = (m: Move) => Number(/(\d+) chip damage/.exec(m.notes)?.[1] ?? 0);

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

// ---------- per-character move sets ----------

export interface MoveSet {
  roots: Move[];
  children: Map<string, Move[]>;
  childStep: Map<Move, InputStep>;
  pokes: Move[];
  lows: Move[];
  launchers: Move[];
  signature: Move[];
  strings: Move[];
  throws: Move[];
  fast: Move[];
  running: Move[];
  powerCrush: Move[];
  homing: Move[];
  groundHits: Move[];
  heatBurst: Move | null;
  heatMoves: Move[];
  heatSmash: Move | null;
  rageArt: Move | null;
  routes: Move[][];
  special: { move: Move; step: InputStep; kind: 'heat' | 'rage' }[];
}

export function moveSet(c: CharacterData): MoveSet {
  // moves that need a state the bot is not in (stances, while standing, back turned, sidestep) are left out
  const usable = (m: Move) =>
    m.startupFrame !== null && m.startupFrame > 0 && !STANCE_PREFIX.test(m.id) && !/\s/.test(m.id) &&
    (!m.id.includes('.') || /^[HR]\.[^.]*$/.test(m.id)) && !/^(ws|iws|FC|hFC|SS|SW|BT|OTG|wr|WR)/.test(m.id);
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
  const lv = (m: Move) => moveLevel(m);
  const sf = (m: Move) => m.startupFrame ?? 99;
  const normal = roots.filter((m) => !/^[HR]\./.test(m.id) && !/Heat Burst/.test(m.notes));
  const heatMoves = roots.filter((m) => m.id.startsWith('H.'));
  return {
    roots: normal,
    children,
    childStep,
    special,
    pokes: normal.filter((m) => !m.isThrow && lv(m) !== 'low' && sf(m) <= 15 && (m.blockFrame ?? -99) >= -6),
    lows: normal.filter((m) => lv(m) === 'low' && sf(m) <= 26),
    launchers: normal.filter((m) => !m.isThrow && /\d+a/.test(m.hit) && lv(m) !== 'high'),
    signature: normal.filter((m) => !m.isThrow && (SIGNATURE.test(m.notes) || c.profile.heatEngagers.includes(m.id) || c.profile.keyLaunchers.includes(m.id))),
    strings: normal.filter((m) => !m.isThrow && children.has(m.id)),
    throws: normal.filter((m) => m.isThrow && /^(f\+)?(1\+3|2\+4)$/.test(m.id)),
    fast: normal.filter((m) => !m.isThrow && lv(m) !== 'low' && sf(m) <= 13).sort((a, b) => sf(a) - sf(b)),
    running: normal.filter((m) => !m.isThrow && isRunning(m)),
    powerCrush: normal.filter((m) => crushRanges(m).some((r) => r.kind === 'pc')),
    homing: normal.filter((m) => /Homing/.test(m.notes) && sf(m) <= 20),
    groundHits: normal.filter((m) => (lv(m) === 'low' || /Spike/.test(m.notes)) && sf(m) <= 24),
    heatBurst: roots.find((m) => /Heat Burst/.test(m.notes)) ?? null,
    heatMoves,
    heatSmash: heatMoves.find((m) => /Heat Smash/.test(m.notes)) ?? null,
    rageArt: c.frames.moves.find((m) => m.id.startsWith('R.') && /Rage Art/.test(m.notes)) ?? null,
    routes: c.combos.map((x) => resolveRoute(c, x.route)).filter((r) => r.length >= 2 && r.every((m) => !m.id.startsWith('R.'))),
  };
}

// ---------- bot personality ----------

export interface BotSkill {
  react: number; // frames to react to an attack
  guard: number; // chance to pick the right guard once reacted
  punish: number; // chance to punish a punishable block
  aggression: number;
  breakThrow: number;
  combo: number; // chance to continue a string / juggle
  tech: number; // chance to tech roll
  step: number; // chance to sidestep a slow linear move
}

export const BOT_SKILL: Record<Difficulty, BotSkill> = {
  easy: { react: 26, guard: 0.35, punish: 0.3, aggression: 0.3, breakThrow: 0.2, combo: 0.45, tech: 0.25, step: 0.08 },
  normal: { react: 20, guard: 0.62, punish: 0.65, aggression: 0.42, breakThrow: 0.45, combo: 0.78, tech: 0.55, step: 0.2 },
  hard: { react: 15, guard: 0.86, punish: 0.92, aggression: 0.52, breakThrow: 0.7, combo: 0.95, tech: 0.85, step: 0.35 },
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
  winner: 0 | 1 | null = null;
  roundWinner: 0 | 1 | 'draw' | null = null;
  banner: { text: string; until: number } | null = null;
  /** Freeze frames (hit stop / Heat Burst flash). */
  freeze = 0;
  private group: PressGroup | null = null;
  private buffered: { move: Move; frame: number } | null = null;
  private pending: FightEvent[] = [];
  private started = false;
  private rageShown: [boolean, boolean] = [false, false];
  // bot memory
  private botNext = 0;
  private botGuardSet = -1;
  private botPlan: Move[] = [];
  private botBlocked: { adv: number; free: number; crouch: boolean } | null = null;
  private botAdv = { adv: 0, until: -1 };
  /** What the player tends to do, for the bot's reads. */
  habits = { stand: 1, crouch: 1, mash: 1, patient: 1, step: 1 };

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
  get secondsLeft() {
    return Math.ceil(this.timer / FPS);
  }
  /** Distance between the fighters (cm). */
  get distance() {
    return len(sub(this.f[1].pos, this.f[0].pos));
  }
  /** Unit vector from fighter i towards the other one. */
  forward(i: 0 | 1): Vec {
    const a = this.f[i].pos, b = this.f[1 - i].pos;
    return norm(sub(b, a));
  }
  /** Unit vector to the camera side ("foreground"), relative to the player -> bot axis. */
  get foreground(): Vec {
    const u = this.forward(0);
    return v(-u.z, u.x);
  }

  private newFighter(side: 0 | 1, char: CharacterData): Fighter {
    return {
      side, char, pos: v(side === 0 ? -150 : 150, 0), hp: MAX_HP, recov: 0, state: 'neutral', stateAt: 0, until: 0, crouching: false, guard: 'stand', walking: 0,
      move: null, moveStart: 0, hitAt: 0, endAt: 0, outcome: 'pending', aim: null, lunge: 0, queued: null, y: 0, vy: 0, airHits: 0, tornadoUsed: false, wallHit: false, noTech: false,
      step: null, combo: { hits: 0, damage: 0 }, lastHit: -999, hitHeight: 100, throwBreak: null, breakLocked: false, dealt: 0, heat: 'ready', heatLeft: 0, rageUsed: false, impactAt: -999, parryUntil: -1,
      facing: v(side === 0 ? 1 : -1, 0),
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
    const final = this.wins[0] === this.roundsToWin - 1 && this.wins[1] === this.roundsToWin - 1;
    this.banner = { text: final ? 'FINAL ROUND' : `ROUND ${this.round}`, until: at + 70 };
  }

  private setState(x: Fighter, s: FighterState, now: number, until = 0) {
    x.state = s;
    x.stateAt = now;
    x.until = until;
    if (s !== 'attack') {
      x.move = null;
      x.queued = null;
    }
    if (s !== 'step') x.step = null;
  }

  /** Advance one frame with the player's input. */
  update(input: Frame): FightEvent[] {
    const ev: FightEvent[] = [];
    this.frame = input.frame;
    this.history.push(input);
    const now = input.frame;
    const [p, b] = this.f;
    if (!this.started) {
      // the input clock does not start at 0: align the first round's intro with it
      this.started = true;
      this.phaseAt = now;
      if (this.banner) this.banner.until = now + 70;
    }
    if (this.phase === 'over') return ev;
    if (this.phase === 'intro') {
      if (now - this.phaseAt === 70) {
        this.banner = { text: 'FIGHT', until: now + 40 };
        ev.push({ type: 'fight' });
      }
      if (now - this.phaseAt >= INTRO_FRAMES) this.phase = 'fight';
      this.detectPress(input);
      this.face();
      return ev;
    }
    if (this.phase === 'ko') {
      this.tick(p, now, ev);
      this.tick(b, now, ev);
      this.physics(p, now, ev);
      this.physics(b, now, ev);
      if (now - this.phaseAt >= KO_FRAMES) this.afterRound(now, ev);
      return ev;
    }
    if (this.freeze > 0) {
      this.freeze--;
      this.detectPressKeep(input);
      return ev;
    }

    if (!this.cfg.practice) this.timer--;
    this.tick(p, now, ev);
    this.tick(b, now, ev);
    this.playerControl(input, ev);
    this.botControl(now, ev);
    this.move(p, now);
    this.move(b, now);
    this.advanceAttack(p, b, now, ev);
    this.advanceAttack(b, p, now, ev);
    this.resolveThrow(p, b, now, ev);
    this.resolveThrow(b, p, now, ev);
    this.physics(p, now, ev);
    this.physics(b, now, ev);
    this.separate();
    this.face();
    if (this.pending.length) {
      ev.push(...this.pending);
      this.pending = [];
    }
    if (this.cfg.practice) {
      for (const x of [p, b]) {
        if (x.hp <= 0) x.hp = 1;
        const idle = (x.state === 'neutral' || x.state === 'blockstun') && now - x.lastHit > 50;
        if (idle && x.hp < MAX_HP) {
          x.hp = MAX_HP;
          x.recov = 0;
        }
        if (x.heat === 'used' && now - x.lastHit > 50 && x.state === 'neutral') {
          x.heat = 'ready';
          x.heatLeft = 0;
        }
        if (x.rageUsed && x.hp === MAX_HP) x.rageUsed = false;
      }
    }
    for (const x of [p, b]) {
      if (inRage(x) && !this.rageShown[x.side]) {
        this.rageShown[x.side] = true;
        ev.push({ type: 'rage', by: x.side, text: `${x.char.profile.short}: RAGE` });
      }
      if (x.hp <= 0 && x.state !== 'ko') {
        x.hp = 0;
        x.recov = 0;
        const airborne = x.y > 0 || x.state === 'air';
        this.setState(x, 'ko', now);
        if (!airborne) x.vy = 5; // KO blow: knocked off the feet
      }
    }
    if (p.state === 'ko' || b.state === 'ko') {
      const w: 0 | 1 | 'draw' = p.state === 'ko' && b.state === 'ko' ? 'draw' : p.state === 'ko' ? 1 : 0;
      this.endRound(w, now, ev, 'K.O.');
    } else if (this.timer <= 0) {
      const w: 0 | 1 | 'draw' = p.hp === b.hp ? 'draw' : p.hp > b.hp ? 0 : 1;
      this.endRound(w, now, ev, 'TIME UP');
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
    const perfect = winner !== 'draw' && this.f[winner].hp === MAX_HP;
    this.banner = { text: winner === 'draw' ? (text === 'K.O.' ? 'DOUBLE K.O.' : 'DRAW') : perfect ? 'PERFECT' : text, until: now + 100 };
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

  private face() {
    for (const i of [0, 1] as const) {
      const x = this.f[i];
      // fighters turn to face each other, except mid-attack (they keep their aim) and while down
      if (x.state === 'attack' && x.aim) x.facing = x.aim;
      else if (x.state !== 'down' && x.state !== 'air' && x.state !== 'ko') x.facing = this.forward(i);
    }
  }

  // ---------- per-frame state timers ----------

  private tick(x: Fighter, now: number, ev: FightEvent[]) {
    if (x.heat === 'active') {
      x.heatLeft--;
      if (x.heatLeft <= 0) {
        x.heat = 'used';
        x.heatLeft = 0;
      }
    }
    if (x.side === 0 && this.botAdv.until === now && this.botAdv.adv >= 0 && x.state === 'neutral') this.habits.patient++;
    switch (x.state) {
      case 'blockstun':
      case 'hitstun':
        if (now >= x.until) {
          this.setState(x, 'neutral', now);
          x.combo = { hits: 0, damage: 0 };
        }
        break;
      case 'attack':
        if (now >= x.endAt) {
          if (x.queued) this.beginSegment(x, x.queued, now);
          else {
            const fc = /FC|crouch/i.test(x.move?.recovery ?? '');
            this.setState(x, 'neutral', now);
            x.crouching = fc;
          }
        }
        break;
      case 'splat':
        if (now >= x.until) {
          x.vy = 0;
          this.land(x, now, ev, false);
        }
        break;
      case 'down':
        // tech window handled by control; stay down at most 70F, then stand
        if (now - x.stateAt > 70) this.setState(x, 'getup', now, now + 26);
        break;
      case 'techroll':
      case 'getup':
        if (now >= x.until) {
          const wasTech = x.state === 'techroll';
          this.setState(x, 'neutral', now);
          x.crouching = wasTech;
          x.combo = { hits: 0, damage: 0 };
          x.airHits = 0;
          x.tornadoUsed = false;
          x.wallHit = false;
        }
        break;
      case 'step':
        if (now - x.stateAt >= STEP_FRAMES) this.setState(x, 'neutral', now);
        break;
      case 'dash':
        if (now - x.stateAt >= DASH_FRAMES) this.setState(x, 'neutral', now);
        break;
      case 'backdash':
        if (now - x.stateAt >= BACKDASH_FRAMES) this.setState(x, 'neutral', now);
        break;
      case 'jump':
        if (now - x.stateAt >= JUMP_FRAMES) {
          x.y = 0;
          this.setState(x, 'neutral', now);
        }
        break;
    }
  }

  // ---------- movement ----------

  private move(x: Fighter, now: number) {
    const fwd = this.forward(x.side);
    const fg = this.foreground;
    const t = now - x.stateAt;
    const ease = (n: number, total: number, dist: number) => (dist * 2 * (1 - n / total)) / total; // decelerating
    switch (x.state) {
      case 'neutral':
        if (x.walking === 1 && this.distance > MIN_GAP + 4) x.pos = add(x.pos, fwd, WALK_F);
        if (x.walking === -1) x.pos = add(x.pos, fwd, -WALK_B);
        break;
      case 'dash':
        if (this.distance > MIN_GAP + 4) x.pos = add(x.pos, fwd, ease(t, DASH_FRAMES, DASH_DIST));
        break;
      case 'backdash':
        x.pos = add(x.pos, fwd, -ease(t, BACKDASH_FRAMES, BACKDASH_DIST));
        break;
      case 'step':
        if (x.step) x.pos = add(x.pos, fg, x.step.dir * ease(t, STEP_FRAMES, STEP_DIST));
        break;
      case 'techroll':
        if (t < 20) x.pos = add(x.pos, fg, (x.step?.dir ?? 1) * 2.4);
        break;
      case 'jump':
        x.y = Math.max(0, Math.sin((Math.PI * t) / JUMP_FRAMES) * 70);
        break;
      case 'attack':
        if (now < x.hitAt && x.lunge) x.pos = add(x.pos, x.aim ?? fwd, x.lunge);
        break;
    }
  }

  /** Airborne physics, landing, wall splats. */
  private physics(x: Fighter, now: number, ev: FightEvent[]) {
    if (x.state !== 'air' && !(x.state === 'ko' && (x.y > 0 || x.vy > 0))) return;
    x.y += x.vy;
    x.vy -= GRAVITY;
    if (x.y <= 0 && x.vy < 0) {
      x.y = 0;
      x.vy = 0;
      if (x.state === 'ko') return;
      this.land(x, now, ev, x.noTech);
    }
  }

  private land(x: Fighter, now: number, _ev: FightEvent[], noTech: boolean) {
    x.y = 0;
    this.setState(x, 'down', now);
    x.noTech = noTech;
  }

  // ---------- attacks ----------

  canAct(x: Fighter) {
    return x.state === 'neutral' || x.state === 'step' || x.state === 'dash' || (x.state === 'backdash' && this.frame - x.stateAt > 10);
  }

  /** Can this fighter use the move right now (Heat / Rage requirements)? */
  allowed(x: Fighter, m: Move) {
    if (m.id.startsWith('H.')) return x.heat === 'active';
    if (m.id.startsWith('R.')) return inRage(x);
    if (/Heat Burst/.test(m.notes)) return x.heat === 'ready';
    return true;
  }

  startMove(x: Fighter, m: Move, now: number) {
    this.setState(x, 'attack', now);
    this.beginSegment(x, m, now, true);
    if (/Heat Burst/.test(m.notes) && x.heat === 'ready') {
      this.startHeat(x, HEAT_FRAMES - HEAT_BURST_COST, 'heat');
      this.freeze = 20; // activation flash (Tekken 8 has a longer time stop)
      this.regain(x, 3);
    }
    if (m.id.startsWith('H.')) {
      if (/Heat Smash/.test(m.notes)) {
        x.heat = 'used';
        x.heatLeft = 0;
        this.pending.push({ type: 'heat-smash', by: x.side, text: `${x.char.profile.short}: Heat Smash` });
      } else x.heatLeft = Math.max(1, x.heatLeft - consumesHeat(m));
    }
    if (m.id.startsWith('R.')) {
      x.rageUsed = true;
      this.freeze = 24;
      this.pending.push({ type: 'rage-art', by: x.side, text: `${x.char.profile.short}: RAGE ART` });
    }
  }

  private startHeat(x: Fighter, frames: number, kind: 'heat' | 'heat-engager') {
    x.heat = 'active';
    x.heatLeft = frames;
    this.pending.push({ type: 'heat', by: x.side, text: `${x.char.profile.short}: HEAT${kind === 'heat-engager' ? ' (Engager)' : ''}` });
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
    x.aim = this.forward(x.side);
    const range = moveRange(m);
    const need = Math.max(0, this.distance - range + 25);
    x.lunge = isRunning(m) || need > 0 ? Math.min(need, isRunning(m) ? 100 : 35) / Math.max(1, x.hitAt - now) : 0;
    if (m.isThrow) x.throwBreak = throwBreakOf(m);
  }

  /** Queue the next segment of a string if `m` follows the current move. */
  queueChild(x: Fighter, m: Move) {
    if (x.state !== 'attack' || !x.move || m.parent !== x.move.id || !this.allowed(x, m)) return false;
    x.queued = m;
    x.endAt = Math.min(x.endAt, Math.max(this.frame + 1, x.hitAt + 6));
    return true;
  }

  private advanceAttack(a: Fighter, d: Fighter, now: number, ev: FightEvent[]) {
    if (a.state !== 'attack' || !a.move) return;
    const m = a.move;
    // tracking: the attack keeps turning towards the opponent for its first frames (more for homing)
    const trackFrames = isHoming(m) ? 999 : (m.startupFrame ?? 12) <= 12 ? 8 : 4;
    if (now - a.moveStart < trackFrames) a.aim = this.forward(a.side);
    if (now !== a.hitAt || a.outcome !== 'pending') return;
    const lv = moveLevel(m);
    const toD = sub(d.pos, a.pos);
    const dist = len(toD);
    const mid = add(a.pos, toD, 0.5);
    const hitY = lv === 'high' ? 150 : lv === 'low' ? 35 : lv === 'throw' ? 120 : 105;
    const whiff = (why?: string) => {
      a.outcome = 'whiff';
      ev.push({ type: 'whiff', by: a.side, level: lv, text: why });
    };
    // angle check: did the defender step off the line of the attack?
    const off = Math.abs(dot(norm(toD), v(-(a.aim ?? toD).z, (a.aim ?? toD).x))) * dist; // lateral offset in cm
    const tol = isHoming(m) ? 999 : (m.startupFrame ?? 12) <= 12 ? 60 : 38;
    if (dist > moveRange(m) + 10 || off > tol) {
      if (d.state === 'step' && off > tol) ev.push({ type: 'step-evade', by: d.side, at: d.pos, text: 'SIDESTEP' });
      return whiff(off > tol ? 'sidestepped' : undefined);
    }
    if (d.state === 'step' && d.step) {
      const n = m.notes;
      if (/Whiffs vs SS(?![LR])/.test(n) || (d.step.ssr && /Whiffs vs SSR/.test(n)) || (!d.step.ssr && /Whiffs vs SSL/.test(n))) {
        ev.push({ type: 'step-evade', by: d.side, at: d.pos, text: 'SIDESTEP' });
        return whiff('sidestepped');
      }
    }
    if (d.state === 'ko' || d.state === 'thrown' || d.state === 'throwing' || d.state === 'getup') return whiff();
    if (d.state === 'techroll' && now - d.stateAt < 20) return whiff('tech roll');
    if (d.state === 'jump' && lv === 'low') return whiff('jumped');
    const grounded = d.state === 'down';
    if (grounded && !(lv === 'low' || /Spike/.test(m.notes))) return whiff('opponent is down');

    // crush / power crush / armour of the defender's own move
    if (d.state === 'attack' && d.move) {
      const t = now - d.moveStart + 1;
      const rageArt = /Rage Art/.test(d.move.notes);
      if (rageArt && t >= 8 && now < d.hitAt && lv !== 'throw') {
        const dmg = Math.floor(this.baseDamage(a, d, m) * 0.75);
        a.outcome = 'hit';
        this.hurt(a, d, dmg, now, { recoverable: true });
        ev.push({ type: 'armor', by: d.side, at: mid, y: hitY, text: 'Rage Art armour' });
        return;
      }
      for (const c of crushRanges(d.move)) {
        if (t < c.from || t > c.to) continue;
        if ((c.kind === 'cs' && lv === 'high') || (c.kind === 'js' && lv === 'low')) {
          ev.push({ type: 'crush', by: d.side, at: mid, y: hitY, text: `${d.move.id} ${c.kind === 'cs' ? 'ducks under the high' : 'jumps over the low'}` });
          return whiff(c.kind === 'cs' ? 'crushed (crouch status)' : 'crushed (jump status)');
        }
        if (c.kind === 'pc' && lv !== 'low' && lv !== 'throw' && !/Rage Art/.test(m.notes)) {
          a.outcome = 'hit';
          this.hurt(a, d, this.baseDamage(a, d, m), now, { recoverable: true });
          ev.push({ type: 'armor', by: d.side, at: mid, y: hitY, text: `${d.move.id} power crushes through` });
          return;
        }
      }
    }

    if (lv === 'throw') {
      if (d.state === 'air' || d.state === 'splat' || grounded || d.crouching || d.state === 'hitstun' || d.state === 'blockstun' || d.state === 'jump') return whiff(d.crouching ? 'ducked the throw' : undefined);
      const counter = d.state === 'attack';
      this.setState(a, 'throwing', now);
      a.move = m;
      a.outcome = 'hit';
      this.setState(d, 'thrown', now);
      d.throwBreak = throwBreakOf(m);
      d.breakLocked = false;
      a.until = d.until = now + (counter ? THROW_BREAK_CH : THROW_BREAK);
      ev.push({ type: 'throw', by: a.side, at: mid, y: hitY, text: `Throw! Break with ${d.throwBreak === 'either' ? '1 or 2' : d.throwBreak}` });
      return;
    }
    if (lv === 'high' && d.crouching && d.state !== 'air' && d.state !== 'splat') return whiff('ducked');
    if (a.side === 1) {
      if (d.crouching) this.habits.crouch++;
      else this.habits.stand++;
    }

    // universal low parry: a timed d/f against a low (not weapon lows) puts the attacker in a tornado state
    if (lv === 'low' && !/Weapon/.test(m.notes) && d.state === 'neutral' && this.lowParry(d, now)) {
      this.setState(a, 'air', now);
      a.y = 12;
      a.vy = 5.2;
      a.airHits = 0;
      a.tornadoUsed = true;
      a.wallHit = false;
      a.noTech = false;
      a.combo = { hits: 0, damage: 0 };
      this.freeze = 8;
      ev.push({ type: 'parry', by: d.side, at: mid, y: 40, text: 'LOW PARRY' });
      return;
    }
    const juggle = d.state === 'air' || d.state === 'splat';
    const stunned = d.state === 'hitstun';
    const canGuard = !juggle && !stunned && !grounded && (d.state === 'neutral' || d.state === 'blockstun' || d.state === 'backdash') && d.walking !== 1;
    const code = hitCode(m);
    const unblockable = /!$/.test(code);
    const blocks = canGuard && !unblockable && ((lv === 'low' && d.guard === 'crouch') || ((lv === 'mid' || lv === 'high') && d.guard === 'stand') || (code === 'sm' && d.guard !== 'none'));
    const attackerEnd = a.hitAt + 1 + (recoveryFrames(m) ?? 20);
    a.impactAt = now;

    if (blocks) {
      a.outcome = 'block';
      this.setState(d, 'blockstun', now, attackerEnd + (m.blockFrame ?? -2));
      d.crouching = d.guard === 'crouch';
      // chip: data value, or (in Heat) every attack chips; Rage takes 70% less chip
      let chip = chipOf(m) || (a.heat === 'active' ? Math.max(1, Math.floor(moveDamage(m) * 0.1)) : 0);
      if (inRage(d)) chip = Math.floor(chip * 0.3);
      if (chip) this.hurt(a, d, chip, now, { recoverable: true, combo: false, cantKo: true });
      this.regain(a, 1);
      if (a.heat === 'active') a.heatLeft -= Math.floor(moveDamage(m) / 2);
      if (/Heat Engager/.test(m.notes) && a.heat === 'active' && this.holdingForward(a)) this.heatDash(a, d, now, false, attackerEnd);
      this.push(a, d, 12, now, ev);
      if (a.side === 1) this.botAdv = { adv: m.blockFrame ?? 0, until: attackerEnd + 20 };
      ev.push({ type: 'block', by: a.side, at: mid, y: hitY, level: lv, adv: m.blockFrame === null ? undefined : `${m.blockFrame >= 0 ? '+' : ''}${m.blockFrame}` });
      return;
    }

    const counter = !juggle && !stunned && !grounded && d.state === 'attack';
    const res = parseOnHit(counter && m.ch ? m.ch : m.hit);
    const dmg = this.scaledDamage(a, d, m, { juggle, grounded });
    a.outcome = counter ? 'counter' : 'hit';
    this.hurt(a, d, dmg, now, { recoverable: juggle || grounded ? 0.5 : false, cantKo: /Heat Burst/.test(m.notes) });
    this.regain(a, Math.max(1, Math.floor(dmg * 0.25)) * (a.heat === 'active' ? 2 : 1));
    if (/Removes Recoverable Health/.test(m.notes)) d.recov = 0;
    if (a.heat === 'active') a.heatLeft -= 2 * dmg;
    if (d.heat === 'active') d.heatLeft -= dmg;
    if (/Heat Engager/.test(m.notes) && a.heat === 'ready') {
      this.startHeat(a, HEAT_FRAMES, 'heat-engager');
      this.regain(a, 30);
    }
    d.hitHeight = hitY;
    const tornado = /Tornado/.test(m.notes) && juggle && !d.tornadoUsed;
    const spike = /Spike/.test(m.notes) && juggle;

    if (/Heat Engager/.test(m.notes) && a.heat === 'active' && a.heatLeft < HEAT_FRAMES && this.holdingForward(a)) {
      this.heatDash(a, d, now, true, attackerEnd);
    } else if (juggle) {
      d.airHits++;
      if (spike) {
        d.vy = -9;
        d.noTech = true;
        this.setState(d, 'air', now);
      } else {
        const pop = (tornado ? 6.6 : res.launch ? 6.2 : 4.4) * Math.pow(0.92, d.airHits);
        d.vy = Math.max(d.vy, pop);
        if (d.state === 'splat') {
          d.until = Math.max(d.until, now + 16);
          d.vy = 0;
        } else this.setState(d, 'air', now);
      }
      if (tornado) {
        d.tornadoUsed = true;
        ev.push({ type: 'tornado', by: a.side, at: mid, y: hitY, text: 'TORNADO' });
      }
      this.push(a, d, tornado ? 55 : 14, now, ev);
    } else if (res.launch) {
      this.setState(d, 'air', now);
      d.y = Math.max(d.y, 10);
      d.vy = LAUNCH_VY;
      d.airHits = 0;
      d.tornadoUsed = false;
      d.wallHit = false;
      d.noTech = false;
      this.push(a, d, 8, now, ev);
      ev.push({ type: 'launch', by: a.side, at: mid, y: hitY });
    } else if (res.knockdown || grounded) {
      this.setState(d, 'air', now);
      d.y = Math.max(d.y, 5);
      d.vy = grounded ? 2.5 : 4;
      d.noTech = grounded;
      this.push(a, d, grounded ? 18 : 40, now, ev);
    } else {
      this.setState(d, 'hitstun', now, Math.max(now + 6, attackerEnd + res.adv));
      d.crouching = false;
      this.push(a, d, 18, now, ev);
    }
    if (a.side === 1) this.botAdv = { adv: res.launch ? 30 : res.adv, until: attackerEnd + 20 };
    this.freeze = Math.max(this.freeze, counter ? 5 : dmg >= 20 ? 4 : 2);
    const adv = juggle ? undefined : res.launch ? 'LAUNCH' : res.knockdown ? 'KND' : `${res.adv >= 0 ? '+' : ''}${res.adv}`;
    ev.push({ type: counter ? 'counter' : 'hit', by: a.side, at: mid, y: hitY, level: lv, damage: dmg, text: counter ? 'COUNTER HIT' : undefined, adv });
  }

  /** Low parry timing: d/f entered within the last 6 frames before the low connects. */
  private lowParry(d: Fighter, now: number) {
    if (d.side === 1) return now <= d.parryUntil;
    const segs = this.history.segments(now - 8);
    const last = segs[segs.length - 1];
    return !!last && last.dir === 'df' && now - last.start <= 6;
  }

  private holdingForward(x: Fighter) {
    if (x.side === 1) return this.cfg.rng() < 0.7; // the bot always tries
    const d = this.history.last?.dir;
    return d === 'f' || d === 'df' || d === 'uf';
  }

  /** Heat Dash: a Heat Engager in Heat while holding forward spends the gauge for a big advantage. */
  private heatDash(a: Fighter, d: Fighter, now: number, onHit: boolean, attackerEnd: number) {
    const m = a.move!;
    a.heat = 'used';
    a.heatLeft = 0;
    this.regain(a, onHit ? 6 : 3);
    const hd = /Heat Dash ([+-]?\d+)(a?)/.exec(m.notes);
    if (onHit && (hd?.[2] === 'a' || !hd)) {
      this.setState(d, 'air', now);
      d.vy = LAUNCH_VY * 0.9;
      d.airHits = 0;
      d.tornadoUsed = false;
    } else if (onHit) this.setState(d, 'hitstun', now, attackerEnd + Number(hd![1]));
    else this.setState(d, 'blockstun', now, attackerEnd + 5);
    a.endAt = Math.min(a.endAt, now + 14);
    a.pos = add(a.pos, this.forward(a.side), 40);
    this.pending.push({ type: 'heat-dash', by: a.side, text: `${a.char.profile.short}: Heat Dash` });
  }

  baseDamage(a: Fighter, _d: Fighter, m: Move) {
    let dmg = moveDamage(m);
    if (/Rage Art/.test(m.notes)) dmg = 55 + Math.floor(Math.max(0, RAGE_HP - a.hp) * 0.4); // stronger the lower your health
    else if (inRage(a)) dmg = Math.floor(dmg * 1.1);
    return dmg;
  }

  /** Tekken 8 combo scaling: air hits 70/50/40/30%, x0.8 after a wall hit, grounded hits x0.8. */
  scaledDamage(a: Fighter, d: Fighter, m: Move, o: { juggle: boolean; grounded: boolean }) {
    let s = 1;
    if (o.juggle) s *= AIR_SCALING[Math.min(d.airHits, AIR_SCALING.length - 1)];
    if (o.juggle && d.wallHit) s *= WALL_SCALING;
    if (o.grounded) s *= GROUND_SCALING;
    return Math.max(1, Math.floor(this.baseDamage(a, d, m) * s));
  }

  private hurt(a: Fighter, d: Fighter, dmg: number, now: number, o: { recoverable?: boolean | number; combo?: boolean; cantKo?: boolean } = {}) {
    const before = d.hp;
    d.hp = Math.max(o.cantKo ? Math.min(1, d.hp) : 0, d.hp - dmg);
    const lost = before - d.hp;
    const share = o.recoverable === true ? 1 : typeof o.recoverable === 'number' ? o.recoverable : 0;
    d.recov = Math.min(MAX_HP - d.hp, d.recov + Math.floor(lost * share));
    d.lastHit = now;
    a.dealt += lost;
    if (o.combo !== false) d.combo = { hits: d.combo.hits + 1, damage: d.combo.damage + lost };
  }

  /** Attacking restores recoverable health. */
  private regain(x: Fighter, n: number) {
    const k = Math.min(x.recov, n);
    x.recov -= k;
    x.hp += k;
  }

  private push(a: Fighter, d: Fighter, px: number, now: number, ev: FightEvent[]) {
    const dir = this.forward(a.side);
    const target = add(d.pos, dir, px);
    if (Math.abs(target.x) > ARENA || Math.abs(target.z) > ARENA) {
      // wall: clamp the defender; airborne / knocked-down defenders splat
      d.pos = v(Math.max(-ARENA, Math.min(ARENA, target.x)), Math.max(-ARENA, Math.min(ARENA, target.z)));
      a.pos = add(a.pos, dir, -Math.max(0, px - 6) * 0.6);
      if ((d.state === 'air' || d.state === 'hitstun') && px >= 14) {
        this.setState(d, 'splat', now, now + 34);
        d.y = Math.max(d.y, 55);
        d.vy = 0;
        d.wallHit = true;
        d.airHits++;
        ev.push({ type: 'wall', by: a.side, at: d.pos, y: d.y + 60, text: 'WALL SPLAT' });
      }
    } else d.pos = target;
  }

  private resolveThrow(a: Fighter, d: Fighter, now: number, ev: FightEvent[]) {
    if (a.state !== 'throwing' || d.state !== 'thrown' || now < a.until || !a.move) return;
    const m = a.move;
    const dmg = this.baseDamage(a, d, m);
    this.hurt(a, d, dmg, now);
    this.regain(a, 5);
    this.setState(d, 'down', now);
    d.noTech = true;
    this.setState(a, 'attack', now);
    a.move = m;
    a.outcome = 'hit';
    a.endAt = now + 30;
    a.hitAt = now - 1;
    this.push(a, d, 45, now, ev);
    ev.push({ type: 'hit', by: a.side, at: d.pos, y: 40, level: 'throw', damage: dmg, text: 'THROW' });
  }

  private tryBreak(a: Fighter, d: Fighter, mask: number, now: number, ev: FightEvent[]) {
    if (d.breakLocked) return;
    const want = d.throwBreak;
    const b1 = (mask & 0b0001) !== 0, b2 = (mask & 0b0010) !== 0;
    const ok = want === 'either' ? b1 !== b2 : want === '1+2' ? b1 && b2 : want === '1' ? b1 && !b2 : b2 && !b1;
    if (!ok) {
      d.breakLocked = true; // a wrong button locks you out
      return;
    }
    this.setState(a, 'neutral', now);
    this.setState(d, 'neutral', now);
    const dir = this.forward(a.side);
    a.pos = add(a.pos, dir, -30);
    d.pos = add(d.pos, dir, 30);
    ev.push({ type: 'break', by: d.side, at: add(a.pos, sub(d.pos, a.pos), 0.5), y: 120, text: 'THROW BREAK' });
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
  private detectPressKeep(input: Frame) {
    const fresh = this.history.newPresses();
    if (fresh && this.group) this.group.mask |= fresh;
    else if (fresh) this.group = { start: input.frame, mask: fresh, dirAtStart: input.dir };
  }

  /** Double taps and taps from the direction history: f,f dash, b,b backdash, u / d tap sidestep. */
  private motion(now: number): 'dash' | 'backdash' | 'ssl' | 'ssr' | 'jump' | null {
    const segs = this.history.segments(now - 24);
    const n = segs.length;
    const last = segs[n - 1];
    if (!last) return null;
    if (last.start === now && n >= 2) {
      const prev = segs[n - 2], prev2 = segs[n - 3];
      const held = prev.end - prev.start + 1;
      if (last.dir === 'n' && prev.dir === 'u' && held <= 8) return 'ssl';
      if (last.dir === 'n' && prev.dir === 'd' && held <= 7) return 'ssr';
      if (last.dir === 'f' && prev.dir === 'n' && prev2?.dir === 'f' && held <= 8) return 'dash';
      if (last.dir === 'b' && prev.dir === 'n' && prev2?.dir === 'b' && held <= 8) return 'backdash';
    }
    if (last.dir === 'u' && now - last.start === 9) return 'jump';
    return null;
  }

  private doMotion(x: Fighter, m: 'dash' | 'backdash' | 'ssl' | 'ssr' | 'jump', now: number) {
    if (m === 'dash') this.setState(x, 'dash', now);
    else if (m === 'backdash') this.setState(x, 'backdash', now);
    else if (m === 'jump') this.setState(x, 'jump', now);
    else {
      // up = background for both sides; SSL/SSR are relative to the stepping fighter's facing
      const up = m === 'ssl';
      this.setState(x, 'step', now);
      x.step = { dir: up ? -1 : 1, ssr: x.side === 0 ? !up : up };
      x.walking = 0;
    }
  }

  private playerControl(input: Frame, ev: FightEvent[]) {
    const p = this.f[0];
    const now = input.frame;
    const dir = input.dir;
    const group = this.detectPress(input);

    if (p.state === 'thrown') {
      if (group) this.tryBreak(this.f[1], p, group.mask, now, ev);
      return;
    }
    if (p.state === 'down') {
      const t = now - p.stateAt;
      if (group && t < TECH_WINDOW && !p.noTech) {
        this.setState(p, 'techroll', now, now + TECH_ROLL);
        p.step = { dir: group.mask & 0b0011 ? -1 : 1, ssr: false };
        ev.push({ type: 'tech', by: 0, at: p.pos, text: 'TECH ROLL' });
        return;
      }
      if (t >= TECH_WINDOW && dir !== 'n') {
        this.setState(p, 'getup', now, now + 26);
        if (dir === 'b' || dir === 'db' || dir === 'ub') p.pos = add(p.pos, this.forward(0), -60);
      }
      return;
    }
    if (group) {
      if (p.state === 'attack' && p.move) {
        for (const k of this.sets[0].children.get(p.move.id) ?? []) {
          const step = this.sets[0].childStep.get(k);
          if (step && checkPress({ ...step, motion: [] }, group, this.history, this.opts).ok && this.queueChild(p, k)) return;
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
      p.guard = p.state === 'blockstun' || p.state === 'getup' || p.state === 'techroll' ? (isDownish(dir) ? 'crouch' : 'stand') : 'none';
      if (p.state === 'blockstun') p.crouching = isDownish(dir);
      return;
    }
    const mo = this.motion(now);
    if (mo && (p.state === 'neutral' || (mo === 'backdash' && p.state === 'backdash'))) {
      this.doMotion(p, mo, now);
      if (mo === 'ssl' || mo === 'ssr') this.habits.step++;
      return;
    }
    if (p.state !== 'neutral') {
      // cancels: a step or dash into guard with b / d; a backdash only into a crouch (KBD-style)
      const t = now - p.stateAt;
      const cancel =
        p.state === 'backdash' ? (dir === 'd' || dir === 'db') && t > 10
        : dir === 'b' || dir === 'db' || dir === 'd';
      if (cancel) this.setState(p, 'neutral', now);
      else return;
    }
    p.crouching = isDownish(dir);
    p.guard = dir === 'd' || dir === 'db' ? 'crouch' : dir === 'n' || dir === 'b' || dir === 'ub' ? 'stand' : 'none';
    p.walking = p.crouching ? 0 : dir === 'f' || dir === 'uf' ? 1 : dir === 'b' || dir === 'ub' ? -1 : 0;
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
    const dist = this.distance;

    const dummy = this.cfg.practice?.dummy;
    if (dummy && dummy !== 'fight') {
      b.walking = 0;
      if (b.state === 'down' && now - b.stateAt === 2 && !b.noTech && rng() < 0.5) {
        this.setState(b, 'techroll', now, now + TECH_ROLL);
        b.step = { dir: rng() < 0.5 ? 1 : -1, ssr: false };
      }
      if (b.state !== 'neutral' && b.state !== 'blockstun') return;
      if (dummy === 'random' && b.state === 'neutral' && now % 40 === 0) b.guard = rng() < 0.5 ? 'stand' : 'crouch';
      else if (dummy !== 'random') b.guard = dummy === 'stand' ? 'stand' : dummy === 'crouch' ? 'crouch' : 'none';
      b.crouching = b.guard === 'crouch';
      return;
    }
    if (b.state === 'thrown') {
      if (b.until - now === THROW_BREAK - 9 && rng() < S.breakThrow) {
        const want = b.throwBreak;
        const mask = want === '1+2' ? 0b0011 : want === '2' ? 0b0010 : want === '1' ? 0b0001 : rng() < 0.5 ? 0b0001 : 0b0010;
        this.tryBreak(p, b, mask, now, ev);
      }
      return;
    }
    if (b.state === 'down') {
      const t = now - b.stateAt;
      if (t === 2 && !b.noTech && rng() < S.tech) {
        this.setState(b, 'techroll', now, now + TECH_ROLL);
        b.step = { dir: rng() < 0.5 ? 1 : -1, ssr: false };
        ev.push({ type: 'tech', by: 1, at: b.pos, text: 'TECH ROLL' });
      } else if (t === TECH_WINDOW + 4 + Math.floor(rng() * 20)) {
        this.setState(b, 'getup', now, now + 26);
        if (rng() < 0.5) b.pos = add(b.pos, this.forward(1), -60);
      }
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
        const choices = onHit ? kids : kids.filter((k) => (k.blockFrame ?? -99) >= -9);
        if (choices.length && rng() < (onHit ? S.combo : S.combo * 0.5)) this.queueChild(b, this.pick(choices)!);
      }
    }
    if (!this.canAct(b)) {
      if (b.state === 'blockstun') {
        b.guard = b.crouching ? 'crouch' : 'stand';
        if (p.state === 'attack' && p.move && p.move.blockFrame !== null) this.botBlocked = { adv: p.move.blockFrame, free: b.until, crouch: b.crouching };
      } else b.guard = b.state === 'getup' || b.state === 'techroll' ? 'stand' : 'none';
      b.walking = 0;
      return;
    }

    const go = (m: Move | null | undefined, plan: Move[] = [], reachCheck = false) => {
      if (!m || !this.allowed(b, m)) return false;
      if (reachCheck && (dist > moveRange(m) + (isRunning(m) ? 100 : 8) || (isRunning(m) && dist < 160))) return false;
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
    // 2. juggle: the character's real combo route (Heat Dash / Heat Smash when in Heat), else fast hits
    if ((p.state === 'air' || p.state === 'splat') && dist < 190) {
      const next = this.botPlan[0];
      if (next && !next.parent) {
        this.botPlan.shift();
        if (go(next, this.botPlan)) return;
      }
      if (rng() < S.combo) {
        if (p.state === 'splat' && b.heat === 'active' && set.heatSmash && rng() < 0.5 && go(set.heatSmash)) return;
        const route = this.pick(set.routes);
        if (route && p.airHits === 0 && go(route[0], route.slice(1))) return;
        if (go(this.pick(set.fast.slice(0, 6)) ?? this.pick(set.pokes))) return;
      }
    }
    this.botPlan = [];
    // 3. okizeme: hit a grounded opponent who did not tech
    if (p.state === 'down' && now - p.stateAt > TECH_WINDOW && dist < 170 && rng() < S.combo * 0.6 && go(this.pick(set.groundHits), [], true)) return;
    // 4. whiff punish
    if (p.state === 'attack' && p.outcome === 'whiff' && p.endAt - now > 12 && dist < 200 && rng() < S.punish * 0.7) {
      const reach = (m: Move) => dist <= moveRange(m) + (isRunning(m) ? 100 : 8);
      if (go(this.pick(set.launchers.filter((x) => (x.startupFrame ?? 99) <= 16 && reach(x))) ?? this.pick(set.pokes.filter(reach)), [], true)) return;
    }
    // 5. an attack is coming: guard (after reaction time), sidestep a slow linear move, or armour through
    if (p.state === 'attack' && p.move && now < p.hitAt) {
      b.walking = 0;
      if (this.botGuardSet !== p.moveStart && now - p.moveStart >= S.react) {
        this.botGuardSet = p.moveStart;
        const lv = moveLevel(p.move);
        const slow = (p.move.startupFrame ?? 0) >= 15 && !isHoming(p.move);
        if (slow && b.state === 'neutral' && rng() < S.step) return this.doMotion(b, rng() < 0.5 ? 'ssl' : 'ssr', now);
        if (lv !== 'low' && lv !== 'throw' && dist < 130 && p.hitAt - now > 6) {
          if (set.rageArt && inRage(b) && rng() < S.guard * 0.25 && go(set.rageArt)) return;
          if (set.heatBurst && b.heat === 'ready' && rng() < S.guard * 0.12 && go(set.heatBurst)) return;
          if (set.powerCrush.length && rng() < S.guard * 0.08 && go(this.pick(set.powerCrush))) return;
        }
        if (lv === 'throw' && rng() < S.guard * 0.5) {
          b.guard = 'crouch';
          b.crouching = true;
          return;
        }
        if (lv === 'low' && !/Weapon/.test(p.move.notes) && p.hitAt - now <= 10 && rng() < S.guard * 0.2) {
          b.parryUntil = p.hitAt;
          b.crouching = true;
          b.guard = 'crouch';
          return;
        }
        const right = lv === 'low' ? 'crouch' : 'stand';
        const wrong = right === 'crouch' ? 'stand' : 'crouch';
        b.guard = rng() < S.guard ? right : rng() < 0.5 ? wrong : 'stand';
        b.crouching = b.guard === 'crouch';
      }
      return;
    }
    if (now < this.botNext) return;
    this.botNext = now + 6 + Math.floor(rng() * 10);
    if (b.state !== 'neutral') return;
    b.crouching = false;
    b.guard = 'stand';
    b.walking = 0;

    const adv = this.botAdv.until >= now ? this.botAdv.adv : 0;
    const poke = Math.max(...set.pokes.map(moveRange), 110);
    // 6. minus: respect the opponent's turn (block, backdash, or sidestep their pressure)
    if (adv <= -4) {
      if (adv <= -8 && rng() < 0.35) this.doMotion(b, 'backdash', now);
      else if (rng() < S.step * 0.6) this.doMotion(b, rng() < 0.5 ? 'ssl' : 'ssr', now);
      return;
    }
    // 7. Heat: Heat Smash / Heat moves when in Heat, Heat Burst to start it
    if (b.heat === 'active' && dist < 150 && rng() < 0.22 && go(set.heatSmash && rng() < 0.55 ? set.heatSmash : this.pick(set.heatMoves))) return;
    if (b.heat === 'ready' && set.heatBurst && dist < 130 && rng() < (adv > 0 ? 0.1 : 0.025) && go(set.heatBurst)) return;
    // 8. plus or in range: a read-based mixup
    if (adv > 0 || (dist < poke + 10 && rng() < S.aggression)) {
      const standRate = this.habits.stand / (this.habits.stand + this.habits.crouch);
      const mashRate = this.habits.mash / (this.habits.mash + this.habits.patient);
      const stepRate = this.habits.step / (this.habits.step + this.habits.stand + this.habits.crouch);
      const r = rng();
      let pool: Move[];
      if (stepRate > 0.25 && r < 0.3) pool = set.homing; // they sidestep a lot: homing moves
      else if (adv > 0 && mashRate > 0.55 && r < 0.4) pool = set.fast;
      else if (r < standRate * 0.42) pool = set.lows;
      else if (r < 0.62) pool = set.pokes.concat(set.strings.filter((m) => (m.startupFrame ?? 99) <= 14));
      else if (r < 0.86) pool = set.signature.concat(set.launchers);
      else pool = dist < 100 && standRate > 0.5 ? set.throws : set.pokes;
      const inReach = (pool.length ? pool : set.pokes).filter((m) => !isRunning(m) && dist <= moveRange(m) + 8);
      if (go(this.pick(inReach), [], true)) return;
      b.walking = 1; // nothing reaches from here: step in
      return;
    }
    // 9. neutral: spacing (walk, dash in, backdash out), occasional sidestep
    const ideal = poke + 18;
    if (dist > ideal + 110 && rng() < 0.5) return this.doMotion(b, 'dash', now);
    if (dist > ideal + 60 && set.running.length && dist < 300 && rng() < S.aggression * 0.3 && go(this.pick(set.running))) return;
    if (dist > ideal) b.walking = rng() < 0.75 ? 1 : 0;
    else if (dist < ideal - 45) b.walking = rng() < 0.5 ? -1 : 0;
    else if (rng() < 0.12) return this.doMotion(b, rng() < 0.5 ? 'backdash' : rng() < 0.5 ? 'ssl' : 'ssr', now);
    else b.walking = rng() < 0.3 ? -1 : rng() < 0.4 ? 1 : 0;
  }

  private separate() {
    const [p, b] = this.f;
    for (const x of [p, b]) x.pos = v(Math.max(-ARENA, Math.min(ARENA, x.pos.x)), Math.max(-ARENA, Math.min(ARENA, x.pos.z)));
    const d = sub(b.pos, p.pos);
    const l = len(d);
    if (l < MIN_GAP && p.state !== 'down' && b.state !== 'down' && p.y < 40 && b.y < 40) {
      const n = norm(l ? d : v(1, 0));
      const fix = (MIN_GAP - l) / 2;
      p.pos = add(p.pos, n, -fix);
      b.pos = add(b.pos, n, fix);
    }
  }

  /** For the HUD: the pressing direction of the player's current guard. */
  guardOf(dir: Dir) {
    return dir === 'd' || dir === 'db' ? 'crouch' : dir === 'n' || dir === 'b' ? 'stand' : 'none';
  }
}
