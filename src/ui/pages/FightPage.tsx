import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterData } from '../../types';
import type { Difficulty } from '../../core/progress';
import { FightEngine, MAX_HP, type DummyMode, RAGE_HP, heatShare, inRage, moveDamage, type Fighter, type FightEvent } from '../../core/fight';
import { useCaptureInput, useInputFrames } from '../hooks';
import { useStore } from '../store';
import { inputManager } from '../../runtime/inputManager';
import { lookFor } from '../components/fighterLooks';
import { Arena3D } from '../three/arena3d';
import { DrillView } from '../three/dojo3d';
import { playEvents, playFall, setSfxMuted, sfxMuted, unlockAudio } from '../three/sfx';
import { NotationView } from '../components/Notation';
import { InputLog } from '../components/InputLog';

const DISPLAY = '"Montserrat", Arial, sans-serif';
const BODY = '"Source Sans 3", Arial, sans-serif';

export function FightPage() {
  const { char, roster, opponents, ensureLoaded, settings, updateSettings } = useStore();
  const [meId, setMeId] = useState<string>(char.profile.id);
  const [oppId, setOppId] = useState<string>(() => pickRandom(roster.map((r) => r.id).filter((id) => id !== char.profile.id)));
  const [rounds, setRounds] = useState(2);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const [mute, setMute] = useState(sfxMuted());
  const [mode, setMode] = useState<'match' | 'practice'>('match');
  const [dummy, setDummy] = useState<DummyMode>('stand');
  useEffect(() => {
    ensureLoaded([oppId, meId]).catch(() => undefined);
  }, [oppId, meId, ensureLoaded]);
  const opp = opponents.find((o) => o.profile.id === oppId);
  const me = opponents.find((o) => o.profile.id === meId);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Free fight</h1>
          <p>A 3D match against a bot that plays a real character. Every move uses its imported frame data (startup, damage, hit level, block / hit / counter-hit advantage, launch, tornado, homing, crush and power-crush frames, Heat Engagers, Heat Dash, Rage Art) and the bot punishes and juggles with the character's real punishers and combo routes. Tekken 8's documented systems are built in: 180 HP with recoverable health, Heat (2+3 or a Heat Engager), Rage at 45 HP, air-combo scaling, walls, throws, sidesteps, dashes and tech rolls. This is a <b>simulation</b>, not Tekken 8: reach, movement speeds, tracking, juggle gravity and string timing are approximations, and the fighters are original models, not the game's characters.</p>
        </div>
      </div>
      <div className="card row">
        <label className="field">You play
          <select value={meId} onChange={(e) => { setMeId(e.target.value); setRunning(false); }}>
            {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <span className="vs-mark">VS</span>
        <label className="field">Opponent
          <select value={oppId} onChange={(e) => { setOppId(e.target.value); setRunning(false); }}>
            {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => { setOppId(pickRandom(roster.map((r) => r.id).filter((id) => id !== oppId))); setRunning(false); }}>Random</button>
        <label className="field">Mode
          <div className="seg">
            {(['match', 'practice'] as const).map((m) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setRunning(false); }}>{m === 'match' ? 'Match' : 'Practice'}</button>)}
          </div>
        </label>
        {mode === 'practice' && (
          <label className="field">Dummy
            <select value={dummy} onChange={(e) => { setDummy(e.target.value as DummyMode); setRunning(false); }}>
              <option value="stand">Stand guard</option>
              <option value="crouch">Crouch guard</option>
              <option value="random">Random guard</option>
              <option value="none">No guard (combo practice)</option>
              <option value="fight">Fights back (no K.O.)</option>
            </select>
          </label>
        )}
        <label className="field">Bot level
          <div className="seg">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={settings.drillDifficulty === d ? 'on' : ''} onClick={() => { updateSettings({ drillDifficulty: d }); setRunning(false); }}>{d}</button>
            ))}
          </div>
        </label>
        {mode === 'match' && (
          <label className="field">Rounds to win
            <div className="seg">
              {[1, 2, 3].map((n) => <button key={n} className={rounds === n ? 'on' : ''} onClick={() => { setRounds(n); setRunning(false); }}>{n}</button>)}
            </div>
          </label>
        )}
        <span className="right" />
        <button className="btn" aria-pressed={!mute} onClick={() => { unlockAudio(); setSfxMuted(!mute); setMute(!mute); }}>{mute ? 'Sound off' : 'Sound on'}</button>
        <button className="btn primary" disabled={!opp || !me} onClick={() => { unlockAudio(); setRun(run + 1); setRunning(true); }}>{!opp || !me ? 'Loading…' : running ? 'Rematch' : 'Fight!'}</button>
      </div>
      <div className="notice info">
        <b>Move:</b> f / b walk, <b>f,f</b> dash, <b>b,b</b> backdash, tap <b>u</b> or <b>d</b> to sidestep (dodges linear moves), hold u to jump. <b>Guard:</b> neutral or back blocks highs and mids, down-back blocks lows and ducks highs and throws. <b>Attack:</b> buttons do {me?.profile.name ?? 'your character'}'s real moves; press the next button during a move for strings. <b>Throws</b> break with 1, 2 or 1+2 (generic throws: 1 or 2; a wrong button locks you out). <b>Low parry:</b> tap d/f just before a low hits (not weapon lows). <b>Knocked down:</b> press a button as you land to tech roll, or a direction to get up.<br />
        <b>Heat</b> (once per round): <b>2+3</b> Heat Burst (10 s) or land a Heat Engager (15 s). In Heat: H. moves, chip damage on block, faster health recovery; <b>2+3</b> is your Heat Smash; hold <b>f</b> when a Heat Engager connects for a Heat Dash. <b>Rage</b> at {RAGE_HP} HP or less: +10% damage, <b>d/f+1+2</b> Rage Art (armoured). White health is recoverable: you get it back by attacking.
      </div>
      {running && opp && me ? (
        <FightArena key={`${run}-${meId}-${oppId}-${rounds}-${settings.drillDifficulty}-${mode}-${dummy}`} me={me} opp={opp} rounds={rounds} difficulty={settings.drillDifficulty} practice={mode === 'practice' ? dummy : null} />
      ) : (
        <div className="arena-wrap arena-3d vs-preview">
          {me && opp && <VsPreview me={me} opp={opp} />}
          <div className="vs-names">
            <span>{me?.profile.name ?? '…'}</span>
            <b>VS</b>
            <span>{opp?.profile.name ?? '…'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Both fighters idling in 3D on the select screen. */
function VsPreview({ me, opp }: { me: CharacterData; opp: CharacterData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const arena = useRef<Arena3D | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let a: Arena3D;
    try {
      a = new Arena3D(ref.current, [lookFor(me.profile.id, me.profile.color, 'you'), lookFor(opp.profile.id, opp.profile.color, 'bot')]);
    } catch {
      return;
    }
    arena.current = a;
    const view = new DrillView();
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __vs: unknown }).__vs = { arena: a, view };
    view.p.pos.x = -75;
    view.b.pos.x = 75;
    const fit = () => a.resize(ref.current?.clientWidth ?? 960, ref.current?.clientHeight ?? 465);
    fit();
    window.addEventListener('resize', fit);
    let raf = 0;
    let t = 0;
    const loop = () => {
      a.render(view.fake, t++);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      a.dispose();
      arena.current = null;
    };
    // the arena is built once; looks are swapped below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    arena.current?.setLook(0, lookFor(me.profile.id, me.profile.color, 'you'));
  }, [me]);
  useEffect(() => {
    arena.current?.setLook(1, lookFor(opp.profile.id, opp.profile.color, 'bot'));
  }, [opp]);
  return <canvas ref={ref} className="gl" aria-label={`${me.profile.name} versus ${opp.profile.name}`} />;
}

function pickRandom(ids: string[]) {
  return ids[Math.floor(Math.random() * ids.length)] ?? 'anna';
}

interface Hud {
  shown: [number, number];
  trail: [number, number];
  popups: { text: string; at: { x: number; y: number; z: number }; age: number; color: string }[];
}

const SIZE = { w: 1280, h: 620 };

function FightArena({ me, opp, rounds, difficulty, practice }: { me: CharacterData; opp: CharacterData; rounds: number; difficulty: Difficulty; practice: DummyMode | null }) {
  const { settings } = useStore();
  useCaptureInput();
  const gl = useRef<HTMLCanvasElement>(null);
  const hudCanvas = useRef<HTMLCanvasElement>(null);
  const engine = useMemo(
    () => new FightEngine({ player: me, bot: opp, difficulty, rng: Math.random, roundsToWin: rounds, recognizer: settings.recognizer, practice: practice ? { dummy: practice } : undefined }),
    [me, opp, difficulty, rounds, settings.recognizer, practice],
  );
  const arena = useRef<Arena3D | null>(null);
  const pending = useRef<FightEvent[]>([]);
  const hud = useRef<Hud>({ shown: [MAX_HP, MAX_HP], trail: [MAX_HP, MAX_HP], popups: [] });
  const [feed, setFeed] = useState<string[]>([]);
  const [myMove, setMyMove] = useState<string | null>(null);
  const [over, setOver] = useState<{ winner: 0 | 1 | null; dealt: [number, number] } | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [adv, setAdv] = useState<{ who: 0 | 1; text: string; kind: string; move: string } | null>(null);

  const tick = useRef(0);
  const skipped = useRef(0);
  useInputFrames((f) => {
    // final K.O.: slow motion (one engine frame every 3 input frames for a moment)
    tick.current++;
    const finalKo = engine.phase === 'ko' && engine.frame - engine.phaseAt < 50 && Math.max(...engine.wins) >= engine.roundsToWin;
    if (finalKo && tick.current % 3 !== 0) {
      skipped.current++;
      return;
    }
    const before = engine.f[0].move;
    const ev = engine.update({ ...f, frame: f.frame - skipped.current });
    if (engine.f[0].move && engine.f[0].move !== before) setMyMove(engine.f[0].move.id);
    for (const x of engine.f) {
      if (x.state === 'down' && x.stateAt === engine.frame) playFall();
    }
    if (ev.length) {
      pending.current.push(...ev);
      handleEvents(ev);
      playEvents(ev);
    }
  });

  function handleEvents(ev: FightEvent[]) {
    const h = hud.current;
    const lines: string[] = [];
    const pop = (text: string, at: { x: number; z: number } | undefined, y: number, color: string) => at && h.popups.push({ text, at: { x: at.x / 100, y: y / 100, z: at.z / 100 }, age: 0, color });
    for (const e of ev) {
      if (e.type === 'counter') pop('COUNTER HIT', e.at, (e.y ?? 100) + 50, '#e4002b');
      // frame advantage readout (attacker's), like the in-game frame meter
      if ((e.type === 'hit' || e.type === 'counter' || e.type === 'block') && e.adv && e.by !== undefined) {
        const n = Number(e.adv);
        const color = Number.isNaN(n) ? '#ffffff' : n >= 0 ? '#ffffff' : n <= -10 ? '#ffffff' : '#d6d6d6';
        pop(e.adv, engine.f[e.by].pos, 205, color);
        setAdv({ who: e.by, text: e.adv, kind: e.type, move: engine.f[e.by].move?.id ?? '' });
      }
      if ((e.type === 'hit' || e.type === 'counter') && e.by === 0 && settings.rumble) inputManager.rumble(60, 0.5);
      if (e.type === 'launch') pop('LAUNCH', e.at, 210, '#ffffff');
      if (e.type === 'tornado') pop('TORNADO', e.at, 220, '#ffffff');
      if (e.type === 'wall') pop('WALL SPLAT', e.at, 200, '#ffffff');
      if (e.type === 'balcony') {
        pop('BALCONY BREAK', e.at, 220, '#ffffff');
        lines.push(`${e.by === 0 ? 'You' : opp.profile.short}: balcony break`);
      }
      if (e.type === 'throw' || e.type === 'break') pop(e.type === 'break' ? 'THROW BREAK' : 'THROW', e.at, 200, '#ffffff');
      if (e.type === 'crush' || e.type === 'armor') pop(e.type === 'armor' ? 'ARMOR' : 'CRUSH', e.at, 200, '#ffffff');
      if (e.type === 'step-evade') pop('SIDESTEP', e.at, 200, '#d6d6d6');
      if (e.type === 'tech') pop('TECH', e.at, 120, '#d6d6d6');
      if (e.type === 'parry') {
        pop('LOW PARRY', e.at, 180, '#ffffff');
        lines.push(`${e.by === 0 ? 'You' : opp.profile.short}: low parry`);
      }
      if (e.type === 'heat' || e.type === 'heat-smash' || e.type === 'heat-dash' || e.type === 'rage' || e.type === 'rage-art') {
        const who = engine.f[e.by ?? 0];
        const label = e.type === 'heat' ? 'HEAT' : e.type === 'heat-smash' ? 'HEAT SMASH' : e.type === 'heat-dash' ? 'HEAT DASH' : e.type === 'rage' ? 'RAGE' : 'RAGE ART';
        pop(label, who.pos, 230, e.type.startsWith('heat') ? '#ffffff' : '#e4002b');
        if (e.text) lines.push(e.text);
      }
      if (e.type === 'punish' && e.text) lines.push(e.text);
      if (e.type === 'counter') lines.push(`${e.by === 0 ? 'You' : opp.profile.short}: counter hit for ${e.damage}`);
      if ((e.type === 'crush' || e.type === 'armor' || e.type === 'throw') && e.text) lines.push(e.text);
      if (e.type === 'wall') lines.push(`${e.by === 0 ? 'You' : opp.profile.short}: wall splat`);
      if (e.type === 'round-end') lines.push(e.by === 0 ? 'You take the round' : e.by === 1 ? `${opp.profile.short} takes the round` : 'Draw round');
      if (e.type === 'match-end') setOver({ winner: engine.winner, dealt: [engine.f[0].dealt, engine.f[1].dealt] });
    }
    if (lines.length) setFeed((f) => [...lines.reverse(), ...f].slice(0, 6));
  }

  useEffect(() => {
    if (!gl.current) return;
    let a: Arena3D;
    try {
      a = new Arena3D(gl.current, [lookFor(me.profile.id, me.profile.color, 'you'), lookFor(opp.profile.id, opp.profile.color, 'bot')]);
    } catch (err) {
      setGlError((err as Error).message || 'WebGL is not available');
      return;
    }
    arena.current = a;
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __ifa: unknown }).__ifa = { arena: a, engine };
    const fit = () => {
      const w = gl.current?.clientWidth ?? SIZE.w;
      const h = Math.round((w * SIZE.h) / SIZE.w);
      a.resize(w, h);
      if (hudCanvas.current) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        hudCanvas.current.width = Math.round(w * dpr);
        hudCanvas.current.height = Math.round(h * dpr);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(gl.current);
    let raf = 0;
    const loop = () => {
      const ev = pending.current;
      pending.current = [];
      a.events(ev, engine);
      a.render(engine, engine.frame);
      const hc = hudCanvas.current;
      const ctx = hc?.getContext('2d');
      if (hc && ctx) {
        const dpr = hc.width / Math.max(1, hc.clientWidth);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, hc.width, hc.height);
        const k = hc.clientWidth / 960;
        ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
        drawHud(ctx, engine, hud.current, me, opp, 960, hc.clientHeight / k);
        drawPopups(ctx, a, hud.current, 960, hc.clientHeight / k);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      a.dispose();
      arena.current = null;
    };
  }, [engine, me, opp]);

  const p = engine.f[0];
  const lastMove = myMove ? me.moveIndex.get(myMove) : null;
  return (
    <div className="stack">
      <div className="arena-wrap arena-3d">
        <canvas ref={gl} className="gl" aria-label="Free fight (3D)" />
        <canvas ref={hudCanvas} className="hud" aria-hidden />
        {glError && <div className="notice warn">3D could not start: {glError}. Try another browser or enable hardware acceleration.</div>}
        <div className="sim-banner bottom">
          <span className="badge warn">SIMULATION · not Tekken 8's engine</span>
        </div>
      </div>
      {over && (
        <div className={`result-banner ${over.winner === 0 ? 'ok' : 'no'}`} role="status">
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
          <div className="section-label">Frame advantage</div>
          {adv ? <div className="small"><b className="mono" style={{ fontSize: '1.4rem' }}>{adv.text}</b> for {adv.who === 0 ? 'you' : opp.profile.short} after {adv.move} {adv.kind === 'block' ? 'was blocked' : 'hit'}{adv.text.startsWith('-') && Number(adv.text) <= -10 ? ' (punishable)' : ''}</div> : <span className="dim small">Shows the attacker's advantage after every hit or block, from the frame data.</span>}
        </div>
        <div className="card tight stack">
          <div className="section-label" id="fightlog">Fight log</div>
          {feed.length ? feed.map((l, i) => <div key={i} className={`small ${i ? 'dim' : ''}`}>{l}</div>) : <span className="dim small">Punishes, counter hits, crushes, wall splats and throws show up here.</span>}
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

// ---------- HUD (2D overlay in a 960-wide coordinate space) ----------

function drawPopups(ctx: CanvasRenderingContext2D, a: Arena3D, h: Hud, W: number, H: number) {
  for (const pu of h.popups) {
    const s = a.projectXYZ(pu.at.x, pu.at.y, pu.at.z, W, H);
    if (!s.visible) continue;
    ctx.globalAlpha = Math.max(0, 1 - pu.age / 55);
    ctx.font = `800 18px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = pu.color;
    ctx.fillText(pu.text, s.x, s.y - pu.age * 0.6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    pu.age++;
  }
  h.popups = h.popups.filter((p) => p.age < 55);
}

function drawHud(ctx: CanvasRenderingContext2D, e: FightEngine, a: Hud, me: CharacterData, opp: CharacterData, W: number, H: number) {
  const barW = 380, barH = 18, top = 22;
  for (const i of [0, 1] as const) {
    const f = e.f[i];
    const hp = f.hp;
    a.shown[i] += (hp - a.shown[i]) * 0.35;
    if (a.trail[i] > a.shown[i]) a.trail[i] -= 0.6;
    if (a.trail[i] < a.shown[i]) a.trail[i] = a.shown[i];
    const x0 = i === 0 ? W / 2 - 52 - barW : W / 2 + 52;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x0 - 3, top - 3, barW + 6, barH + 6);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x0, top, barW, barH);
    // bars fill from the outside in: P1 drains towards the left edge, P2 towards the right edge
    const fillFrom = (w: number) => (i === 0 ? x0 + barW - w : x0);
    const wTrail = (a.trail[i] / MAX_HP) * barW;
    ctx.fillStyle = '#5c5c5c';
    ctx.fillRect(fillFrom(wTrail), top, wTrail, barH);
    // recoverable health (white) sits next to the current health
    const wRec = ((hp + f.recov) / MAX_HP) * barW;
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(fillFrom(wRec), top, wRec, barH);
    const wHp = (a.shown[i] / MAX_HP) * barW;
    const low = inRage(f);
    const g = ctx.createLinearGradient(0, top, 0, top + barH);
    g.addColorStop(0, low ? '#ff3355' : '#ffffff');
    g.addColorStop(0.5, low ? '#e4002b' : '#ffffff');
    g.addColorStop(1, low ? '#b80023' : '#d6d6d6');
    ctx.fillStyle = g;
    ctx.fillRect(fillFrom(wHp), top, wHp, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(fillFrom(wHp), top + 2, wHp, 3);
    // Rage threshold notch
    const notch = i === 0 ? x0 + barW - (RAGE_HP / MAX_HP) * barW : x0 + (RAGE_HP / MAX_HP) * barW;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(notch - 4, top + barH);
    ctx.lineTo(notch + 4, top);
    ctx.stroke();
    if (low) {
      ctx.strokeStyle = `rgba(228,0,43,${0.6 + Math.sin(e.frame / 6) * 0.4})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 - 3, top - 3, barW + 6, barH + 6);
    }
    // heat gauge
    const hw = 160, hx = i === 0 ? x0 + barW - hw : x0, hy = top + barH + 30;
    const share = heatShare(f);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(hx - 2, hy - 2, hw + 4, 10);
    const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    hg.addColorStop(0, '#8a8a8a');
    hg.addColorStop(1, '#ffffff');
    ctx.fillStyle = hg;
    const hwNow = hw * share;
    ctx.fillRect(i === 0 ? hx + hw - hwNow : hx, hy, hwNow, 6);
    ctx.font = `300 11px ${DISPLAY}`;
    ctx.textAlign = i === 0 ? 'right' : 'left';
    ctx.fillStyle = f.heat === 'active' ? '#ffffff' : f.heat === 'ready' ? '#d6d6d6' : '#5c5c5c';
    ctx.fillText(f.heat === 'active' ? 'HEAT ACTIVE' : f.heat === 'ready' ? 'HEAT' : 'HEAT USED', i === 0 ? hx - 8 : hx + hw + 8, hy + 7);
    if (low) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('RAGE', i === 0 ? hx - 8 : hx + hw + 8, hy + 26);
    }
    // name + round wins
    const c = i === 0 ? me : opp;
    ctx.font = `700 15px ${DISPLAY}`;
    ctx.textAlign = i === 0 ? 'left' : 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${c.profile.name.toUpperCase()}${i === 0 ? '  (YOU)' : ''}`, i === 0 ? x0 : x0 + barW, top + barH + 24);
    ctx.shadowBlur = 0;
    for (let r = 0; r < e.roundsToWin; r++) {
      const cx = i === 0 ? x0 + barW - 10 - r * 22 : x0 + 10 + r * 22;
      ctx.beginPath();
      ctx.arc(cx, top + barH + 16, 7, 0, Math.PI * 2);
      ctx.fillStyle = r < e.wins[i] ? '#ffffff' : 'rgba(0,0,0,0.7)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // combo counter on the attacker's side
    const victim = e.f[i === 0 ? 1 : 0];
    if (victim.combo.hits >= 2) {
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const cx = i === 0 ? 24 : W - 24;
      ctx.font = `800 26px ${DISPLAY}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillText(`${victim.combo.hits} HITS`, cx, 150);
      ctx.font = `500 18px ${BODY}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${victim.combo.damage} DAMAGE`, cx, 174);
      ctx.shadowBlur = 0;
    }
  }
  // timer
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(W / 2 - 40, top - 8, 80, 50);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - 40, top - 8, 80, 50);
  ctx.font = `700 30px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = e.secondsLeft <= 10 && e.phase === 'fight' ? '#e4002b' : '#ffffff';
  ctx.fillText(e.cfg.practice ? '∞' : String(Math.max(0, e.secondsLeft)), W / 2, top + 34);
  // banners
  if (e.banner && e.frame < e.banner.until) {
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = e.banner.text === 'YOU LOSE' || e.banner.text === 'K.O.' ? '#e4002b' : '#ffffff';
    ctx.fillText(e.banner.text, W / 2, H * 0.45);
    ctx.shadowBlur = 0;
  }
}
