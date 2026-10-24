import type { CharacterData, Move } from '../../types';
import { classifySafety, hitLevelName, SAFETY_EXPLAIN, SAFETY_TEXT, type Safety } from '../../core/frames';
import { NotationView } from './Notation';
import { useStore } from '../store';

const SAFETY_BADGE: Record<Safety, string> = { plus: 'good', safe: 'good', punishable: 'warn', 'launch-punishable': 'bad', varies: 'info', unknown: '' };

export function SafetyBadge({ m }: { m: Move }) {
  const s = classifySafety(m);
  if (s === 'unknown') return null;
  return <span className={`badge ${SAFETY_BADGE[s]}`} title={SAFETY_EXPLAIN[s]}>{SAFETY_TEXT[s]}</span>;
}

export function SourceLine({ c, m }: { c: CharacterData; m?: Move }) {
  const { overrides } = useStore();
  const o = m ? overrides[c.profile.id]?.[m.id] : undefined;
  const src = c.frames.source;
  return (
    <div className="source-line">
      {o ? (
        <span className="badge warn" title={o.note}>Edited by you {o.updatedAt.slice(0, 10)}</span>
      ) : (
        <span className="badge info">Source data</span>
      )}{' '}
      Frame data: <a href={src.url} target="_blank" rel="noreferrer">{src.name}</a>
      {src.revision ? ` rev ${src.revision}` : ''} · {src.license} · fetched {src.fetchedAt?.slice(0, 10)}
    </div>
  );
}

export function MoveCard({ c, m, compact }: { c: CharacterData; m: Move; compact?: boolean }) {
  const note = c.keyMoves.find((k) => k.id === m.id);
  const rows: [string, string][] = [
    ['Startup', m.startup || '—'],
    ['On block', m.block || '—'],
    ['On hit', m.hit || '—'],
    ['Counter hit', m.ch || '—'],
    ['Damage', m.damage || '—'],
    ['Hit level', m.hitLevels.map(hitLevelName).join(', ') || '—'],
  ];
  if (!compact) rows.push(['Properties', m.crush || '—'], ['Recovery', m.recovery || '—']);
  return (
    <div className="card stack">
      <div className="row">
        <NotationView notation={m.id} big={!compact} />
        <SafetyBadge m={m} />
        {note?.roles.map((r) => <span key={r} className="badge">{r}</span>)}
      </div>
      <div>
        <h3 style={{ margin: 0 }}>{m.name || <span className="muted">(unnamed)</span>}</h3>
        {m.alt.length > 0 && <div className="small muted">Alternate inputs: {m.alt.join(' · ')}</div>}
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
      </dl>
      {!compact && m.notes && <p className="small dim" style={{ margin: 0 }}><b>Source notes:</b> {m.notes}</p>}
      <SourceLine c={c} m={m} />
      {!compact && classifySafety(m) !== 'unknown' && <p className="small muted" style={{ margin: 0 }}>Safety class is derived from the block value with general Tekken rules: {SAFETY_EXPLAIN[classifySafety(m)]}</p>}
      {!compact && note && (
        <div className="notice info stack">
          <div className="section-label" style={{ color: 'var(--info)' }}>Coach notes · strategic advice (not frame data)</div>
          <p style={{ margin: 0 }}><b>{note.summary}</b> {note.purpose}</p>
          <dl className="kv">
            <dt>Use it</dt><dd>{note.use}</dd>
            <dt>Avoid</dt><dd>{note.avoid}</dd>
            <dt>Counterplay</dt><dd>{note.counterplay}</dd>
            <dt>If blocked</dt><dd>{note.afterBlock}</dd>
            <dt>If it hits</dt><dd>{note.afterHit}</dd>
            <dt>If evaded</dt><dd>{note.afterEvade}</dd>
            <dt>Game plan</dt><dd>{note.gamePlan}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
