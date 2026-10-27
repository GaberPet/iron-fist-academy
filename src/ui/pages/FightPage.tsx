import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterData } from '../../types';
import type { Difficulty } from '../../core/progress';
import { FightEngine, MAX_HP, moveDamage, type Fighter, type FightEvent } from '../../core/fight';
import type { Frame } from '../../core/recognizer';
import { useCaptureInput, useInputFrames } from '../hooks';
import { useStore } from '../store';
import { inputManager } from '../../runtime/inputManager';
import { drawFighter, drawSpark, drawStage, lerpPose, POSES, type Pose, type PoseName, type Spark } from '../components/arenaRenderer';
import { lookFor } from '../components/fighterLooks';
import { NotationView } from '../components/Notation';
import { InputLog } from '../components/InputLog';

const W = 960;
const H = 470;
const GROUND = 400;
const DISPLAY = '"Teko Variable", "Teko", sans-serif';
const BODY = '"Metropolis", system-ui, sans-serif';

export function FightPage() {
  const { char, roster, opponents, ensureLoaded, settings, updateSettings } = useStore();
  const [oppId, setOppId] = useState<string>(() => pickRandom(roster.map((r) => r.id).filter((id) => id !== char.profile.id)));
  const [rounds, setRounds] = useState(2);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    ensureLoaded([oppId]).catch(() => undefined);
  }, [oppId, ensureLoaded]);
  const opp = opponents.find((o) => o.profile.id === oppId);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Free Fight</h1>
          <p>A full match against a bot that plays a real character: its own moves, damage, startup, block and hit advantage, launchers, crush frames, throws and its real punishers, all from the imported frame data. Health bars, a 60-second timer and rounds like a Tekken match. This is a <b>simulation</b>, not Tekken 8: range, movement, juggles and string timing are approximations, and sidesteps, Heat and Rage are not modelled.</p>
        </div>
      </div>
      <div className="card row">
        <label className="field">Opponent
          <select value={oppId} onChange={(e) => { setOppId(e.target.value); setRunning(false); }}>
            {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => { setOppId(pickRandom(roster.map((r) => r.id).filter((id) => id !== oppId))); setRunning(false); }}>Random</button>
        <label className="field">Bot level
          <div className="seg">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={settings.drillDifficulty === d ? 'on' : ''} onClick={() => { updateSettings({ drillDifficulty: d }); setRunning(false); }}>{d}</button>
            ))}
          </div>
        </label>
        <label className="field">Rounds to win
          <div className="seg">
            {[1, 2, 3].map((n) => <button key={n} className={rounds === n ? 'on' : ''} onClick={() => { setRounds(n); setRunning(false); }}>{n}</button>)}
          </div>
        </label>
        <span className="right" />
        <button className="btn primary" disabled={!opp} onClick={() => { setRun(run + 1); setRunning(true); }}>{!opp ? 'Loading…' : running ? 'Rematch' : 'Fight!'}</button>
      </div>
      <div className="notice info"><b>Controls:</b> forward / back walk, <b>neutral or back</b> blocks highs and mids, <b>down-back</b> blocks lows and ducks highs and throws. Buttons do {char.profile.name}'s real moves; press the next button during a move for its strings. Break throws with 1, 2 or 1+2.</div>
      {running && opp ? (
        <FightArena key={`${run}-${oppId}-${rounds}-${settings.drillDifficulty}`} me={char} opp={opp} rounds={rounds} difficulty={settings.drillDifficulty} />
      ) : (
        <div className="empty">{char.profile.name} vs {opp?.profile.name ?? '…'}. Press <b>Fight!</b></div>
      )}
    </div>
  );
}

function pickRandom(ids: string[]) {
  return ids[Math.floor(Math.random() * ids.length)] ?? 'anna';
}

interface Anim {
  pose: [Pose, Pose];
  shown: [number, number]; // displayed health (drains smoothly)
  trail: [number, number]; // red damage trail
  sparks: Spark[];
  shake: number;
  popups: { text: string; x: number; y: number; age: number; color: string }[];
}

function FightArena({ me, opp, rounds, difficulty }: { me: CharacterData; opp: CharacterData; rounds: number; difficulty: Difficulty }) {
  const { settings } = useStore();
  useCaptureInput();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useMemo(
    () => new FightEngine({ player: me, bot: opp, difficulty, rng: Math.random, roundsToWin: rounds, throwBreakWindow: settings.throwBreakWindow, recognizer: settings.recognizer }),
    [me, opp, difficulty, rounds, settings.throwBreakWindow, settings.recognizer],
  );
  const anim = useRef<Anim>({ pose: [{ ...POSES.idle }, { ...POSES.idle }], shown: [MAX_HP, MAX_HP], trail: [MAX_HP, MAX_HP], sparks: [], shake: 0, popups: [] });
  const lastInput = useRef<Frame | null>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [myMove, setMyMove] = useState<string | null>(null);
  const [over, setOver] = useState<{ winner: 0 | 1 | null; dealt: [number, number] } | null>(null);

  useInputFrames((f) => {
    lastInput.current = f;
    const before = engine.f[0].move;
    const ev = engine.update(f);
    if (engine.f[0].move && engine.f[0].move !== before) setMyMove(engine.f[0].move.id);
    if (ev.length) handleEvents(ev);
  });

  function handleEvents(ev: FightEvent[]) {
    const a = anim.current;
    const lines: string[] = [];
    for (const e of ev) {
      const y = e.level === 'high' ? GROUND - 165 : e.level === 'low' ? GROUND - 35 : GROUND - 115;
      if ((e.type === 'hit' || e.type === 'counter') && e.x !== undefined) {
        a.sparks.push({ x: e.x, y, age: 0, kind: 'hit' });
        a.shake = e.type === 'counter' ? 12 : 6;
        if (e.text) a.popups.push({ text: e.text, x: e.x, y: y - 40, age: 0, color: e.type === 'counter' ? '#ff5d6c' : '#ffad00' });
        if (e.by === 0 && settings.rumble) inputManager.rumble(60, 0.5);
      }
      if (e.type === 'block' && e.x !== undefined) a.sparks.push({ x: e.x, y, age: 0, kind: 'block' });
      if (e.type === 'launch' && e.x !== undefined) a.popups.push({ text: 'LAUNCH', x: e.x, y: GROUND - 220, age: 0, color: '#5aa9ff' });
      if ((e.type === 'throw' || e.type === 'break') && e.x !== undefined) {
        a.sparks.push({ x: e.x, y: GROUND - 130, age: 0, kind: e.type === 'break' ? 'block' : 'grab' });
        a.popups.push({ text: e.type === 'break' ? 'THROW BREAK' : 'THROW', x: e.x, y: GROUND - 200, age: 0, color: '#f2f3f8' });
      }
      if (e.type === 'crush' && e.x !== undefined) a.popups.push({ text: 'CRUSH', x: e.x, y: GROUND - 200, age: 0, color: '#3ccf8e' });
      if (e.type === 'punish' && e.text) lines.push(e.text);
      if (e.type === 'counter') lines.push(`${e.by === 0 ? 'You' : opp.profile.short}: counter hit for ${e.damage}`);
      if (e.type === 'crush' && e.text) lines.push(e.text);
      if (e.type === 'throw' && e.text) lines.push(e.text);
      if (e.type === 'round-end') lines.push(e.by === 0 ? 'You take the round' : e.by === 1 ? `${opp.profile.short} takes the round` : 'Draw round');
      if (e.type === 'match-end') setOver({ winner: engine.winner, dealt: [engine.f[0].dealt, engine.f[1].dealt] });
    }
    if (lines.length) setFeed((f) => [...lines.reverse(), ...f].slice(0, 6));
  }

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx) drawFight(ctx, engine, anim.current, me, opp);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, me, opp]);

  const p = engine.f[0];
  const lastMove = myMove ? me.moveIndex.get(myMove) : null;
  return (
    <div className="stack">
      <div className="arena-wrap">
        <canvas ref={canvas} width={W} height={H} aria-label="Free fight" />
        <div className="sim-banner bottom">
          <span className="badge warn">SIMULATION · not Tekken 8's engine</span>
        </div>
      </div>
      {over && (
        <div className={`result-banner ${over.winner === 0 ? 'ok' : 'no'}`}>
          <div>
            <div>{over.winner === 0 ? `You beat ${opp.profile.name}` : over.winner === 1 ? `${opp.profile.name} wins` : 'Draw'} · rounds {engine.wins[0]}–{engine.wins[1]}</div>
            <div className="small" style={{ fontWeight: 500 }}>Damage dealt in the last round: you {over.dealt[0]}, {opp.profile.short} {over.dealt[1]}. Press Rematch to go again.</div>
          </div>
        </div>
      )}
      <div className="dojo-hud">
        <div className="card tight stack">
          <div className="section-label">Your last move</div>
          {lastMove ? <><NotationView notation={lastMove.id} big /><div className="small dim">{lastMove.name || lastMove.id} · i{lastMove.startupFrame ?? '?'} · {moveDamage(lastMove)} dmg · {lastMove.block || '?'} on block</div></> : <span className="dim">Nothing yet</span>}
        </div>
        <div className="card tight stack">
          <div className="section-label">{opp.profile.short}'s current move</div>
          <BotMove f={engine.f[1]} />
        </div>
        <div className="card tight stack">
          <div className="section-label">Fight log</div>
          {feed.length ? feed.map((l, i) => <div key={i} className={`small ${i ? 'dim' : ''}`}>{l}</div>) : <span className="dim small">Punishes, counter hits, crushes and throws show up here.</span>}
        </div>
        <div className="card tight">
          <div className="section-label">Inputs</div>
          <InputLog rows={8} />
        </div>
      </div>
      <span className="small muted">State: {p.state}{p.state === 'attack' && p.move ? ` (${p.move.id})` : ''}</span>
    </div>
  );
}

/** Re-renders a few times a second to show what the bot is doing. */
function BotMove({ f }: { f: Fighter }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 150);
    return () => clearInterval(t);
  }, []);
  if (f.state !== 'attack' || !f.move) return <span className="dim">{f.state === 'neutral' ? 'Waiting' : f.state}</span>;
  const m = f.move;
  return <><NotationView notation={m.id} big /><div className="small dim">{m.name || m.id} · i{m.startupFrame ?? '?'} · {m.hitLevels.join(',')} · {m.block || '?'} on block</div></>;
}

// ---------- drawing ----------

function poseFor(x: Fighter, now: number): { name: PoseName; lift: number; rot: number } {
  switch (x.state) {
    case 'attack': {
      const m = x.move;
      if (!m) return { name: 'idle', lift: 0, rot: 0 };
      if (now < x.hitAt - 2) return { name: 'windup', lift: 0, rot: 0 };
      if (now <= x.hitAt + 8) {
        const lv = m.hitLevels[0]?.toLowerCase() ?? 'm';
        const kick = /[34]/.test(m.id.split(',').pop() ?? '');
        return { name: m.isThrow ? 'grab' : lv.startsWith('l') ? 'kickLow' : kick ? 'kickMid' : lv.startsWith('h') ? 'punchHigh' : 'punchMid', lift: 0, rot: 0 };
      }
      return { name: 'recover', lift: 0, rot: 0 };
    }
    case 'blockstun': return { name: x.crouching ? 'crouchGuard' : 'block', lift: 0, rot: 0 };
    case 'hitstun': case 'thrown': return { name: 'hit', lift: 0, rot: 0 };
    case 'throwing': return { name: 'grab', lift: 0, rot: 0 };
    case 'air': return { name: 'air', lift: 0, rot: 70 };
    case 'down': return { name: 'down', lift: 0, rot: 90 };
    case 'ko': return { name: x.air ? 'air' : 'down', lift: 0, rot: x.air ? 75 : 90 };
    default:
      if (x.crouching) return { name: x.guard === 'crouch' ? 'crouchGuard' : 'crouch', lift: 0, rot: 0 };
      return { name: x.guard === 'stand' && x.walking !== 1 ? 'guard' : 'idle', lift: 0, rot: 0 };
  }
}

function drawFight(ctx: CanvasRenderingContext2D, e: FightEngine, a: Anim, me: CharacterData, opp: CharacterData) {
  const now = e.frame;
  ctx.save();
  if (a.shake > 0) {
    ctx.translate((Math.random() - 0.5) * a.shake, (Math.random() - 0.5) * a.shake);
    a.shake *= 0.82;
    if (a.shake < 0.5) a.shake = 0;
  }
  drawStage(ctx, W, H, GROUND);
  const looks = [lookFor(me.profile.id, me.profile.color, 'you'), lookFor(opp.profile.id, opp.profile.color, 'bot')];
  // draw the fighter who was hit last behind the other
  const order = e.f[0].lastHit > e.f[1].lastHit ? [0, 1] : [1, 0];
  for (const i of order) {
    const x = e.f[i];
    const target = poseFor(x, now);
    a.pose[i] = lerpPose(a.pose[i], POSES[target.name], x.state === 'attack' ? 0.5 : 0.3);
    const lift = x.state === 'air' || (x.state === 'ko' && x.air) ? e.liftOf(x, now) + 40 : x.state === 'down' || x.state === 'ko' ? -78 : 0;
    const flash = now - x.lastHit < 4;
    if (flash) ctx.filter = 'brightness(1.8)';
    drawFighter(ctx, x.x, GROUND, i === 0 ? 1 : -1, a.pose[i], looks[i], 1.15, { lift, rot: target.rot });
    ctx.filter = 'none';
  }
  for (const s of a.sparks) {
    drawSpark(ctx, s, { hit: '#ffad00', block: '#5aa9ff', grab: '#f2f3f8' });
    s.age++;
  }
  a.sparks = a.sparks.filter((s) => s.age < 18);
  for (const pu of a.popups) {
    ctx.globalAlpha = Math.max(0, 1 - pu.age / 50);
    ctx.font = `600 28px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = pu.color;
    ctx.fillText(pu.text, pu.x, pu.y - pu.age * 0.6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    pu.age++;
  }
  a.popups = a.popups.filter((p) => p.age < 50);
  ctx.restore();
  drawHud(ctx, e, a, me, opp);
}

function drawHud(ctx: CanvasRenderingContext2D, e: FightEngine, a: Anim, me: CharacterData, opp: CharacterData) {
  const barW = 380, barH = 18, top = 22;
  for (const i of [0, 1] as const) {
    const hp = e.f[i].hp;
    a.shown[i] += (hp - a.shown[i]) * 0.35;
    if (a.trail[i] > a.shown[i]) a.trail[i] -= 0.6;
    if (a.trail[i] < a.shown[i]) a.trail[i] = a.shown[i];
    const x0 = i === 0 ? W / 2 - 52 - barW : W / 2 + 52;
    // frame
    ctx.fillStyle = 'rgba(8,8,14,0.75)';
    ctx.fillRect(x0 - 3, top - 3, barW + 6, barH + 6);
    ctx.fillStyle = '#2a1015';
    ctx.fillRect(x0, top, barW, barH);
    // P1 drains towards the left edge, P2 towards the right edge (bars fill from the outside in)
    const wTrail = (a.trail[i] / MAX_HP) * barW, wHp = (a.shown[i] / MAX_HP) * barW;
    const fillFrom = (w: number) => (i === 0 ? x0 + barW - w : x0);
    ctx.fillStyle = '#ff5d6c';
    ctx.fillRect(fillFrom(wTrail), top, wTrail, barH);
    const low = hp / MAX_HP < 0.25;
    const g = ctx.createLinearGradient(0, top, 0, top + barH);
    g.addColorStop(0, low ? '#ffd27a' : '#ffe39a');
    g.addColorStop(0.5, low ? '#ff9a2a' : '#ffad00');
    g.addColorStop(1, low ? '#c4581a' : '#c47e00');
    ctx.fillStyle = g;
    ctx.fillRect(fillFrom(wHp), top, wHp, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(fillFrom(wHp), top + 2, wHp, 3);
    // name + round wins
    const c = i === 0 ? me : opp;
    ctx.font = `600 22px ${DISPLAY}`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#f2f3f8';
    ctx.fillText(`${c.profile.name.toUpperCase()}${i === 0 ? '  (YOU)' : ''}`, i === 0 ? x0 : x0 + barW, top + barH + 24);
    ctx.shadowBlur = 0;
    for (let r = 0; r < e.roundsToWin; r++) {
      const cx = i === 0 ? x0 + barW - 10 - r * 22 : x0 + 10 + r * 22;
      ctx.beginPath();
      ctx.arc(cx, top + barH + 16, 7, 0, Math.PI * 2);
      ctx.fillStyle = r < e.wins[i] ? '#ffad00' : 'rgba(8,8,14,0.7)';
      ctx.fill();
      ctx.strokeStyle = '#ffad00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // combo counter on the attacker's side
    const victim = e.f[i === 0 ? 1 : 0];
    if (victim.combo.hits >= 2) {
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const cx = i === 0 ? 24 : W - 24;
      ctx.font = `600 34px ${DISPLAY}`;
      ctx.fillStyle = '#ffad00';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillText(`${victim.combo.hits} HITS`, cx, 130);
      ctx.font = `500 18px ${BODY}`;
      ctx.fillStyle = '#f2f3f8';
      ctx.fillText(`${victim.combo.damage} DAMAGE`, cx, 152);
      ctx.shadowBlur = 0;
    }
  }
  // timer
  ctx.fillStyle = 'rgba(8,8,14,0.8)';
  ctx.fillRect(W / 2 - 40, top - 8, 80, 50);
  ctx.strokeStyle = '#ffad00';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 40, top - 8, 80, 50);
  ctx.font = `600 44px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = e.secondsLeft <= 10 && e.phase === 'fight' ? '#ff5d6c' : '#f2f3f8';
  ctx.fillText(String(Math.max(0, e.secondsLeft)), W / 2, top + 34);
  // banners
  if (e.banner && e.frame < e.banner.until) {
    ctx.font = `600 84px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = e.banner.text === 'YOU LOSE' || e.banner.text === 'K.O.' ? '#ff5d6c' : '#ffad00';
    ctx.fillText(e.banner.text, W / 2, 210);
    ctx.shadowBlur = 0;
  }
}
