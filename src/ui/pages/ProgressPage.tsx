import { useMemo, useState } from 'react';
import { lessonsFor, STAGE_NAMES } from '../../data';
import { computeStats, lessonState, migrateProgress } from '../../core/progress';
import { ERROR_TEXT, type InputErrorType } from '../../core/recognizer';
import { OUTCOME_TEXT, type Outcome } from '../../core/sim';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { BarChart, LineChart } from '../components/Charts';
import { storage } from '../../runtime/storage';

const errLabel = (t: string) => ERROR_TEXT[t as InputErrorType] ?? OUTCOME_TEXT[t as Outcome] ?? t;

export function ProgressPage() {
  const { char, characters, progress, reset, replaceProgress } = useStore();
  const [days, setDays] = useState(14);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const stats = useMemo(() => computeStats(progress, char.profile.id, new Date(), days), [progress, char, days]);
  const lessons = useMemo(() => lessonsFor(char), [char]);
  const history = progress.attempts.filter((a) => a.char === char.profile.id).slice(-40).reverse();
  const fmtDay = (d: string) => d.slice(5);

  const exportAll = async () => {
    const r = await storage.exportText(`iron-fist-academy-progress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(progress, null, 1));
    setMsg(r ? `Exported to ${r}` : 'Export cancelled.');
  };
  const importAll = async () => {
    const text = await storage.importText();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.attempts)) throw new Error('not a progress file');
      replaceProgress(migrateProgress(parsed));
      setMsg(`Imported ${parsed.attempts.length} attempts.`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}. Your current progress was not changed.`);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Progress · {char.profile.name}</h1>
          <p>Everything here is computed from attempts you actually recorded on this computer. Nothing is estimated or pre-filled.</p>
        </div>
        <div className="seg">
          {[7, 14, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
      </div>

      <div className="grid g4">
        <div className="card stat"><span className="stat-val">{stats.attempts}</span><span className="stat-label">Attempts recorded (all time)</span></div>
        <div className="card stat"><span className="stat-val">{stats.attempts ? `${Math.round(stats.successRate * 100)}%` : '—'}</span><span className="stat-label">Overall success rate</span></div>
        <div className="card stat"><span className="stat-val">{Math.round(stats.days.reduce((s, d) => s + d.seconds, 0) / 60)} min</span><span className="stat-label">Practice time, last {days} days</span></div>
        <div className="card stat"><span className="stat-val">{stats.avgComboMs ? `${(stats.avgComboMs / 1000).toFixed(2)}s` : '—'}</span><span className="stat-label">Avg. clean combo execution time</span></div>
      </div>

      {stats.attempts === 0 ? (
        <div className="empty">No attempts recorded for {char.profile.name} yet. Charts appear once you train.</div>
      ) : (
        <div className="grid g2">
          <div className="card">
            <h3>Attempts per day</h3>
            <BarChart title="Attempts per day" data={stats.days.map((d) => ({ label: fmtDay(d.date), value: d.attempts, note: `${d.successes} successful` }))} />
          </div>
          <div className="card">
            <h3>Success rate per day</h3>
            <LineChart title="Success rate per day" data={stats.days.map((d) => ({ label: fmtDay(d.date), value: d.attempts ? (d.successes / d.attempts) * 100 : null, note: `${d.attempts} attempts` }))} />
          </div>
        </div>
      )}

      <div className="grid g3">
        <div className="card stack">
          <h3>Weakest areas</h3>
          {stats.weaknesses.length ? stats.weaknesses.map((w) => (
            <button key={w.key} className="list-item" onClick={() => (w.kind === 'combo-step' ? navigate('combos', w.comboId!, String(w.stepIndex)) : navigate('dojo', w.drillId!))}>
              <span className="badge warn">{w.failures}×</span>
              <span className="small">{w.kind === 'combo-step' ? `${char.combos.find((c) => c.id === w.comboId)?.name ?? w.comboId}: step ${w.stepIndex! + 1}` : `Drill: ${w.label}`}<div className="muted">{w.kind === 'combo-step' ? `dropped here ${w.failures} of ${w.total} recent runs → focus drill` : `${w.failures}/${w.total} recent rounds failed`}</div></span>
            </button>
          )) : <div className="small muted">Not enough recent failures to identify a pattern.</div>}
        </div>
        <div className="card stack">
          <h3>Recurring errors</h3>
          {stats.errorTypes.length ? (
            <table className="data"><tbody>{stats.errorTypes.slice(0, 8).map((e) => <tr key={e.type}><td>{errLabel(e.type)}</td><td className="mono">{e.count}</td></tr>)}</tbody></table>
          ) : <div className="small muted">No errors recorded.</div>}
        </div>
        <div className="card stack">
          <h3>By activity</h3>
          <table className="data">
            <thead><tr><th>Type</th><th>Attempts</th><th>Success</th></tr></thead>
            <tbody>{Object.entries(stats.byKind).map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono">{v.attempts}</td><td className="mono">{Math.round((v.successes / v.attempts) * 100)}%</td></tr>)}</tbody>
          </table>
          {!Object.keys(stats.byKind).length && <div className="small muted">Nothing yet.</div>}
        </div>
      </div>

      <div className="grid g2">
        <div className="card stack">
          <h3>Curriculum</h3>
          {[1, 2, 3, 4, 5].map((st) => {
            const ls = lessons.filter((l) => l.stage === st);
            const m = ls.filter((l) => lessonState(progress, char.profile.id, l.id).mastered).length;
            return (
              <div key={st}>
                <div className="row small"><b>Stage {st}: {STAGE_NAMES[st]}</b><span className="right muted">{m}/{ls.length}</span></div>
                <div className="progress"><i style={{ width: `${(m / ls.length) * 100}%` }} /></div>
              </div>
            );
          })}
          <h3 style={{ marginTop: 8 }}>Combos</h3>
          <table className="data">
            <thead><tr><th>Combo</th><th>Runs</th><th>Clean</th><th>Best streak</th><th /></tr></thead>
            <tbody>{char.combos.map((c) => {
              const s = progress.combos[`${char.profile.id}:${c.id}`];
              return <tr key={c.id} className="clickable" onClick={() => navigate('combos', c.id)}><td>{c.name}</td><td className="mono">{s?.attempts ?? 0}</td><td className="mono">{s ? `${Math.round((s.successes / s.attempts) * 100)}%` : '—'}</td><td className="mono">{s?.bestStreak ?? 0}</td><td>{s?.mastered && <span className="badge good">Mastered</span>}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="card stack">
          <h3>Training history</h3>
          {history.length ? (
            <div className="scroll" style={{ maxHeight: 420 }}>
              <table className="data">
                <thead><tr><th>When</th><th>Type</th><th>Item</th><th>Result</th></tr></thead>
                <tbody>{history.map((a, i) => (
                  <tr key={i}>
                    <td className="small muted">{new Date(a.at).toLocaleString()}</td>
                    <td className="small">{a.kind}{a.mode ? ` · ${a.mode}` : ''}</td>
                    <td className="mono small">{a.itemId.length > 34 ? `${a.itemId.slice(0, 34)}…` : a.itemId}</td>
                    <td>{a.success ? <span className="badge good">✔</span> : <span className="badge bad" title={a.detail}>{a.errorType ? errLabel(a.errorType) : '✖'}{a.errorStepText ? ` @ ${a.errorStepText}` : ''}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="small muted">No history yet.</div>}
        </div>
      </div>

      <div className="card stack">
        <h3>Export, import and reset</h3>
        <div className="row">
          <button className="btn" onClick={exportAll}>Export all progress (JSON)</button>
          <button className="btn" onClick={importAll}>Import progress…</button>
          <span className="right" />
          {characters.map((c) => (
            confirm === c.profile.id ? (
              <span key={c.profile.id} className="row"><span className="small">Reset {c.profile.name}?</span><button className="btn sm danger" onClick={() => { reset(c.profile.id); setConfirm(null); setMsg(`${c.profile.name}'s progress was reset.`); }}>Yes, reset</button><button className="btn sm" onClick={() => setConfirm(null)}>Cancel</button></span>
            ) : <button key={c.profile.id} className="btn danger" onClick={() => setConfirm(c.profile.id)}>Reset {c.profile.short}</button>
          ))}
          {confirm === 'all' ? (
            <span className="row"><span className="small">Erase everything?</span><button className="btn sm danger" onClick={() => { reset('all'); setConfirm(null); setMsg('All progress was reset.'); }}>Yes, erase all</button><button className="btn sm" onClick={() => setConfirm(null)}>Cancel</button></span>
          ) : <button className="btn danger" onClick={() => setConfirm('all')}>Reset everything</button>}
        </div>
        {msg && <div className="notice info">{msg}</div>}
        <div className="small muted">Resetting one character keeps shared fundamentals lessons. Importing replaces current progress; export first if you want a backup.</div>
      </div>
    </div>
  );
}
