// Canvas front-end for the training simulation (core/sim.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrillId } from '../../types';
import { DrillEngine, OUTCOME_TEXT, type BotAction, type Outcome, type RoundResult } from '../../core/sim';
import { isDownish } from '../../core/notation';
import type { Difficulty } from '../../core/progress';
import type { Frame } from '../../core/recognizer';
import { useCaptureInput, useInputFrames, usePracticeTimer } from '../hooks';
import { useStore } from '../store';
import { inputManager } from '../../runtime/inputManager';
import { NotationView, DirGlyph } from './Notation';
import { InputLog } from './InputLog';
import { punishersFor } from '../../core/frames';
import { drawFighter, drawSpark, drawStage, lerpPose, POSES, type FighterLook, type Pose, type PoseName, type Spark } from './arenaRenderer';
import { firstHitLevel } from '../../core/frames';
import type { Move } from '../../types';

const firstHit = (m: Move) => { const l = firstHitLevel(m); return l === 'other' || l === 'unblockable' ? 'mid' : l; };

export const DRILLS: Record<DrillId, { title: string; desc: string; how: string }> = {
  'punish-standing': {
    title: 'Standing punishment',
    desc: 'The bot throws out real unsafe highs/mids from the frame data. Block, then punish inside the window.',
    how: 'Hold back (or neutral) to block. Input your punisher during blockstun; it comes out on the first possible frame.',
  },
  'punish-crouching': {
    title: 'Crouching punishment',
    desc: 'Unsafe lows. Crouch-block, then punish with while-standing / crouching moves.',
    how: 'Hold down-back to block, then use ws moves (release down and press) or your crouching punishers.',
  },
  'block-mixup': {
    title: 'Mid / low defence',
    desc: 'Mids and lows at random. The hit level is revealed a set time before impact (difficulty).',
    how: 'Stand (back or neutral) for mids, crouch (down-back) for lows. Don\'t press buttons.',
  },
  'throw-break': {
    title: 'Throw breaks',
    desc: 'Generic throws with an arm cue: left arm = break 1, right arm = break 2, both = 1+2.',
    how: 'Press the break after the grab connects, within the break window (Settings). Crouching ducks throws.',
  },
  'whiff-punish': {
    title: 'Whiff punishment',
    desc: 'The bot whiffs a real move (out of range). Punish during its recovery (recovery frames from the data).',
    how: 'Wait until the attack has finished, then press a fast, long-range move.',
  },
  'mixed-pressure': {
    title: 'Adaptive pressure',
    desc: 'Mix of unsafe moves, safe/plus moves, mids, lows and throws. The bot uses more of what you fail.',
    how: 'Punish what is punishable, block (don\'t press) after safe or plus moves, guard correctly, break throws.',
  },
};

const W = 960;
const H = 470;

interface Props {
  drill: DrillId;
  reps: number;
  difficulty: Difficulty;
  opponentIds?: string[];
  lessonId?: string;
  onDone?(rate: number, results: RoundResult[]): void;
}

export function DojoArena({ drill, reps, difficulty, opponentIds, lessonId, onDone }: Props) {
  const { char, opponents, settings, record } = useStore();
  useCaptureInput();
  usePracticeTimer();
  const canvas = useRef<HTMLCanvasElement>(null);
  // Fixed when the drill starts: characters that finish loading later must not reset a running session.
  const [opps] = useState(() => opponents.filter((o) => !opponentIds || opponentIds.includes(o.profile.id)));
  const engine = useMemo(
    () => new DrillEngine({ drill, player: char, opponents: opps, difficulty, throwBreakWindow: settings.throwBreakWindow, rng: Math.random, recognizer: settings.recognizer }),
    [drill, char, opps, difficulty, settings.throwBreakWindow, settings.recognizer],
  );
  const [results, setResults] = useState<RoundResult[]>([]);
  const [last, setLast] = useState<{ result: RoundResult; action: BotAction } | null>(null);
  const [current, setCurrent] = useState<BotAction | null>(null);
  const [yourMove, setYourMove] = useState<Move | null>(null);
  const [finished, setFinished] = useState(false);
  const nextRoundAt = useRef<number | null>(null);
  const lastFrame = useRef<Frame | null>(null);
  const resultsRef = useRef<RoundResult[]>([]);
  const anim = useRef<ArenaAnim>(newAnim());

  const poolEmpty = (() => {
    const p = engine.pools;
    if (drill === 'punish-standing') return p.unsafeHighMid.length === 0;
    if (drill === 'punish-crouching') return p.unsafeLow.length === 0;
    if (drill === 'block-mixup') return p.blockable.length === 0;
    if (drill === 'whiff-punish') return p.whiffable.length === 0;
    return false;
  })();

  useEffect(() => {
    setResults([]);
    resultsRef.current = [];
    setLast(null);
    setFinished(false);
    nextRoundAt.current = null;
  }, [engine]);

  useInputFrames((f) => {
    lastFrame.current = f;
    if (finished || poolEmpty) return;
    if (!engine.action || (engine.phase === 'done' && nextRoundAt.current !== null && f.frame >= nextRoundAt.current)) {
      if (resultsRef.current.length >= reps) return;
      engine.startRound(f.frame);
      setCurrent(engine.action);
      setYourMove(null);
      nextRoundAt.current = null;
    }
    for (const e of engine.update(f)) {
      if (e.type === 'player-move' && e.move) setYourMove(e.move);
      if (e.type === 'result' && e.result && e.action) {
        const r = e.result;
        const next = [...resultsRef.current, r];
        resultsRef.current = next;
        setResults(next);
        setLast({ result: r, action: e.action });
        record({ kind: 'drill', itemId: drill, success: r.success, lessonId, mode: difficulty, errorType: r.success ? undefined : r.outcome, detail: `${e.action.label}: ${r.detail}` });
        if (r.success && settings.rumble) inputManager.rumble(70, 0.5);
        nextRoundAt.current = f.frame + 75;
        if (next.length >= reps) {
          setFinished(true);
          onDone?.(next.filter((x) => x.success).length / next.length, next);
        }
      }
    }
  });

  // Render loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx) drawScene(ctx, engine, lastFrame.current, char.profile.color, anim.current);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, char.profile.color]);

  const ok = results.filter((r) => r.success).length;
  const byOutcome = results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {});

  if (poolEmpty) return <div className="notice warn">The selected opponents have no moves that fit this drill in the current frame data. Pick another opponent.</div>;

  return (
    <div className="stack">
      <div className="arena-wrap">
        <canvas ref={canvas} width={W} height={H} aria-label="Training simulation" />
        <div className="sim-banner">
          <span className="badge warn">SIMULATION · not Tekken 8's engine</span>
          <span className="badge">Round {Math.min(results.length + (finished ? 0 : 1), reps)} / {reps} · {ok} ✔</span>
        </div>
      </div>
      <DojoHud action={current} yourMove={yourMove} drill={drill} />
      {last ? (
        <div className={`result-banner ${last.result.success ? 'ok' : 'no'}`}>
          <div>
            <div>{last.result.success ? '✔' : '✖'} {OUTCOME_TEXT[last.result.outcome]}</div>
            <div className="small" style={{ fontWeight: 500 }}>{last.action.label} · {last.result.detail}</div>
            {last.result.tip && <div className="small" style={{ fontWeight: 500, color: 'var(--warn)' }}>{last.result.tip}</div>}
          </div>
        </div>
      ) : (
        <div className="result-banner wait">{finished ? 'Session complete.' : DRILLS[drill].how}</div>
      )}
      {finished && (
        <div className="card">
          <h3>Session result: {ok}/{results.length} ({Math.round((ok / Math.max(1, results.length)) * 100)}%)</h3>
          <div className="tag-list">
            {Object.entries(byOutcome).map(([o, n]) => (
              <span key={o} className={`badge ${results.find((r) => r.outcome === o)?.success ? 'good' : 'bad'}`}>{OUTCOME_TEXT[o as Outcome]} × {n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- drawing ----------

/** Theme colours for the canvas, read from the CSS tokens so the arena follows the site theme. */
let tokenCache: Record<string, string> | null = null;
function tokens() {
  if (tokenCache) return tokenCache;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  tokenCache = {
    paper: v('--color-paper', '#0d0f1a'), paper2: v('--color-paper-2', '#141827'), rule: v('--color-rule', '#2a3145'),
    ink: v('--color-ink', '#f2f3f8'), ink2: v('--color-ink-2', '#c9cfdd'), muted: v('--color-muted', '#9aa1b5'),
    accent: v('--color-accent', '#ffad00'), info: v('--color-info', '#5aa9ff'), warn: v('--color-warn', '#f2b33d'),
    error: v('--color-error', '#ff5d6c'), success: v('--color-success', '#3ccf8e'),
  };
  return tokenCache;
}
const DISPLAY = '"Teko Variable", "Teko", sans-serif';
const BODY = '"Metropolis", sans-serif';

/** Animation state kept between frames (poses blend towards their target). */
export interface ArenaAnim {
  player: Pose;
  bot: Pose;
  sparks: Spark[];
  lastResult: RoundResult | null;
  lastImpact: number;
  shake: number;
}

export const newAnim = (): ArenaAnim => ({ player: { ...POSES.idle }, bot: { ...POSES.idle }, sparks: [], lastResult: null, lastImpact: -1, shake: 0 });

const isKick = (id: string | undefined) => !!id && /[34](?![^+,]*[12])/.test(id.split(',')[0]);
const strikePose = (level: string, kick: boolean): PoseName =>
  level === 'throw' ? 'grab' : level === 'low' ? 'kickLow' : kick ? 'kickMid' : level === 'high' ? 'punchHigh' : 'punchMid';

function drawScene(ctx: CanvasRenderingContext2D, e: DrillEngine, f: Frame | null, playerColor: string, anim: ArenaAnim) {
  const T = tokens();
  const ground = 318;
  const frame = f?.frame ?? 0;
  const a = e.action;
  const tl = e.timeline;
  const dir = f?.dir ?? 'n';
  const crouch = isDownish(dir);
  const guard = dir === 'b' || dir === 'db';
  const res = e.result;
  const botX = a?.kind === 'whiff' ? 700 : 590;
  const playerX = 360;

  ctx.save();
  if (anim.shake > 0) {
    ctx.translate((Math.random() - 0.5) * anim.shake, (Math.random() - 0.5) * anim.shake);
    anim.shake *= 0.8;
    if (anim.shake < 0.5) anim.shake = 0;
  }
  drawStage(ctx, W, H, ground);

  // ----- choose target poses -----
  const playerHit = res && ['got-hit', 'pressed-early', 'thrown', 'pressed-into-safe'].includes(res.outcome);
  const botHit = res && ['punished', 'whiff-punished'].includes(res.outcome);
  let pTarget: PoseName = crouch ? (guard ? 'crouchGuard' : 'crouch') : guard ? 'guard' : 'idle';
  const pm = e.playerMove;
  if (pm) {
    const since = frame - pm.frame;
    const s = pm.move.startupFrame ?? 12;
    if (since >= 0 && since < s) pTarget = 'windup';
    else if (since >= s && since < s + 10) pTarget = strikePose(firstHit(pm.move), isKick(pm.move.id));
  }
  if (playerHit && tl && frame - tl.impact < 30) pTarget = 'hit';

  let bTarget: PoseName = 'idle';
  if (a && tl) {
    if (frame >= tl.t0 && frame < tl.impact) bTarget = 'windup';
    else if (frame >= tl.impact && frame < tl.impact + 10 && res?.outcome !== 'pressed-early') bTarget = strikePose(a.level, isKick(a.move?.id));
    else if (frame >= tl.impact && (a.kind === 'whiff' ? frame < tl.impact + a.recovery : frame < tl.botActionable)) bTarget = 'recover';
  }
  if (botHit && pm && frame - pm.frame < 40) bTarget = 'hit';

  const k = 0.35;
  anim.player = lerpPose(anim.player, POSES[pTarget], k);
  anim.bot = lerpPose(anim.bot, POSES[bTarget], k);
  const bob = Math.sin(performance.now() / 260) * 2;
  const pPose = { ...anim.player, hipDrop: anim.player.hipDrop + (pTarget === 'idle' || pTarget === 'guard' ? bob : 0) };
  const bPose = { ...anim.bot, hipDrop: anim.bot.hipDrop + (bTarget === 'idle' ? -bob : 0) };

  const botLook: FighterLook = { skin: '#8d5b3e', hair: '#141014', top: '#3c4250', pants: '#22252c', shoes: '#e8e8ec', gloves: '#2b6fd6', belt: '#9aa0aa' };
  const playerLook: FighterLook = { skin: '#d9a07c', hair: '#2a1a12', top: playerColor, pants: '#1c1c26', shoes: '#141418', gloves: '#c8282c', belt: '#ffad00' };
  const bot = drawFighter(ctx, botX, ground, -1, bPose, botLook, 1.2);
  const player = drawFighter(ctx, playerX, ground, 1, pPose, playerLook, 1.2);

  // ----- effects -----
  if (tl && frame === tl.impact && anim.lastImpact !== tl.impact) {
    anim.lastImpact = tl.impact;
    const y = a?.level === 'high' ? ground - 165 : a?.level === 'low' ? ground - 30 : ground - 115;
    if (a?.kind === 'throw') anim.sparks.push({ x: playerX + 30, y: ground - 130, age: 0, kind: 'grab' });
    else if (a?.kind !== 'whiff') anim.sparks.push({ x: playerX + 34, y, age: 0, kind: e.blocked ? 'block' : 'hit' });
  }
  if (res && res !== anim.lastResult) {
    anim.lastResult = res;
    if (playerHit) anim.shake = 10;
    if (botHit) {
      anim.sparks.push({ x: bot.head[0] - 10, y: bot.head[1] + 50, age: 0, kind: 'hit' });
      anim.shake = 12;
    }
    if (res.outcome === 'broke-throw') anim.sparks.push({ x: (playerX + botX) / 2, y: ground - 130, age: 0, kind: 'block' });
  }
  for (const sp of anim.sparks) {
    drawSpark(ctx, sp, { hit: T.accent, block: T.info, grab: T.ink });
    sp.age++;
  }
  anim.sparks = anim.sparks.filter((sp) => sp.age < 18);
  void player;

  // cue
  if (a && tl && frame >= tl.reveal && e.phase !== 'done') {
    const label = a.kind === 'throw' ? (a.throwBreak === 1 ? 'THROW, LEFT ARM' : a.throwBreak === 2 ? 'THROW, RIGHT ARM' : 'THROW, BOTH ARMS') : a.level.toUpperCase();
    const col = a.level === 'low' ? T.info : a.level === 'mid' ? T.warn : a.level === 'high' ? T.error : T.accent;
    ctx.fillStyle = col;
    ctx.font = `600 34px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillText(label, botX, 92);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  // result text
  if (e.result) {
    ctx.textAlign = 'center';
    ctx.font = `600 40px ${DISPLAY}`;
    ctx.fillStyle = e.result.success ? T.success : T.error;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;
    ctx.fillText(OUTCOME_TEXT[e.result.outcome], W / 2, 160);
    ctx.shadowBlur = 0;
  }
  drawFrameMeter(ctx, e, frame);
}

/** Tekken 8-style frame meter: bot row (startup/active/recovery) and player row. */
function drawFrameMeter(ctx: CanvasRenderingContext2D, e: DrillEngine, frame: number) {
  const T = tokens();
  const a = e.action;
  const tl = e.timeline;
  const x0 = 16;
  const y0 = 384;
  const cell = 9;
  const n = Math.floor((W - 32) / cell);
  ctx.font = `400 11px ${BODY}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = tokens().muted;
  ctx.fillText('FRAME METER (60 fps): green = startup · red = active · blue = recovery · yellow = blockstun · white = your move', x0, y0 - 8);
  if (!a || !tl) return;
  const start = tl.t0;
  const botActEnd = a.kind === 'whiff' ? tl.impact + a.recovery : tl.botActionable;
  for (let i = 0; i < n; i++) {
    const fr = start + i;
    // bot row
    let c = '#1b2030';
    if (fr < tl.impact) c = '#2fae6b';
    else if (fr === tl.impact) c = '#ff5d6c';
    else if (fr < botActEnd) c = '#3d7be0';
    if (fr > frame) c = shade(c);
    ctx.fillStyle = c;
    ctx.fillRect(x0 + i * cell, y0, cell - 1, 16);
    // player row
    let pc = '#1b2030';
    if (e.blocked && fr > tl.impact && fr < tl.playerActionable) pc = '#e0b23a';
    const pm = e.playerMove;
    if (pm && fr >= pm.frame && fr < pm.frame + (pm.move.startupFrame ?? 10)) pc = '#eef0f6';
    if (fr > frame) pc = shade(pc);
    ctx.fillStyle = pc;
    ctx.fillRect(x0 + i * cell, y0 + 20, cell - 1, 16);
  }
  ctx.fillStyle = T.ink2;
  ctx.fillText('BOT', x0 + n * cell - 26, y0 + 12);
  ctx.fillText('YOU', x0 + n * cell - 26, y0 + 32);
  if (e.blocked && (a.kind === 'punish' || a.kind === 'safe')) {
    const window = -a.blockAdv;
    ctx.fillStyle = window > 0 ? T.accent : T.muted;
    ctx.fillText(window > 0 ? `Punish window: ${window} frames after your blockstun` : `Bot is ${a.blockAdv >= 0 ? '+' : ''}${a.blockAdv}: not punishable`, x0, y0 + 56);
  }
}

function shade(hex: string) {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.25)`;
}

/** Commands shown the Combo Lab way: the bot's move, your answer and the right answer, as icons. */
function DojoHud({ action, yourMove, drill }: { action: BotAction | null; yourMove: Move | null; drill: DrillId }) {
  const { char } = useStore();
  if (!action) return null;
  const crouching = action.level === 'low';
  let answer: JSX.Element;
  if (action.kind === 'throw') {
    const btn = action.throwBreak === 12 ? '1+2' : String(action.throwBreak);
    answer = <><NotationView notation={btn} big /><div className="small dim">Break after the grab connects, or crouch to duck it.</div></>;
  } else if (action.kind === 'block') {
    answer = <><span className="notation big"><span className="nstep"><DirGlyph d={crouching ? 'db' : 'b'} hold /></span></span><div className="small dim">{crouching ? 'Crouch-block the low (hold down-back).' : 'Stand and block (hold back or neutral).'}</div></>;
  } else if (action.kind === 'safe') {
    answer = <><span className="notation big"><span className="nstep"><DirGlyph d="b" hold /></span></span><div className="small dim">{action.blockAdv >= 0 ? `It is +${action.blockAdv} on block: keep blocking, do not press.` : `Only ${action.blockAdv} on block: not punishable. Block or use your fastest move.`}</div></>;
  } else if (action.kind === 'whiff') {
    const opts = (char.whiffPunishers.length ? char.whiffPunishers : char.punishers.filter((p) => p.window <= -15).map((p) => p.moveId)).slice(0, 3);
    answer = <><span className="row">{opts.map((o) => <NotationView key={o} notation={o} />)}</span><div className="small dim">Wait for the whiff to end, then hit it during its {action.recovery}-frame recovery.</div></>;
  } else {
    const best = punishersFor(char.punishers, action.blockAdv, crouching ? 'crouching' : 'standing');
    answer = best.length
      ? <><span className="row">{best.map((b) => <NotationView key={b.moveId} notation={b.moveId} big />)}</span><div className="small dim">{`${-action.blockAdv}-frame window after ${crouching ? 'crouch-blocking' : 'blocking'}: punishes ${best[0].window}.`}</div></>
      : <div className="small dim">No listed punisher fits a {-action.blockAdv}-frame window for {char.profile.short}.</div>;
  }
  return (
    <div className="dojo-hud">
      <div className="card tight stack">
        <div className="section-label">Bot</div>
        {action.move ? <NotationView notation={action.move.id} big /> : <span className="dim">Generic throw</span>}
        <div className="small dim">{action.kind === 'throw' ? action.label : `${action.charName} ${action.move?.name ?? ''} · ${action.level} · i${action.startup} · ${action.blockAdv >= 0 ? '+' : ''}${action.blockAdv} on block`}</div>
      </div>
      <div className="card tight stack">
        <div className="section-label">You</div>
        {yourMove ? <NotationView notation={yourMove.id} big /> : <span className="dim">Nothing pressed yet</span>}
        {yourMove && <div className="small dim">{yourMove.name || yourMove.id} · {yourMove.startup || 'no startup data'}</div>}
      </div>
      <div className="card tight stack">
        <div className="section-label">{drill === 'block-mixup' || action.kind === 'block' ? 'Guard' : 'Answer'}</div>
        {answer}
      </div>
      <div className="card tight">
        <div className="section-label">Inputs</div>
        <InputLog rows={8} />
      </div>
    </div>
  );
}
