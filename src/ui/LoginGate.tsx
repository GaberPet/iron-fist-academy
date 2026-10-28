import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { storage, setProfile } from '../runtime/storage';
import { Logo, Wordmark } from './components/Logo';

// Players on this device. No passwords: this only keeps each player's progress apart, it is not security.
interface Player { id: string; name: string; createdAt: string }
const SESSION_KEY = 'ironfist:player';
let current: Player | null = null;

export const currentPlayer = () => current;

export function switchPlayer() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode: nothing to clear */ }
  location.reload();
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const enter = (p: Player, list: Player[]) => {
    setProfile(p.id, list[0]?.id === p.id);
    current = p;
    try { sessionStorage.setItem(SESSION_KEY, p.id); } catch { /* stays signed in for this page only */ }
    setPlayer(p);
  };

  useEffect(() => {
    storage.loadShared<Player[]>('profiles').then((l) => {
      const list = Array.isArray(l) ? l : [];
      let id: string | null = null;
      try { id = sessionStorage.getItem(SESSION_KEY); } catch { /* ignore */ }
      const p = list.find((x) => x.id === id);
      if (p) enter(p, list);
      setPlayers(list);
    }, () => setPlayers([]));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Enter a player name.');
    if (players!.some((p) => p.name.toLowerCase() === n.toLowerCase())) return setError('That name is taken on this device. Pick it from the list instead.');
    const p: Player = { id: Date.now().toString(36), name: n.slice(0, 32), createdAt: new Date().toISOString() };
    const list = [...players!, p];
    try {
      await storage.saveShared('profiles', list);
    } catch (err) {
      return setError(`Could not save the player: ${(err as Error).message}`);
    }
    setPlayers(list);
    enter(p, list);
  };

  if (player) return <>{children}</>;
  if (!players) return <div className="loading"><div><div className="spinner" />Loading…</div></div>;

  return (
    <main className="login">
      <div className="login-card stack">
        <div className="login-brand"><Logo tone="white" /><Wordmark /></div>
        <h1>Sign in</h1>
        <p className="muted">Pick your player to carry on where you left off. Your academy progress is saved for each player on this device.</p>
        {players.length > 0 && (
          <div className="list" role="list" aria-label="Players">
            {players.map((p) => (
              <button key={p.id} role="listitem" className="list-item" onClick={() => enter(p, players)}>
                <b>{p.name}</b>
              </button>
            ))}
          </div>
        )}
        <form className="stack" onSubmit={create}>
          <label className="field">
            <span>{players.length ? 'New player' : 'Player name'}</span>
            <input name="player" autoComplete="off" spellCheck={false} maxLength={32} placeholder="e.g. Jin…" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
          </label>
          {error && <p className="notice warn" role="alert">{error}</p>}
          <button className="btn primary" type="submit">Create player and start</button>
        </form>
      </div>
    </main>
  );
}
