import { useStore } from '../store';
import { NotationView } from '../components/Notation';
import { navigate } from '../hooks';
import { RosterTiles } from '../components/RosterTiles';

export function CharactersPage() {
  const { roster, char, isCurated, data } = useStore();
  const p = char.profile;
  const curated = isCurated(p.id);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Characters</h1>
          <p>The full Tekken 8 roster from Wavu Wiki ({roster.length} characters, data from {data.manifest.generatedAt.slice(0, 10)}). Every character has frame data, combos, punishers, quizzes and bot drills. Characters marked <span className="badge char">Curriculum</span> also have a full lesson path and coach notes. Progress is stored per character.</p>
        </div>
      </div>
      <RosterTiles />

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
