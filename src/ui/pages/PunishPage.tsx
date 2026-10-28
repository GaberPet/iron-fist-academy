import { useEffect, useMemo, useState } from 'react';
import { punisherQuestions, type QuizQuestion } from '../../core/quiz';
import { lookupMove } from '../../data';
import { finePointer, hrefTo, navigate, rowClick } from '../hooks';
import { useStore } from '../store';
import { NotationView } from '../components/Notation';
import { InputDrill } from '../components/InputDrill';

export function PunishPage() {
  const { char, opponents, record, roster, ensureLoaded } = useStore();
  useEffect(() => {
    ensureLoaded(roster.map((r) => r.id)).catch(() => undefined);
  }, [roster, ensureLoaded]);
  const [oppId, setOppId] = useState<string>('all');
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [phase, setPhase] = useState<'choose' | 'execute' | 'done'>('choose');
  const [execOk, setExecOk] = useState<boolean | null>(null);
  const opps = opponents.filter((o) => oppId === 'all' || o.profile.id === oppId);
  const q: QuizQuestion | undefined = useMemo(() => punisherQuestions(char, opps, 1, Math.random)[0], [round, char, oppId]); // eslint-disable-line react-hooks/exhaustive-deps
  const correctMove = q ? q.options[q.answer].replace(/ \(punishes.*$/, '') : '';

  const next = () => {
    setRound(round + 1);
    setPicked(null);
    setPhase('choose');
    setExecOk(null);
  };

  const standing = char.punishers.filter((p) => p.stance === 'standing');
  const crouching = char.punishers.filter((p) => p.stance === 'crouching');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Punishment Trainer · {char.profile.name}</h1>
          <p>Know your punisher for every frame window, then execute it. Opponent moves and frame values come from the imported data; {char.profile.short}'s punisher list comes from Wavu's punisher table.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate('dojo', 'punish-standing')}>Timing drill (standing) →</button>
          <button className="btn" onClick={() => navigate('dojo', 'punish-crouching')}>Timing drill (crouching) →</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' }}>
        <div className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>Punishment mode</h2>
            <select className="right" value={oppId} onChange={(e) => { setOppId(e.target.value); next(); }} aria-label="Opponent">
              <option value="all">Opponent: any</option>
              {opponents.map((o) => <option key={o.profile.id} value={o.profile.id}>Opponent: {o.profile.name}</option>)}
            </select>
          </div>
          {!q ? (
            <div className="empty">No suitable unsafe moves for this opponent in the data.</div>
          ) : (
            <>
              <h3>{q.prompt}</h3>
              {q.moveId && <div className="small dim">Their move: <NotationView notation={q.moveId} /></div>}
              {q.options.map((o, k) => (
                <button key={k} className={`btn quiz-opt ${picked !== null && k === q.answer ? 'correct' : ''} ${picked === k && k !== q.answer ? 'wrong' : ''}`} disabled={picked !== null}
                  onClick={() => {
                    setPicked(k);
                    record({ kind: 'punish', itemId: q.id, success: k === q.answer, detail: `choice: ${o}` });
                    setPhase(k === q.answer ? 'execute' : 'done');
                  }}>
                  {o}
                </button>
              ))}
              {picked !== null && <div className={`notice ${picked === q.answer ? 'info' : 'bad'}`}>{q.explain}<div className="source-line">{q.dataNote}</div></div>}
              {phase === 'execute' && (
                <div className="stack">
                  <div className="section-label">Now execute it</div>
                  <InputDrill key={round} items={[correctMove]} onDone={(s) => { setExecOk(s === 1); setPhase('done'); }} />
                </div>
              )}
              {phase === 'done' && (
                <div className="row">
                  {execOk !== null && <span className={`badge ${execOk ? 'good' : 'bad'}`}>{execOk ? 'Executed cleanly' : 'Execution missed'}</span>}
                  <button className="btn primary" onClick={next} autoFocus={finePointer()}>Next situation</button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="card stack">
          <h3>{char.profile.short}'s punishers</h3>
          {[['Standing', standing], ['Crouching (after blocking a low)', crouching]].map(([title, list]) => (
            <div key={title as string}>
              <h4>{title as string}</h4>
              <table className="data">
                <thead><tr><th>Window</th><th>Punisher</th><th>Startup</th><th>Damage</th></tr></thead>
                <tbody>
                  {(list as typeof standing).map((p) => {
                    const m = lookupMove(char, p.moveId);
                    return (
                      <tr key={p.moveId + p.window} className="clickable" onClick={rowClick('moves', m?.id ?? p.moveId)}>
                        <td className="mono"><a className="row-link" href={hrefTo('moves', m?.id ?? p.moveId)} aria-label={`${p.moveId}, punishes ${p.window}`}>{p.window}</a></td>
                        <td><NotationView notation={p.moveId} />{p.note && <div className="small muted">{p.note}</div>}</td>
                        <td className="mono">{m?.startup ?? '—'}</td>
                        <td className="mono">{m?.damage ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div className="source-line">Punisher windows: Wavu Wiki punisher table. Note that range and pushback can make listed punishers whiff at long distance.</div>
        </div>
      </div>
    </div>
  );
}
