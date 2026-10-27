import { useEffect, useState } from 'react';
import type { DrillId } from '../../types';
import type { Difficulty } from '../../core/progress';
import { DIFFICULTY } from '../../core/sim';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { DojoArena, DRILLS } from '../components/DojoArena';

export function DojoPage({ drill }: { drill?: string }) {
  const { settings, updateSettings, opponents, progress, char, roster, ensureLoaded, loadingIds } = useStore();
  // Drills draw bot moves from every character, so load the whole roster's data.
  useEffect(() => {
    ensureLoaded(roster.map((r) => r.id)).catch(() => undefined);
  }, [roster, ensureLoaded]);
  const current = (drill && drill in DRILLS ? drill : 'punish-standing') as DrillId;
  const [reps, setReps] = useState(15);
  const [opp, setOpp] = useState<string>('all');
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(false);
  const recent = progress.attempts.filter((a) => a.kind === 'drill' && a.itemId === current && a.char === char.profile.id).slice(-50);
  const rate = recent.length ? Math.round((recent.filter((a) => a.success).length / recent.length) * 100) : null;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Bot Dojo</h1>
          <p>A standalone training simulation. The bot uses real moves and frame data (startup, block advantage, recovery) and judges you with Tekken's frame rules. It does <b>not</b> reproduce Tekken 8's animations, hitboxes, range, pushback, tracking or AI, and cannot replace practice against the real game.</p>
        </div>
        <button className="btn" onClick={() => navigate('companion')}>Same drill in Tekken 8</button>
      </div>
      <div className="grid g3">
        {(Object.keys(DRILLS) as DrillId[]).map((d) => (
          <button key={d} className={`list-item ${d === current ? 'sel' : ''}`} style={{ flexDirection: 'column', alignItems: 'flex-start' }} onClick={() => { setRunning(false); navigate('dojo', d); }}>
            <b>{DRILLS[d].title}</b>
            <span className="small dim">{DRILLS[d].desc}</span>
          </button>
        ))}
      </div>
      <div className="card row">
        <label className="field">Difficulty
          <div className="seg">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={settings.drillDifficulty === d ? 'on' : ''} onClick={() => updateSettings({ drillDifficulty: d })}>{d}</button>
            ))}
          </div>
        </label>
        <span className="small muted" style={{ maxWidth: 260 }}>Hit level shown {DIFFICULTY[settings.drillDifficulty].revealBefore} frames ({Math.round((DIFFICULTY[settings.drillDifficulty].revealBefore / 60) * 1000)} ms) before impact.</span>
        <label className="field">Opponent moves from
          <select value={opp} onChange={(e) => setOpp(e.target.value)}>
            <option value="all">All characters{loadingIds.length ? ` (loading ${loadingIds.length}…)` : ` (${opponents.length})`}</option>
            {opponents.map((o) => <option key={o.profile.id} value={o.profile.id}>{o.profile.name}</option>)}
          </select>
        </label>
        <label className="field">Rounds
          <input type="number" min={5} max={100} value={reps} onChange={(e) => setReps(Math.max(5, Math.min(100, Number(e.target.value) || 15)))} style={{ width: 80 }} />
        </label>
        <span className="right" />
        {rate !== null && <span className="badge">{char.profile.short}: {rate}% over last {recent.length} rounds</span>}
        <button className="btn primary" disabled={opp === 'all' && loadingIds.length > 0} onClick={() => { setRun(run + 1); setRunning(true); }}>{running ? 'Restart' : 'Start drill'}</button>
      </div>
      <div className="notice info"><b>How:</b> {DRILLS[current].how} You play as {char.profile.name}: your presses are matched against {char.profile.short}'s real move list.</div>
      {running ? (
        <DojoArena key={`${current}-${run}-${opp}-${settings.drillDifficulty}`} drill={current} reps={reps} difficulty={settings.drillDifficulty} opponentIds={opp === 'all' ? undefined : [opp]} />
      ) : (
        <div className="empty">Press <b>Start drill</b>. Keep your hands on the controller: rounds start automatically.</div>
      )}
    </div>
  );
}
