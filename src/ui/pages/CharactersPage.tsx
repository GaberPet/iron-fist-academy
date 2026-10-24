import { useStore } from '../store';
import { NotationView } from '../components/Notation';
import { navigate } from '../hooks';

export function CharactersPage() {
  const { characters, char, setActiveChar, progress } = useStore();
  const p = char.profile;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Characters</h1>
          <p>Switch freely: progress is stored per character. More characters can be added through the data files (see README).</p>
        </div>
      </div>
      <div className="grid g2">
        {characters.map((c) => {
          const n = Object.keys(progress.lessons).filter((k) => k.startsWith(`${c.profile.id}:`) && progress.lessons[k].mastered).length;
          return (
            <button key={c.profile.id} className={`char-card ${c.profile.id === char.profile.id ? 'sel' : ''}`} style={{ ['--c' as string]: c.profile.color }} onClick={() => setActiveChar(c.profile.id)}>
              <span className="glyph">{c.profile.short}</span>
              <h2 style={{ color: c.profile.color }}>{c.profile.name}</h2>
              <div className="small dim" style={{ maxWidth: '85%' }}>{c.profile.playstyle}</div>
              <div className="row" style={{ marginTop: 12 }}>
                <span className="badge">{c.frames.moves.length} moves</span>
                <span className="badge">{c.combos.length} combos</span>
                <span className="badge">{c.lessons.length} character lessons</span>
                <span className="badge good">{n} mastered</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid g2">
        <div className="card stack">
          <h2>{p.name}: overview</h2>
          <p className="dim">{p.overview}</p>
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
          <div className="source-line">Overview, strengths and weaknesses summarised from: {p.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)}</div>
        </div>
        <div className="card stack">
          <h3>Stances</h3>
          <table className="data">
            <thead><tr><th>Code</th><th>Name</th><th>Entry</th><th>Notes</th></tr></thead>
            <tbody>{p.stances.map((s) => <tr key={s.code}><td className="mono">{s.code}</td><td>{s.name}</td><td><NotationView notation={s.entry.split(' ')[0]} showText={false} /> <span className="mono small">{s.entry}</span></td><td className="small dim">{s.note}</td></tr>)}</tbody>
          </table>
          <h3>Heat</h3>
          <ul className="dim small" style={{ paddingLeft: 18, margin: 0 }}>{p.heat.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="row small"><b>Heat Engagers:</b> {p.heatEngagers.map((h) => <button key={h} className="btn sm" onClick={() => navigate('moves', h)}>{h}</button>)}</div>
          <div className="row small"><b>Key launchers:</b> {p.keyLaunchers.map((h) => <button key={h} className="btn sm" onClick={() => navigate('moves', h)}>{h}</button>)}</div>
        </div>
      </div>
    </div>
  );
}
