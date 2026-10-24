import { useMemo, useState, useEffect } from 'react';
import { lessonsFor } from '../../data';
import { computeStats, lessonState, recommend, type Recommendation } from '../../core/progress';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { Ring } from '../components/Charts';

function go(r: Recommendation) {
  if (r.type === 'focus-step') navigate('combos', r.comboId, String(r.stepIndex));
  else if (r.type === 'drill') navigate('dojo', r.drillId);
  else if (r.type === 'lesson' || r.type === 'review') navigate('academy', r.lessonId);
}

function SessionTimer({ minutes }: { minutes: number }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endAt]);
  const left = endAt ? Math.max(0, endAt - now) : minutes * 60000;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <div className="card">
      <div className="card-title"><h3>Practice session</h3><span className="badge">{minutes} min</span></div>
      <div className="stat-val mono">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
      <div className="stat-label">{endAt ? (left === 0 ? 'Session complete: take a break or review.' : 'Session running') : 'Set the length in Settings'}</div>
      <div className="row" style={{ marginTop: 10 }}>
        {endAt ? <button className="btn sm" onClick={() => setEndAt(null)}>Stop</button> : <button className="btn sm primary" onClick={() => { setNow(Date.now()); setEndAt(Date.now() + minutes * 60000); }}>Start timer</button>}
      </div>
    </div>
  );
}

export function HomePage() {
  const { char, progress, settings } = useStore();
  const lessons = useMemo(() => lessonsFor(char), [char]);
  const stats = useMemo(() => computeStats(progress, char.profile.id), [progress, char]);
  const recs = useMemo(() => recommend(lessons, progress, settings, char.profile.id), [lessons, progress, settings, char]);
  const mastered = lessons.filter((l) => lessonState(progress, char.profile.id, l.id).mastered).length;
  const combosMastered = char.combos.filter((c) => progress.combos[`${char.profile.id}:${c.id}`]?.mastered).length;
  const goal = settings.dailyGoalMinutes * 60;
  const recent = stats.days.slice(-7);
  const recentAttempts = recent.reduce((s, d) => s + d.attempts, 0);
  const recentOk = recent.reduce((s, d) => s + d.successes, 0);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{char.profile.name} training</h1>
          <p>{char.profile.playstyle}</p>
        </div>
        <button className="btn" onClick={() => navigate('characters')}>Character profile</button>
      </div>

      <div className="grid g4">
        <div className="card row" style={{ flexWrap: 'nowrap' }}>
          <Ring value={stats.todaySeconds / goal} label="Daily goal" />
          <div className="stat">
            <span className="stat-val">{Math.floor(stats.todaySeconds / 60)}<span className="dim" style={{ fontSize: 15 }}> / {settings.dailyGoalMinutes} min</span></span>
            <span className="stat-label">Today's practice</span>
          </div>
        </div>
        <div className="card stat"><span className="stat-val">{stats.streakDays}</span><span className="stat-label">Day streak</span></div>
        <div className="card stat"><span className="stat-val">{mastered}<span className="dim" style={{ fontSize: 15 }}> / {lessons.length}</span></span><span className="stat-label">Lessons mastered</span><div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${(mastered / lessons.length) * 100}%` }} /></div></div>
        <div className="card stat">
          <span className="stat-val">{recentAttempts ? `${Math.round((recentOk / recentAttempts) * 100)}%` : '—'}</span>
          <span className="stat-label">{recentAttempts ? `Success rate, last 7 days (${recentAttempts} attempts)` : 'No attempts in the last 7 days'}</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card stack">
          <div className="card-title"><h2>Recommended next</h2><span className="small muted">Based on your recorded results</span></div>
          {recs.map((r, i) => (
            <button key={i} className="list-item" onClick={() => go(r)} disabled={r.type === 'done'}>
              <span className={`badge ${r.type === 'focus-step' || r.type === 'drill' ? 'warn' : r.type === 'review' ? 'info' : 'char'}`}>{r.type === 'focus-step' ? 'Weakness' : r.type === 'drill' ? 'Weakness' : r.type === 'review' ? 'Review' : r.type === 'lesson' ? 'Path' : 'Done'}</span>
              <span>
                <b>{r.title}</b>
                <div className="small dim">{r.reason}</div>
              </span>
              {r.type !== 'done' && <span className="right muted">→</span>}
            </button>
          ))}
        </div>
        <div className="stack">
          <SessionTimer minutes={settings.sessionMinutes} />
          <div className="card stat">
            <span className="stat-val">{combosMastered}<span className="dim" style={{ fontSize: 15 }}> / {char.combos.length}</span></span>
            <span className="stat-label">Combos mastered ({settings.comboConsistency} clean in a row)</span>
          </div>
        </div>
      </div>

      <div className="grid g3">
        {[
          ['academy', 'Learning Academy', 'Structured lessons from notation to tournament prep, with mastery checks.'],
          ['combos', 'Combo Lab', 'Step-by-step, slow, memory and consistency training with live input checking.'],
          ['dojo', 'Bot Dojo', 'Frame-accurate punish, defence, throw-break and whiff-punish simulation.'],
        ].map(([id, t, d]) => (
          <button key={id} className="card list-item" style={{ display: 'block' }} onClick={() => navigate(id)}>
            <h3>{t}</h3>
            <div className="small dim">{d}</div>
          </button>
        ))}
      </div>
      {stats.attempts === 0 && (
        <div className="notice info">
          <b>Welcome!</b> No training has been recorded for {char.profile.short} yet, so there are no stats. Connect your DualSense (Controller page), then start with the first Academy lesson.
        </div>
      )}
    </div>
  );
}
