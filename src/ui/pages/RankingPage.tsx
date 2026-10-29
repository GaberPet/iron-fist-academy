import { useEffect, useMemo, useState } from 'react';
import { POINTS, RANKS, rankFor, rankPoints, rankThreshold } from '../../core/rank';
import { boardKeyFor, boardLeave, boardPlace, boardSubmit, boardTop, type BoardRow } from '../../runtime/sync';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

/** Rank badge: a diamond with the rank's number, coloured by tier. */
export function RankBadge({ index, size = 56 }: { index: number; size?: number }) {
  const tier = index >= 25 ? 'gold' : index >= 15 ? 'red' : index >= 5 ? 'silver' : 'plain';
  return (
    <svg className={`rank-badge ${tier}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M50 4 L96 50 L50 96 L4 50 Z" />
      <text x="50" y="60" textAnchor="middle" fontSize="30" fontWeight="800">{index + 1}</text>
    </svg>
  );
}

export function RankingPage() {
  const { progress, settings, updateSettings } = useStore();
  const pts = useMemo(() => rankPoints(progress), [progress]);
  const rank = rankFor(pts.total);
  const joined = !!settings.boardKey && !!settings.boardName;
  const [top, setTop] = useState<BoardRow[] | null>(null);
  const [place, setPlace] = useState<{ place: number; players: number } | null>(null);
  const [name, setName] = useState(settings.boardName || currentPlayer()?.name || '');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      setTop(await boardTop());
      setPlace(joined ? await boardPlace(settings.boardKey) : null);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { refresh(); }, [joined]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    const n = name.trim().slice(0, 20);
    if (!n) return setError('Pick a name to show on the leaderboard.');
    try {
      const key = await boardKeyFor(settings.syncCode);
      await boardSubmit(key, n, pts.total);
      updateSettings({ boardKey: key, boardName: n });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const leave = async () => {
    if (!window.confirm('Leave the leaderboard? Your name and points are removed from it.')) return;
    try { await boardLeave(settings.boardKey); } catch { /* offline: the entry stays until the next leave */ }
    updateSettings({ boardKey: '', boardName: '' });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Ranking</h1>
          <p>One overall rank from all your training, on every character. Climb from Beginner to God of Destruction.</p>
        </div>
      </div>

      <section className="card stack rank-card">
        <div className="row">
          <RankBadge index={rank.index} size={72} />
          <div>
            <div className="eyebrow">Your rank</div>
            <h2 style={{ margin: 0 }}>{rank.name}</h2>
            <p className="small muted">{pts.total.toLocaleString()} points{rank.next ? ` · ${(rank.next.points - pts.total).toLocaleString()} to ${rank.next.name}` : ' · the highest rank'}</p>
          </div>
        </div>
        {rank.next && <div className="goal-bar" role="progressbar" aria-label={`Progress to ${rank.next.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.progress * 100)}><i style={{ width: `${rank.progress * 100}%` }} /></div>}
        <table className="data">
          <thead><tr><th>Points from</th><th>Count</th><th>Each</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>Lessons mastered</td><td>{pts.lessons}</td><td>{POINTS.lesson}</td><td>{pts.lessons * POINTS.lesson}</td></tr>
            <tr><td>Combos mastered</td><td>{pts.combos}</td><td>{POINTS.combo}</td><td>{pts.combos * POINTS.combo}</td></tr>
            <tr><td>Free fight wins</td><td>{pts.fightWins}</td><td>{POINTS.fightWin}</td><td>{pts.fightWins * POINTS.fightWin}</td></tr>
            <tr><td>Successful tries (quizzes, inputs, drills, combos)</td><td>{pts.successes}</td><td>{POINTS.success}</td><td>{pts.successes * POINTS.success}</td></tr>
            <tr><td>Days you trained</td><td>{pts.activeDays}</td><td>{POINTS.activeDay}</td><td>{pts.activeDays * POINTS.activeDay}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <div className="card-title">
          <h2>Leaderboard</h2>
          <button className="btn sm" onClick={refresh}>Refresh</button>
        </div>
        {error && <p className="notice warn" role="alert">{error}</p>}
        {joined ? (
          <div className="row">
            <p className="small">You are on the leaderboard as <b>{settings.boardName}</b>{place ? <>: place <b>{place.place}</b> of {place.players}</> : ''}. Your points update by themselves.</p>
            <button className="btn sm" onClick={leave}>Leave leaderboard</button>
          </div>
        ) : (
          <div className="stack">
            <p className="small">Join to compare your points with other players. Only the name you pick here and your points are shown, to everyone.</p>
            <label className="field">
              <span>Name on the leaderboard (max 20 characters, a nickname is best)</span>
              <input name="board-name" maxLength={20} autoComplete="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand this name and my points will be public.</label>
            <div className="row"><button className="btn primary" disabled={!agree || !name.trim()} onClick={join}>Join the leaderboard</button></div>
          </div>
        )}
        {top && (
          <table className="data board">
            <thead><tr><th>#</th><th>Player</th><th>Rank</th><th>Points</th></tr></thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={i} className={joined && r.name === settings.boardName && r.points === pts.total ? 'sel' : ''}>
                  <td>{i + 1}</td><td>{r.name}</td><td>{rankFor(r.points).name}</td><td>{r.points.toLocaleString()}</td>
                </tr>
              ))}
              {!top.length && <tr><td colSpan={4}>Nobody has joined yet. Be the first!</td></tr>}
            </tbody>
          </table>
        )}
        <p className="small muted">Points are worked out on each player's own device, so the board is for fun: it can't stop someone who edits their data.</p>
      </section>

      <section className="card stack">
        <h2>All ranks</h2>
        <div className="rank-ladder">
          {RANKS.map((n, i) => (
            <div key={n} className={`rank-step ${i === rank.index ? 'now' : i < rank.index ? 'done' : ''}`}>
              <RankBadge index={i} size={28} />
              <span>{n}</span>
              <span className="small muted">{rankThreshold(i).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
