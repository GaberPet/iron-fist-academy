import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { NotationView } from '../components/Notation';
import { navigate } from '../hooks';
import { isRecent } from '../../data';
import { CharacterArt, type ArtVariant } from '../components/CharacterArt';

const VARIANTS: { id: ArtVariant; label: string; note: string }[] = [
  { id: 'photo', label: 'Motif photos', note: 'A real, freely licensed photo of something tied to each character (credited on the Credits page). Not official art.' },
  { id: 'emblem', label: 'Emblem and colour', note: 'A geometric emblem generated from the name, in the character\'s own colour.' },
  { id: 'silhouette', label: 'Stance silhouettes', note: 'Original fighting-stance silhouettes (four poses, mirrored), over the character\'s colour.' },
  { id: 'type', label: 'Typographic', note: 'Initials set huge in the display face over a striped field.' },
  { id: 'mix', label: 'Emblem and initials', note: 'The emblem dimmed behind, big initials on top.' },
];

/** Side-by-side comparison of the three card styles on six characters. */
export function CardDemo() {
  const { roster, settings, updateSettings } = useStore();
  const sample = ['anna', 'armor-king', 'paul', 'kazuya', 'lili', 'jack-8'].map((id) => roster.find((r) => r.id === id)).filter(Boolean) as typeof roster;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Card styles</h1>
          <p>Three original styles for the character select. None uses game art. Pick one and it applies to all {roster.length} characters.</p>
        </div>
        <button className="btn" onClick={() => navigate('characters')}>Back to characters</button>
      </div>
      {VARIANTS.map((v) => (
        <section key={v.id} className="card stack">
          <div className="card-title">
            <div>
              <h2>{v.label}</h2>
              <p className="dim small" style={{ margin: 0 }}>{v.note}</p>
            </div>
            {settings.cardStyle === v.id ? <span className="badge char">In use</span> : <button className="btn primary" onClick={() => updateSettings({ cardStyle: v.id })}>Use this style</button>}
          </div>
          <div className="roster">
            {sample.map((c) => (
              <div key={c.id} className="char-card">
                <div className="char-art"><CharacterArt id={c.id} name={c.name} variant={v.id} /></div>
                <div className="char-info">
                  <span className="char-name">{c.name}</span>
                  <span className="char-meta">{c.counts.moves} moves, {c.counts.combos} combos</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function CharactersPage() {
  const { roster, char, setActiveChar, progress, isCurated, data, settings } = useStore();
  const [q, setQ] = useState('');
  const p = char.profile;
  const curated = isCurated(p.id);
  const mastered = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(progress.lessons)) if (v.mastered) m.set(k.split(':')[0], (m.get(k.split(':')[0]) ?? 0) + 1);
    return m;
  }, [progress.lessons]);
  const shown = roster.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Characters</h1>
          <p>The full Tekken 8 roster from Wavu Wiki ({roster.length} characters, data from {data.manifest.generatedAt.slice(0, 10)}). Every character has frame data, combos, punishers, quizzes and bot drills. Characters marked <span className="badge char">Curriculum</span> also have a full lesson path and coach notes. Progress is stored per character.</p>
        </div>
        <input type="search" placeholder="Find a character…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a character" />
      </div>
      <div className="row small dim">
        Card style: {VARIANTS.find((v) => v.id === settings.cardStyle)?.label}
        <button className="btn sm ghost" onClick={() => navigate('characters', 'demo')}>Compare styles</button>
      </div>
      <div className="roster">
        {shown.map((c) => (
          <button key={c.id} className={`char-card ${c.id === char.profile.id ? 'sel' : ''}`} onClick={() => setActiveChar(c.id)} aria-pressed={c.id === char.profile.id}>
            <div className="char-art"><CharacterArt id={c.id} name={c.name} variant={settings.cardStyle} /></div>
            <div className="char-info">
              <span className="char-name">{c.name}</span>
              <span className="char-meta">{c.counts.moves} moves, {c.counts.combos} combos</span>
              <span className="char-tags">
                {isRecent(c.addedAt) && <span className="badge good">New</span>}
                {isCurated(c.id) && <span className="badge char">Curriculum</span>}
                {mastered.get(c.id) ? <span className="badge good">{mastered.get(c.id)} mastered</span> : null}
              </span>
            </div>
          </button>
        ))}
      </div>
      {!shown.length && <div className="empty">No character matches "{q}".</div>}

      <div className="grid g2">
        <div className="card stack">
          <h2 style={{ color: p.color }}>{p.name}: overview</h2>
          <p className="dim">{p.overview}</p>
          {(p.strengths.length > 0 || p.weaknesses.length > 0) && (
            <div className="grid g2">
              <div>
                <h4>Strengths</h4>
                <ul className="dim small" style={{ paddingLeft: 18 }}>{p.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div>
                <h4>Weaknesses</h4>
                <ul className="dim small" style={{ paddingLeft: 18 }}>{p.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            </div>
          )}
          {!curated && <div className="notice info">No curriculum for {p.name} yet: the Academy shows the shared fundamentals, and every other page works with {p.name}'s imported data. Want to write one? See CONTRIBUTING.md → "Adding a character".</div>}
          <div className="source-line">{curated ? 'Summarised from' : 'Imported from'}: {p.sources.map((s, i) => <span key={s.url + i}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)}</div>
        </div>
        <div className="card stack">
          <h3>Stances</h3>
          {p.stances.length ? (
            <table className="data">
              <thead><tr><th>Code</th><th>Name</th><th>Entry</th>{curated && <th>Notes</th>}</tr></thead>
              <tbody>{p.stances.map((s) => <tr key={s.code + s.entry}><td className="mono">{s.code}</td><td>{s.name}</td><td>{s.entry && <><NotationView notation={s.entry.split(' ')[0]} showText={false} /> <span className="mono small">{s.entry}</span></>}</td>{curated && <td className="small dim">{s.note}</td>}</tr>)}</tbody>
            </table>
          ) : <div className="small muted">No stances listed on the source.</div>}
          <h3>Heat</h3>
          {p.heat.length ? <ul className="dim small" style={{ paddingLeft: 18, margin: 0 }}>{p.heat.map((s) => <li key={s}>{s}</li>)}</ul> : <div className="small muted">Not listed on the source.</div>}
          {p.heatEngagers.length > 0 && <div className="row small"><b>Heat Engagers:</b> {p.heatEngagers.map((h) => <button key={h} className="btn sm" onClick={() => navigate('moves', h)}>{h}</button>)}</div>}
          {p.keyLaunchers.length > 0 && <div className="row small"><b>Key launchers:</b> {p.keyLaunchers.map((h) => <button key={h} className="btn sm" onClick={() => navigate('moves', h)}>{h}</button>)}</div>}
        </div>
      </div>
    </div>
  );
}
