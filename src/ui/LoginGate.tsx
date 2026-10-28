import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { storage, setProfile, setPersist, canPersist } from '../runtime/storage';
import { Logo, Wordmark } from './components/Logo';
import { PrivacyPage } from './pages/PrivacyPage';

// Players on this device. No passwords: this only keeps each player's progress apart, it is not security.
interface Player { id: string; name: string; createdAt: string }
const SESSION_KEY = 'ironfist:player';
const CONSENT_KEY = 'ironfist:consent';
type Consent = 'all' | 'none';
let current: Player | null = null;

function readConsent(): Consent | null {
  if (storage.isElectron()) return 'all'; // installed app: data files on the user's own computer
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null')?.choice;
    return c === 'all' || c === 'none' ? c : null;
  } catch {
    return null;
  }
}

/** Forget the storage choice and ask again. */
export function changeConsent() {
  try { localStorage.removeItem(CONSENT_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  location.reload();
}

export const currentPlayer = () => current;

export function switchPlayer() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode: nothing to clear */ }
  location.reload();
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(readConsent);
  if (!consent) return <ConsentForm onChoose={setConsent} />;
  setPersist(consent === 'all');
  return <SignIn>{children}</SignIn>;
}

function ConsentForm({ onChoose }: { onChoose: (c: Consent) => void }) {
  const choose = (choice: Consent) => {
    // Remembering the choice itself is strictly necessary, so it is stored either way.
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString() })); } catch { /* asked again next visit */ }
    onChoose(choice);
  };
  return (
    <main className="login">
      <div className="login-card stack">
        <div className="login-brand"><Logo tone="white" /></div>
        <h1>Your data on this device</h1>
        <p>Iron Fist Academy uses no cookies, no trackers and no adverts. To save your training it keeps a few items in this browser's storage. Nothing is sent to us or anyone else.</p>
        <table className="consent-table">
          <thead><tr><th scope="col">What</th><th scope="col">Why</th><th scope="col">How long</th></tr></thead>
          <tbody>
            <tr><td>Players list</td><td>Shows your players on the sign-in page</td><td>Until you clear site data</td></tr>
            <tr><td>Progress, settings, move edits</td><td>Saves each player's academy progress</td><td>Until you clear site data</td></tr>
            <tr><td>Signed-in player</td><td>Keeps you signed in while the tab is open</td><td>Until the tab closes</td></tr>
            <tr><td>Sound on or off</td><td>Remembers your fight sound choice</td><td>Until you clear site data</td></tr>
            <tr><td>This choice</td><td>So we don't ask every visit</td><td>Until you change it in Settings</td></tr>
          </tbody>
        </table>
        <p className="small muted">Frame data and 3D models are loaded from this same site. If you choose not to save, everything works but your progress is lost when you close the tab. You can change your choice any time in Settings and data.</p>
        <details className="small"><summary>Read the full privacy policy</summary><PrivacyPage /></details>
        <div className="row">
          <button className="btn primary" onClick={() => choose('all')}>Allow saving</button>
          <button className="btn" onClick={() => choose('none')}>Don't save anything</button>
        </div>
      </div>
    </main>
  );
}

function SignIn({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const enter = (p: Player, list: Player[]) => {
    setProfile(p.id, list[0]?.id === p.id);
    current = p;
    try { if (canPersist()) sessionStorage.setItem(SESSION_KEY, p.id); } catch { /* stays signed in for this page only */ }
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
        <p className="muted">{canPersist() ? 'Pick your player to carry on where you left off. Your academy progress is saved for each player on this device.' : 'Saving is off, so this player and their progress last only until you close the tab.'}</p>
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
        <details className="small"><summary>Privacy policy</summary><PrivacyPage /></details>
      </div>
    </main>
  );
}
