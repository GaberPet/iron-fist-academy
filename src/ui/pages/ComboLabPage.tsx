import { useEffect, useMemo, useState } from 'react';
import type { ComboDef } from '../../types';
import { inputSteps, parseNotation } from '../../core/notation';
import { shuffle } from '../../core/quiz';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { ComboTrainer, MODE_INFO, type TrainerMode } from '../components/ComboTrainer';
import { NotationView } from '../components/Notation';

type LabMode = TrainerMode | 'challenge';

export function ComboLabPage({ comboId, focusStep }: { comboId?: string; focusStep?: number }) {
  const { char, progress, settings } = useStore();
  const [mode, setMode] = useState<LabMode>('step');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const combo = char.combos.find((c) => c.id === comboId) ?? (mode === 'challenge' ? undefined : char.combos[0]);
  useEffect(() => {
    if (focusStep !== undefined) setMode('slow');
  }, [focusStep]);
  const tags = [...new Set(char.combos.flatMap((c) => c.tags))];
  const needle = q.trim().toLowerCase();
  const shown = char.combos
    .filter((c) => filter === 'all' || c.tags.includes(filter))
    .filter((c) => !needle || `${c.name} ${c.starters.join(' ')} ${c.route}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(!!b.curated) - Number(!!a.curated) || (a.difficulty ?? 9) - (b.difficulty ?? 9));
  const imported = char.combos.filter((c) => !c.curated);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Combo Lab · {char.profile.name}</h1>
          <p>{char.combos.length} routes from the Wavu Wiki combo page{imported.length !== char.combos.length ? ` (${char.combos.length - imported.length} curated with coaching tips)` : ''}, refreshed automatically when the wiki changes. Damage is shown exactly as listed there; difficulty stars are coach estimates on curated combos only. Your controller input is checked live.</p>
        </div>
      </div>
      <div className="split">
        <div className="stack">
          <input type="search" placeholder="Search starter or route…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search combos" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter combos">
            <option value="all">All combos ({char.combos.length})</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="list scroll" style={{ maxHeight: 'calc(100vh - 290px)' }}>
            {!shown.length && <div className="empty">No combos match.</div>}
            {shown.map((c) => {
              const st = progress.combos[`${char.profile.id}:${c.id}`];
              return (
                <button key={c.id} className={`list-item ${combo?.id === c.id && mode !== 'challenge' ? 'sel' : ''}`} onClick={() => { if (mode === 'challenge') setMode('step'); navigate('combos', c.id); }} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div className="row" style={{ width: '100%' }}>
                    <b>{c.name}</b>
                    {c.curated && <span className="badge char">Curated</span>}
                    {c.parseOk === false && <span className="badge" title="The trainer can't read this notation yet">View only</span>}
                    <span className="right">{st?.mastered ? <span className="badge good">Mastered</span> : st ? <span className="badge">{st.successes}/{st.attempts}</span> : null}</span>
                  </div>
                  <span className="small muted">{c.difficulty ? `${'★'.repeat(c.difficulty)}${'☆'.repeat(5 - c.difficulty)} · ` : ''}{c.starters.join(', ') || c.section || 'wall'}</span>
                  {!c.curated && <span className="small mono dim">{c.route.length > 60 ? `${c.route.slice(0, 60)}…` : c.route}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="stack">
          <div className="seg" role="tablist" aria-label="Training mode">
            {(['step', 'full', 'slow', 'memory', 'consistency', 'challenge'] as LabMode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'challenge' ? 'Challenge' : MODE_INFO[m].label}</button>
            ))}
          </div>
          <div className="small dim">{mode === 'challenge' ? 'You get a situation and must pick the right route, then perform it. Punishment scenarios are on the Punishment page.' : MODE_INFO[mode].help}</div>
          {mode === 'challenge' ? (
            <ChallengeMode />
          ) : combo ? (
            <ComboDetail combo={combo} mode={mode} focusStep={combo.id === comboId ? focusStep : undefined} required={mode === 'consistency' ? settings.comboConsistency : undefined} />
          ) : (
            <div className="empty">No combos for this character.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ComboDetail({ combo, mode, focusStep, required }: { combo: ComboDef; mode: TrainerMode; focusStep?: number; required?: number }) {
  const { char } = useStore();
  const alt = combo.easierAlternative ? char.combos.find((c) => c.id === combo.easierAlternative) : undefined;
  let n: number | null = null;
  try {
    n = inputSteps(parseNotation(combo.route)).length;
  } catch {
    n = null;
  }
  const trainable = combo.parseOk !== false && n !== null;
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>{combo.name}</h2>
          {combo.difficulty ? <span className="badge" title="Coach estimate">{'★'.repeat(combo.difficulty)} difficulty</span> : <span className="badge" title="Imported routes aren't rated">Not rated</span>}
          {combo.curated && <span className="badge char">Curated</span>}
          {combo.tags.map((t) => <span key={t} className="badge">{t}</span>)}
        </div>
        <p className="dim" style={{ margin: 0 }}>{combo.situation}</p>
        <dl className="kv">
          <dt>Starters</dt><dd>{combo.starters.length ? combo.starters.map((s) => <span key={s} style={{ marginRight: 10 }}><NotationView notation={s} /></span>) : 'After a wall splat / carry'}</dd>
          <dt>Route</dt><dd><NotationView notation={combo.route} /></dd>
          {combo.section && <><dt>Section</dt><dd>{combo.section}</dd></>}
          <dt>Inputs</dt><dd>{n !== null ? `${n} after the starter` : 'Notation not readable by the trainer yet'}</dd>
          <dt>Damage</dt><dd>{combo.damage ? <><span className="mono">{combo.damage}</span> <span className="small muted">(exactly as written on the source page)</span></> : <span className="muted">Not listed by the source</span>}</dd>
          {combo.wallCarry && <><dt>Wall carry</dt><dd>{combo.wallCarry}</dd></>}
          <dt>Source</dt><dd><a href={combo.source.url} target="_blank" rel="noreferrer">{combo.source.name}</a> {combo.source.revision ? `rev ${combo.source.revision}` : ''} <span className={`badge ${combo.source.verified === 'source' ? 'info' : 'warn'}`}>{combo.source.verified === 'source' ? 'Documented route' : 'Unverified'}</span></dd>
        </dl>
        {combo.notes && combo.notes.length > 0 && (
          <div>
            <div className="section-label">Notes from the source</div>
            <ul className="dim small" style={{ paddingLeft: 18, margin: 0 }}>{combo.notes.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {combo.mistakes.length > 0 && (
          <div>
            <div className="section-label">Common execution mistakes (coach tips)</div>
            <ul className="dim small" style={{ paddingLeft: 18, margin: 0 }}>{combo.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {alt && <div className="small">Too hard? Easier alternative: <button className="btn sm" onClick={() => navigate('combos', alt.id)}>{alt.name}</button></div>}
      </div>
      {trainable ? (
        <ComboTrainer key={`${combo.id}-${mode}-${focusStep ?? ''}`} char={char} combo={combo} mode={mode} focusStep={focusStep} requiredStreak={required} />
      ) : (
        <div className="notice warn">
          <b>View only.</b> This route uses notation the trainer can't check yet (for example a character-specific shorthand or a written note), so it is shown exactly as written on the source. You can still practise it in Tekken 8.
        </div>
      )}
    </div>
  );
}

/** Situation → pick the right combo → perform it. */
function ChallengeMode() {
  const { char } = useStore();
  const [round, setRound] = useState(0);
  const pool = char.combos.filter((c) => c.starters.length > 0 && c.parseOk !== false && startsWithNotation(c.starters[0]));
  const scenario = useMemo(() => {
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (!target) return null;
    const others = shuffle(pool.filter((c) => c.id !== target.id && !c.starters.some((s) => target.starters.includes(s))), Math.random).slice(0, 2);
    return { target, starter: target.starters[0], options: shuffle([target, ...others], Math.random) };
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [round]);
  if (!scenario) return <div className="empty">This character has no combos with starters yet.</div>;
  const correct = picked === scenario.target.id;
  return (
    <div className="stack">
      <div className="card stack">
        <div className="section-label">Situation</div>
        <h2 style={{ margin: 0 }}>You land <NotationView notation={scenario.starter} big /></h2>
        <p className="dim" style={{ margin: 0 }}>{scenario.target.situation}</p>
        <div className="section-label">Which route do you go for?</div>
        {scenario.options.map((o) => (
          <button key={o.id} className={`btn quiz-opt ${picked && o.id === scenario.target.id ? 'correct' : ''} ${picked === o.id && !correct ? 'wrong' : ''}`} onClick={() => !picked && setPicked(o.id)}>
            <NotationView notation={o.route} />
          </button>
        ))}
        {picked && <div className={`notice ${correct ? 'info' : 'bad'}`}>{correct ? 'Correct route.' : `Not this one. The listed route for ${scenario.starter} is "${scenario.target.name}".`} Now perform it below.</div>}
        <div><button className="btn" onClick={() => setRound(round + 1)}>New situation</button></div>
      </div>
      {picked && <ComboTrainer key={`${scenario.target.id}-${round}`} char={char} combo={scenario.target} mode="full" />}
    </div>
  );
}

function startsWithNotation(s: string): boolean {
  try {
    return parseNotation(s).some((x) => x.kind === 'press');
  } catch {
    return false;
  }
}
