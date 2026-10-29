import { useMemo, useState, useEffect } from 'react';
import { lessonsFor } from '../../data';
import { computeStats, lessonState, recommend, type Recommendation } from '../../core/progress';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { InstallPhone } from '../components/InstallPhone';
import { RankBadge } from './RankingPage';
import { rankFor, rankPoints } from '../../core/rank';

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
  const { char, progress, settings, updateSettings, setActiveChar } = useStore();
  const lessons = useMemo(() => lessonsFor(char), [char]);
  const stats = useMemo(() => computeStats(progress, char.profile.id), [progress, char]);
  const recs = useMemo(() => recommend(lessons, progress, settings, char.profile.id), [lessons, progress, settings, char]);
  const mastered = lessons.filter((l) => lessonState(progress, char.profile.id, l.id).mastered).length;
  const combosMastered = char.combos.filter((c) => progress.combos[`${char.profile.id}:${c.id}`]?.mastered).length;
  const goal = settings.dailyGoalMinutes * 60;
  const recent = stats.days.slice(-7);
  const recentAttempts = recent.reduce((s, d) => s + d.attempts, 0);
  const recentOk = recent.reduce((s, d) => s + d.successes, 0);
  const { roster } = useStore();
  const rank = useMemo(() => rankFor(rankPoints(progress).total), [progress]);
  const today = stats.days[stats.days.length - 1];
  const trainedToday = stats.todaySeconds > 0 || (today?.attempts ?? 0) > 0;
  // The plan is the top three suggestions; finishing one makes the next suggestion move up.
  const plan = recs.filter((r) => r.type !== 'done').slice(0, 3);
  return (
    <div className="stack">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="diamond-device" aria-hidden />
        <p className="eyebrow">Tekken 8 training · a Level Academy programme</p>
        <h1 id="home-title" className="display">Train Tekken 8, one skill at a time.</h1>
        <p>Frame data, combos and punishers for all {roster.length} characters, with lessons, drills and a practice opponent. Your progress stays on this device.</p>
        <div className="row" style={{ marginTop: 'var(--space-lg)' }}>
          <button className="btn primary" onClick={() => (recs[0] ? go(recs[0]) : navigate('academy'))}>Continue training</button>
          <button className="btn desktop-only" onClick={() => navigate('fight')}>Open free fight</button>
        </div>
      </section>
      <InstallPhone />
      <label className="field favourite-pick">
        <span>Favourite character</span>
        <select
          name="favourite"
          value={settings.favoriteChar}
          onChange={(e) => {
            const id = e.target.value;
            updateSettings({ favoriteChar: id });
            if (id) setActiveChar(id);
          }}
        >
          <option value="">None (keep the last one used)</option>
          {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="small muted">Every tab opens on this character when you sign in.</span>
      </label>
      <div className="home-lead">
        <button className="char-card home-portrait" onClick={() => navigate('characters')} aria-label={`${char.profile.name}: change character`}>
          <div className="char-info">
            <span className="char-name">{char.profile.name}</span>
            <span className="char-meta">Change character</span>
          </div>
        </button>
        <div className="stack">
          <div>
            <h2>{char.profile.name} training</h2>
            <p className="dim" style={{ maxWidth: '70ch' }}>{char.profile.playstyle}</p>
          </div>
          <section className="card stack today-plan" aria-labelledby="plan-title">
            <div className="card-title">
              <h2 id="plan-title">Today's plan</h2>
              <span className={`streak ${trainedToday ? 'on' : ''}`} title="Days in a row with training">🔥 {stats.streakDays} {stats.streakDays === 1 ? 'day' : 'days'}</span>
            </div>
            <p className="small">{trainedToday ? 'You trained today: streak kept. Finish the plan for a strong session.' : stats.streakDays ? `Train today to keep your ${stats.streakDays}-day streak going.` : 'Train today to start a streak.'}</p>
            <div className="goal-bar" role="progressbar" aria-label="Daily goal" aria-valuemin={0} aria-valuemax={settings.dailyGoalMinutes} aria-valuenow={Math.floor(stats.todaySeconds / 60)}>
              <i style={{ width: `${Math.min(100, (stats.todaySeconds / goal) * 100)}%` }} />
            </div>
            <p className="small muted">{Math.floor(stats.todaySeconds / 60)} of {settings.dailyGoalMinutes} minutes today{stats.todaySeconds >= goal ? ' · goal reached ✓' : ''}</p>
            <ol className="plan-list">
              {plan.map((r, i) => (
                <li key={i}>
                  <button className="list-item home-next" onClick={() => go(r)}>
                    <span>
                      <span className="home-next-title">{r.title}</span>
                      <span className="small dim">{r.reason}</span>
                    </span>
                    <span className="btn primary right">{i === 0 ? 'Start' : 'Go'}</span>
                  </button>
                </li>
              ))}
              {!plan.length && <li className="small">Nothing left to suggest for {char.profile.short}: everything is mastered. Try the Combo lab's Challenge mode or another character.</li>}
            </ol>
          </section>
          <dl className="stat-strip">
            <button className="rank-chip" onClick={() => navigate('ranking')} title="See your rank and the leaderboard">
              <RankBadge index={rank.index} size={40} />
              <span><dt>Rank</dt><dd>{rank.name}</dd></span>
            </button>
            <div><dt>Lessons mastered</dt><dd>{mastered} of {lessons.length}</dd></div>
            <div><dt>Last 7 days</dt><dd>{recentAttempts ? `${Math.round((recentOk / recentAttempts) * 100)}% of ${recentAttempts}` : 'No attempts'}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: recs.length > 3 ? '2fr 1fr' : '1fr' }}>
        {recs.length > 3 && <div className="card stack">
          <div className="card-title"><h2>Also worth training</h2><span className="small muted">Based on your recorded results</span></div>
          {recs.slice(3).map((r, i) => (
            <button key={i} className="list-item" onClick={() => go(r)} disabled={r.type === 'done'}>
              <span className={`badge ${r.type === 'focus-step' || r.type === 'drill' ? 'warn' : r.type === 'review' ? 'info' : 'char'}`}>{r.type === 'focus-step' ? 'Weakness' : r.type === 'drill' ? 'Weakness' : r.type === 'review' ? 'Review' : r.type === 'lesson' ? 'Path' : 'Done'}</span>
              <span>
                <b>{r.title}</b>
                <div className="small dim">{r.reason}</div>
              </span>
              {r.type !== 'done' && <span className="right muted">→</span>}
            </button>
          ))}
        </div>}
        <div className={recs.length > 3 ? 'stack' : 'grid g2'}>
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
