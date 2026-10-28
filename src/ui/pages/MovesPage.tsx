import { useMemo, useState } from 'react';
import type { CharacterData, Move } from '../../types';
import { classifySafety, firstHitLevel, SAFETY_TEXT, type Safety } from '../../core/frames';
import { lookupMove } from '../../data';
import { hrefTo, rowClick } from '../hooks';
import { useStore } from '../store';
import { MoveCard, SafetyBadge } from '../components/MoveCard';

export function MovesPage({ moveId }: { moveId?: string }) {
  const { char } = useStore();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [safety, setSafety] = useState<'all' | Safety>('all');
  const [keyOnly, setKeyOnly] = useState(false);
  const [role, setRole] = useState('all');
  const selected = moveId ? lookupMove(char, moveId) : undefined;
  const keyIds = new Set(char.keyMoves.map((k) => k.id));
  const roles = [...new Set(char.keyMoves.flatMap((k) => k.roles))].sort();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return char.frames.moves.filter((m) => {
      if (keyOnly && !keyIds.has(m.id)) return false;
      if (role !== 'all' && !char.keyMoves.find((k) => k.id === m.id)?.roles.includes(role as never)) return false;
      if (level !== 'all' && firstHitLevel(m) !== level) return false;
      if (safety !== 'all' && classifySafety(m) !== safety) return false;
      if (s && !(`${m.id} ${m.name} ${m.alt.join(' ')} ${m.notes}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [char, q, level, safety, keyOnly, role]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Move library · {char.profile.name}</h1>
          <p>{char.frames.moves.length} moves with frame data from {char.frames.source.name} (fetched {char.frames.source.fetchedAt?.slice(0, 10)}). Coach notes are labelled separately as strategic advice. Found a wrong value? Correct it in the detail panel: your edit is stored locally and marked as yours.</p>
        </div>
      </div>
      <div className="row">
        <input type="search" placeholder="Search input, name or notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} aria-label="Search moves" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Hit level">
          <option value="all">All hit levels</option><option value="high">High</option><option value="mid">Mid</option><option value="low">Low</option><option value="throw">Throw</option>
        </select>
        <select value={safety} onChange={(e) => setSafety(e.target.value as Safety | 'all')} aria-label="Safety">
          <option value="all">Any safety</option>
          {(['plus', 'safe', 'punishable', 'launch-punishable', 'varies'] as Safety[]).map((s) => <option key={s} value={s}>{SAFETY_TEXT[s]}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="all">Any role</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="row small dim"><input type="checkbox" checked={keyOnly} onChange={(e) => setKeyOnly(e.target.checked)} /> Key moves only</label>
        <span className="right small muted">{list.length} shown</span>
      </div>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' }}>
        <div className="card tight scroll" style={{ maxHeight: 'calc(100vh - 260px)' }}>
          {list.length ? (
            <table className="data">
              <thead><tr><th>Input</th><th>Name</th><th>Lvl</th><th>Startup</th><th>Block</th><th>Hit</th><th>Dmg</th></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className={`clickable ${selected?.id === m.id ? 'sel' : ''}`} onClick={rowClick('moves', m.id)}>
                    <td className="mono">{keyIds.has(m.id) && <span title="Key move" aria-label="Key move" style={{ color: 'var(--char)' }}>★ </span>}<a className="row-link" href={hrefTo('moves', m.id)} aria-current={selected?.id === m.id ? 'true' : undefined}>{m.id}</a></td>
                    <td>{m.name || <span className="muted">—</span>}</td>
                    <td className="mono">{m.hitLevels.join(',')}</td>
                    <td className="mono">{m.startup}</td>
                    <td className="mono">{m.block} </td>
                    <td className="mono">{m.hit}</td>
                    <td className="mono">{m.damage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">No moves match these filters.</div>}
        </div>
        <div className="stack">
          {selected ? (
            <>
              <MoveCard c={char} m={selected} />
              <OverrideEditor c={char} m={selected} />
            </>
          ) : moveId ? (
            <div className="notice warn">"{moveId}" isn't in {char.profile.name}'s imported move list.</div>
          ) : (
            <div className="empty">Select a move to see frame data, safety and coach notes.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverrideEditor({ c, m }: { c: CharacterData; m: Move }) {
  const { overrides, setOverride } = useStore();
  const existing = overrides[c.profile.id]?.[m.id];
  const [open, setOpen] = useState(false);
  const fields = ['startup', 'block', 'hit', 'ch', 'damage'] as const;
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const begin = () => {
    setVals(Object.fromEntries(fields.map((f) => [f, String(m[f] ?? '')])));
    setNote(existing?.note ?? '');
    setOpen(true);
  };
  if (!open)
    return (
      <div className="row">
        <button className="btn sm" onClick={begin}>✎ Correct this data</button>
        {existing && <button className="btn sm danger" onClick={() => setOverride(c.profile.id, m.id, null)}>Revert to source</button>}
      </div>
    );
  return (
    <div className="card stack">
      <h3>Correct frame data</h3>
      <p className="small dim" style={{ margin: 0 }}>Use the same format as the source (e.g. <code>i15</code>, <code>-12</code>, <code>+27a (+17)</code>). Verify in Tekken 8 Practice mode's frame data display before saving. Edits stay on this computer and are marked "Edited by you".</p>
      <div className="grid g3">
        {fields.map((f) => (
          <label key={f} className="field">{f}<input type="text" value={vals[f] ?? ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} /></label>
        ))}
      </div>
      <label className="field">Why / where verified<input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. checked in Practice mode, patch 2.x" /></label>
      <div className="row">
        <button className="btn primary" onClick={() => {
          const changed = Object.fromEntries(fields.filter((f) => vals[f] !== String(m[f] ?? '')).map((f) => [f, vals[f]]));
          setOverride(c.profile.id, m.id, { fields: { ...(existing?.fields ?? {}), ...changed }, note, updatedAt: new Date().toISOString() });
          setOpen(false);
        }}>Save correction</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export { SafetyBadge };
