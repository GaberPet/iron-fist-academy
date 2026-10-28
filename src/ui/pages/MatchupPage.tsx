import { useEffect, useMemo } from 'react';
import { duckable, pressure, punishable } from '../../core/matchup';
import { navigate, useRoute } from '../hooks';
import { useStore } from '../store';
import { NotationView } from '../components/Notation';

// "How to beat…": an opponent's frame data and coach notes read from your character's side.
export function MatchupPage() {
  const { char, characters, roster, ensureLoaded } = useStore();
  const route = useRoute();
  const oppId = route[1] && roster.some((r) => r.id === route[1]) ? route[1] : (roster.find((r) => r.id !== char.profile.id)?.id ?? char.profile.id);
  useEffect(() => {
    ensureLoaded([oppId]).catch(() => undefined);
  }, [oppId, ensureLoaded]);
  const opp = characters.find((c) => c.profile.id === oppId);

  const rows = useMemo(() => (opp ? punishable(opp, char.punishers) : []), [opp, char]);
  const ducks = useMemo(() => (opp ? duckable(opp) : []), [opp]);
  const plus = useMemo(() => (opp ? pressure(opp) : []), [opp]);
  const oppName = roster.find((r) => r.id === oppId)?.name ?? oppId;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>How to beat {oppName}</h1>
          <p>Playing as {char.profile.name}. What to punish, what to duck and what to respect, from {oppName}'s frame data and coach notes. Your punishers come from {char.profile.short}'s punisher table.</p>
        </div>
        <label className="field">
          <span>Opponent</span>
          <select name="opponent" value={oppId} onChange={(e) => navigate('matchup', e.target.value)}>
            {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </div>

      {!opp ? (
        <div className="loading"><div><div className="spinner" />Loading {oppName}…</div></div>
      ) : (
        <>
          <section className="card stack">
            <h2>Their game plan</h2>
            <p>{opp.profile.playstyle}</p>
            {opp.profile.weaknesses.length > 0 && (
              <>
                <h3>Where they are weak</h3>
                <ul>{opp.profile.weaknesses.map((w) => <li key={w}>{w}</li>)}</ul>
              </>
            )}
          </section>

          <section className="card stack">
            <h2>Their key moves and how to beat them</h2>
            <div className="list" role="list">
              {opp.keyMoves.map((k) => (
                <div key={k.id} role="listitem" className="list-item move-row">
                  <span className="move-input"><NotationView notation={k.id} /></span>
                  <span className="small"><b>{k.summary}</b> {k.counterplay}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card stack">
            <h2>Punish these</h2>
            <p className="small muted">Moves that are -10 or worse when you block them, worst first. Lows are punished with while-standing moves.</p>
            <div className="list" role="list">
              {rows.map(({ move, punisher }) => (
                <div key={move.id} role="listitem" className="list-item move-row">
                  <span className="move-input"><NotationView notation={move.id} /></span>
                  <span className="move-meta small">
                    <b>{move.block} on block</b>
                    <span>{move.hitLevels.join(',')}</span>
                    <span>{punisher ? <>punish with <b>{punisher.moveId}</b> ({punisher.stance === 'crouching' ? 'while standing up' : 'standing'}, {punisher.window})</> : 'no punisher listed for this window'}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card stack">
            <h2>Duck these</h2>
            <p className="small muted">Strings that end in a high: crouch the last hit and punish while standing up.</p>
            <div className="list" role="list">
              {ducks.length ? ducks.map((m) => (
                <div key={m.id} role="listitem" className="list-item move-row">
                  <span className="move-input"><NotationView notation={m.id} /></span>
                  <span className="move-meta small"><span>{m.hitLevels.join(',')}</span><span>{m.block || '—'} on block</span></span>
                </div>
              )) : <p className="small muted">No strings that end in a high.</p>}
            </div>
          </section>

          <section className="card stack">
            <h2>Respect these</h2>
            <p className="small muted">Plus on block: after blocking one, it is still their turn. Block, step or duck instead of pressing a button.</p>
            <div className="list" role="list">
              {plus.length ? plus.map((m) => (
                <div key={m.id} role="listitem" className="list-item move-row">
                  <span className="move-input"><NotationView notation={m.id} /></span>
                  <span className="move-meta small"><b>{m.block} on block</b><span>{m.hitLevels.join(',')}</span></span>
                </div>
              )) : <p className="small muted">No plus-on-block mids or highs in the data.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
