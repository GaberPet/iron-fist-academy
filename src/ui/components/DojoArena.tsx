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
const H = 420;

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
  const [finished, setFinished] = useState(false);
  const nextRoundAt = useRef<number | null>(null);
  const lastFrame = useRef<Frame | null>(null);
  const resultsRef = useRef<RoundResult[]>([]);

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
      nextRoundAt.current = null;
    }
    for (const e of engine.update(f)) {
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
      if (ctx) drawScene(ctx, engine, lastFrame.current, char.profile.color);
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

function figure(ctx: CanvasRenderingContext2D, x: number, ground: number, color: string, facing: 1 | -1, pose: { crouch?: boolean; guard?: boolean; strike?: 'high' | 'mid' | 'low' | 'throw' | null; lean?: number }) {
  const h = pose.crouch ? 100 : 150;
  const hipY = ground - (pose.crouch ? 42 : 70);
  const shoulderY = ground - h + 34;
  const lean = (pose.lean ?? 0) * facing;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 12;
  // legs
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - 22 * facing, ground);
  ctx.moveTo(x, hipY);
  if (pose.strike === 'low') ctx.lineTo(x + 95 * facing, ground - 8);
  else ctx.lineTo(x + 20 * facing, ground);
  ctx.stroke();
  // torso
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + lean, shoulderY);
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(x + lean, shoulderY - 24, 17, 0, Math.PI * 2);
  ctx.fill();
  // arms
  ctx.lineWidth = 10;
  ctx.beginPath();
  const sx = x + lean;
  if (pose.strike === 'high') {
    ctx.moveTo(sx, shoulderY + 4);
    ctx.lineTo(sx + 105 * facing, shoulderY - 18);
  } else if (pose.strike === 'mid') {
    ctx.moveTo(sx, shoulderY + 4);
    ctx.lineTo(sx + 105 * facing, shoulderY + 34);
  } else if (pose.strike === 'throw') {
    ctx.moveTo(sx, shoulderY + 4);
    ctx.lineTo(sx + 80 * facing, shoulderY + 6);
    ctx.moveTo(sx, shoulderY + 10);
    ctx.lineTo(sx + 80 * facing, shoulderY + 22);
  } else if (pose.guard) {
    ctx.moveTo(sx, shoulderY + 4);
    ctx.lineTo(sx + 26 * facing, shoulderY - 6);
    ctx.lineTo(sx + 14 * facing, shoulderY - 30);
  } else {
    ctx.moveTo(sx, shoulderY + 4);
    ctx.lineTo(sx + 24 * facing, shoulderY + 30);
    ctx.lineTo(sx + 36 * facing, shoulderY + 6);
  }
  ctx.stroke();
  ctx.restore();
}

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

function drawScene(ctx: CanvasRenderingContext2D, e: DrillEngine, f: Frame | null, playerColor: string) {
  const T = tokens();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.paper2);
  g.addColorStop(1, T.paper);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const ground = 300;
  ctx.fillStyle = T.rule;
  ctx.fillRect(0, ground, W, 4);
  ctx.fillStyle = T.rule;
  ctx.globalAlpha = 0.35;
  for (let x = 0; x < W; x += 60) ctx.fillRect(x, ground + 4, 1, 30);
  ctx.globalAlpha = 1;

  const frame = f?.frame ?? 0;
  const a = e.action;
  const tl = e.timeline;
  const dir = f?.dir ?? 'n';
  const crouch = isDownish(dir);
  const guard = dir === 'b' || dir === 'db';

  // player
  const pm = e.playerMove;
  const pStrike = pm && frame - pm.frame < 20 ? 'mid' : null;
  figure(ctx, 330, ground, playerColor, 1, { crouch, guard, strike: pStrike });
  // bot
  let botStrike: 'high' | 'mid' | 'low' | 'throw' | null = null;
  let lean = 0;
  if (a && tl) {
    const reachedImpact = frame >= tl.impact;
    const recovering = a.kind === 'whiff' ? frame >= tl.impact && frame < tl.impact + a.recovery : frame >= tl.impact && frame < tl.botActionable;
    if (frame >= tl.t0 && !reachedImpact) lean = -10;
    if (reachedImpact && frame < tl.impact + 8 && e.result?.outcome !== 'pressed-early') botStrike = a.level;
    if (recovering && !botStrike) lean = 12;
  }
  const botX = a?.kind === 'whiff' ? 720 : 560;
  figure(ctx, botX, ground, T.ink2, -1, { strike: botStrike, lean });

  // cue
  if (a && tl && frame >= tl.reveal && e.phase !== 'done') {
    const label = a.kind === 'throw' ? (a.throwBreak === 1 ? 'THROW · LEFT ARM' : a.throwBreak === 2 ? 'THROW · RIGHT ARM' : 'THROW · BOTH ARMS') : a.level.toUpperCase();
    const col = a.level === 'low' ? T.info : a.level === 'mid' ? T.warn : a.level === 'high' ? T.error : T.accent;
    ctx.fillStyle = col;
    ctx.font = `600 34px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, botX, 110);
    const y = a.level === 'high' ? ground - 150 : a.level === 'mid' ? ground - 100 : a.level === 'low' ? ground - 20 : ground - 110;
    ctx.beginPath();
    ctx.moveTo(botX - 70, y);
    ctx.lineTo(400, y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (a) {
    ctx.fillStyle = tokens().muted;
    ctx.font = `400 13px ${BODY}`;
    ctx.textAlign = 'right';
    ctx.fillText(a.kind === 'throw' ? 'Bot: generic throw' : `${a.label} · i${a.startup} · ${a.blockAdv >= 0 ? '+' : ''}${a.blockAdv} on block${a.kind === 'whiff' ? ` · whiff recovery ${a.recovery}f` : ''}`, W - 16, 72);
    ctx.textAlign = 'left';
    ctx.fillText(`You: ${crouch ? 'crouching' : guard ? 'standing guard' : dir === 'n' ? 'neutral (blocks highs/mids)' : 'moving'}`, 16, 72);
  }
  // result text
  if (e.result) {
    ctx.textAlign = 'center';
    ctx.font = `600 40px ${DISPLAY}`;
    ctx.fillStyle = e.result.success ? T.success : T.error;
    ctx.fillText(OUTCOME_TEXT[e.result.outcome], W / 2, 160);
  }
  drawFrameMeter(ctx, e, frame);
}

/** Tekken 8-style frame meter: bot row (startup/active/recovery) and player row. */
function drawFrameMeter(ctx: CanvasRenderingContext2D, e: DrillEngine, frame: number) {
  const T = tokens();
  const a = e.action;
  const tl = e.timeline;
  const x0 = 16;
  const y0 = 340;
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
