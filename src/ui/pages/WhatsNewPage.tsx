// "What's new": the history of automatic data updates from Wavu Wiki (public/data/changelog.json).
import { useState } from 'react';
import type { ChangelogCharacter } from '../../types';
import { isRecent } from '../../data';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { NotationView } from '../components/Notation';

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summary(c: ChangelogCharacter): string {
  if (c.newCharacter) return `New character: ${plural(c.totals.moves ?? 0, 'move')}, ${plural(c.totals.combos ?? 0, 'combo')}`;
  const t = c.totals;
  const parts = [
    t.combosAdded ? `+${plural(t.combosAdded, 'combo')}` : '',
    t.combosRemoved ? `−${plural(t.combosRemoved, 'combo')}` : '',
    t.movesChanged ? `${plural(t.movesChanged, 'move')} with new frame data` : '',
    t.movesAdded ? `+${plural(t.movesAdded, 'move')}` : '',
    t.movesRemoved ? `−${plural(t.movesRemoved, 'move')}` : '',
    c.punishersChanged ? 'punishers updated' : '',
    c.otherChanges ? 'overview or notes edited' : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Updated';
}

function CharacterChange({ c }: { c: ChangelogCharacter }) {
  const { setActiveChar, char } = useStore();
  const [open, setOpen] = useState(false);
  const hasDetail = !!(c.combosAdded?.length || c.combosRemoved?.length || c.movesChanged?.length || c.movesAdded?.length || c.movesRemoved?.length);
  // The route keeps the id, so it resolves as soon as the character's data has loaded.
  const go = (page: string, id?: string) => {
    if (char.profile.id !== c.id) setActiveChar(c.id);
    if (id) navigate(page, id);
    else navigate(page);
  };
  return (
    <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <div className="row">
        <b>{c.name}</b>
        {c.newCharacter && <span className="badge good">New character</span>}
        <span className="small dim">{summary(c)}</span>
        <span className="right" />
        {hasDetail && <button className="btn sm ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Details'}</button>}
        <button className="btn sm" onClick={() => go(c.combosAdded?.length ? 'combos' : 'moves')}>Open</button>
      </div>
      {open && (
        <div className="stack" style={{ marginTop: 8 }}>
          {!!c.combosAdded?.length && (
            <div>
              <h4>New combos</h4>
              {c.combosAdded.map((x) => (
                <div key={x.id} className="row small" style={{ marginBottom: 4 }}>
                  <span className="muted">{x.section}{x.starters[0] ? ` · ${x.starters[0]}` : ''}</span>
                  <NotationView notation={x.route} />
                  <button className="btn sm ghost" onClick={() => go('combos', x.id)}>Practise →</button>
                </div>
              ))}
            </div>
          )}
          {!!c.combosRemoved?.length && (
            <div>
              <h4>Removed from the wiki</h4>
              {c.combosRemoved.map((x, i) => <div key={i} className="small mono dim">{x.starters[0] ? `${x.starters[0]}: ` : ''}{x.route}</div>)}
            </div>
          )}
          {!!c.movesChanged?.length && (
            <div>
              <h4>Frame data changes</h4>
              <table className="data">
                <thead><tr><th>Move</th><th>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>
                  {c.movesChanged.flatMap((m) => Object.entries(m.fields).map(([f, [a, b]]) => (
                    <tr key={`${m.id}-${f}`} className="clickable" onClick={() => go('moves', m.id)}>
                      <td className="mono">{m.id}</td><td>{f}</td><td className="mono">{a || '—'}</td><td className="mono">{b || '—'}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
          {!!(c.movesAdded?.length || c.movesRemoved?.length) && (
            <div className="small dim">
              {!!c.movesAdded?.length && <div>Added moves: <span className="mono">{c.movesAdded.join(' · ')}</span></div>}
              {!!c.movesRemoved?.length && <div>Removed moves: <span className="mono">{c.movesRemoved.join(' · ')}</span></div>}
            </div>
          )}
          {Object.values(c.totals).some((n) => n > 40) && <div className="small muted">Long lists are shortened to 40 items; the totals above are exact.</div>}
        </div>
      )}
    </div>
  );
}

export function WhatsNewPage() {
  const { changelog, data, roster } = useStore();
  const entries = changelog?.entries ?? [];
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>What's new</h1>
          <p>
            Character data is re-imported from <a href="https://wavu.wiki" target="_blank" rel="noreferrer">Wavu Wiki</a> automatically every day. When the community updates the wiki after a patch or adds combos, the changes appear here, and in the app, without an app update. Current data: <b>{data.manifest.generatedAt.slice(0, 10)}</b> · {roster.length} characters.
          </p>
        </div>
      </div>
      {changelog === null && <div className="empty">Loading update history…</div>}
      {changelog && entries.length === 0 && <div className="empty">No update history yet.</div>}
      {entries.map((e) => (
        <section key={e.at} className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>{new Date(`${e.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</h2>
            {isRecent(e.date) && <span className="badge good">This week</span>}
            <span className="right small muted">{e.initial ? 'Initial import' : plural(e.characters.length, 'character')}</span>
          </div>
          {e.summary && <p className="dim" style={{ margin: 0 }}>{e.summary}</p>}
          <div className="list">{e.characters.map((c) => <CharacterChange key={c.id} c={c} />)}</div>
        </section>
      ))}
      <div className="source-line">Changes are detected by comparing each day's import with the previous one. If a change looks wrong, it's usually a wiki edit: fix it on Wavu Wiki and the next daily run picks it up, or correct the value locally in the Move Library.</div>
    </div>
  );
}
