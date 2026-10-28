import { currentPlayer, switchPlayer } from './LoginGate';
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { navigate, useControllerStatus, useRoute } from './hooks';
import { useStore } from './store';
import { HomePage } from './pages/HomePage';
import { CharactersPage } from './pages/CharactersPage';
import { AcademyPage } from './pages/AcademyPage';
import { MovesPage } from './pages/MovesPage';
import { ComboLabPage } from './pages/ComboLabPage';
import { PunishPage } from './pages/PunishPage';
import { DojoPage } from './pages/DojoPage';
const FightPage = lazy(() => import('./pages/FightPage').then((m) => ({ default: m.FightPage })));
import { ControllerPage } from './pages/ControllerPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { CompanionPage } from './pages/CompanionPage';
import { WhatsNewPage } from './pages/WhatsNewPage';
import { CreditsPage } from './pages/CreditsPage';
import { storage } from '../runtime/storage';
import { MatchupPage } from './pages/MatchupPage';
import { InstallPage } from './pages/InstallPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { Logo, Wordmark } from './components/Logo';
import { Icon } from './components/Icon';
import { RosterTiles } from './components/RosterTiles';
import { isRecent } from '../data';
import { fmtShortDate } from './format';

const NAV: { id: string; label: string; icon: string; sep?: boolean }[] = [
  { id: 'home', label: 'Dashboard', icon: '⌂' },
  { id: 'characters', label: 'Characters', icon: '♛' },
  { id: 'academy', label: 'Academy', icon: '◈' },
  { id: 'moves', label: 'Move library', icon: '☰' },
  { id: 'combos', label: 'Combo lab', icon: '⚡' },
  { id: 'punish', label: 'Punishment', icon: '✦' },
  { id: 'matchup', label: 'How to beat…', icon: '◎' },
  { id: 'dojo', label: 'Bot dojo', icon: '⚔' },
  { id: 'fight', label: 'Free fight', icon: '✊' },
  { id: 'updates', label: "What's new", icon: '✧', sep: true },
  { id: 'companion', label: 'In Tekken 8', icon: '⎚' },
  { id: 'controller', label: 'Controller', icon: '🎮' },
  { id: 'progress', label: 'Progress', icon: '▤' },
  { id: 'settings', label: 'Settings and data', icon: '⚙' },
  { id: 'install', label: 'Install the app', icon: '⬇', sep: true },
];
// The desktop app is the install: it has no "Install the app" tab, and gets an Uninstall button instead.
const NAV_HERE = storage.isElectron() ? NAV.filter((n) => n.id !== 'install') : NAV;

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="notice bad">
          <b>This page hit an error:</b> {this.state.error.message}
          <div className="small" style={{ marginTop: 6 }}>Your progress is safe. Try another page or restart the app.</div>
        </div>
      );
    return this.props.children;
  }
}

function TopBar() {
  const { char, saveError, loadingIds, dataNotice, dismissDataNotice } = useStore();
  const { pads, active } = useControllerStatus();
  const pad = pads.find((p) => p.index === active);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);
  return (
    <>
      <div className="topbar">
        <button className="btn char-switch" onClick={() => setPicking(true)} aria-haspopup="dialog">
          <span className="char-switch-name">{char.profile.name}</span>
          <span className="small muted">Change character</span>
        </button>
        {loadingIds.length > 0 && <span className="small muted">Loading {loadingIds.length} character{loadingIds.length > 1 ? 's' : ''}…</span>}
        <span className="spacer" />
        {saveError && <span className="badge bad" title={saveError} role="alert">Save failed: your progress could not be stored. Free some disk space or check Settings → Storage.</span>}
        <button className="pill" onClick={() => navigate('controller')} style={{ cursor: 'pointer', color: 'var(--text)' }}>
          <span className={`dot ${pad ? 'on' : 'off'}`} />
          {pad ? pad.label : 'No controller'}
        </button>
      </div>
      {picking && (
        <div className="picker-backdrop" onClick={(e) => e.target === e.currentTarget && setPicking(false)}>
          <div className="picker card" role="dialog" aria-modal="true" aria-label="Choose a character">
            <div className="card-title">
              <h2>Choose a character</h2>
              <button className="btn ghost" onClick={() => setPicking(false)}>Close</button>
            </div>
            <RosterTiles autoFocusSearch onPicked={() => setPicking(false)} />
          </div>
        </div>
      )}
      <div aria-live="polite" className="sr-only">{dataNotice ?? ''}</div>
      {dataNotice && (
        <div className="notice info row" style={{ margin: '12px 24px 0', borderRadius: 10 }}>
          <span>{dataNotice}</span>
          <button className="btn sm ghost right" onClick={dismissDataNotice}>Dismiss</button>
        </div>
      )}
    </>
  );
}

export function App() {
  const route = useRoute();
  const { changelog, data, settings } = useStore();
  const page = route[0];
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.text = settings.textSize;
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduce' : 'full';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }, [settings.theme, settings.textSize, settings.reduceMotion]);
  const recentUpdates = (changelog?.entries ?? []).filter((e) => !e.initial && isRecent(e.date)).length;
  const content = (() => {
    switch (page) {
      case 'characters': return <CharactersPage />;
      case 'academy': return <AcademyPage lessonId={route[1]} />;
      case 'moves': return <MovesPage moveId={route[1]} />;
      case 'combos': return <ComboLabPage comboId={route[1]} focusStep={route[2] !== undefined ? Number(route[2]) : undefined} />;
      case 'punish': return <PunishPage />;
      case 'matchup': return <MatchupPage />;
      case 'install': return <InstallPage />;
      case 'dojo': return <DojoPage drill={route[1]} />;
      case 'fight': return <Suspense fallback={<div className="empty">Loading the 3D arena…</div>}><FightPage /></Suspense>;
      case 'companion': return <CompanionPage />;
      case 'updates': return <WhatsNewPage />;
      case 'credits': return <CreditsPage />;
      case 'privacy': return <PrivacyPage />;
      case 'controller': return <ControllerPage />;
      case 'progress': return <ProgressPage />;
      case 'settings': return <SettingsPage />;
      default: return <HomePage />;
    }
  })();
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault(); // hash routing: focus the content instead of changing the route
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo tone="current" />
          <Wordmark />
          <span className="brand-sub">A Level Academy programme</span>
        </div>
        {NAV_HERE.map((n) => (
          <div key={n.id}>
            {n.sep && <div className="nav-sep" />}
            <button className={`nav-btn ${page === n.id || (page === 'home' && n.id === 'home') ? 'active' : ''}`} onClick={() => navigate(n.id)}>
              <Icon name={n.id} />
              <span className="lbl">{n.label}</span>
              {n.id === 'updates' && recentUpdates > 0 && <span className="badge good right" title="Data updates in the last 7 days">{recentUpdates}</span>}
            </button>
          </div>
        ))}
        <div className="sidebar-foot">
          <span className="player-line">Player: <b>{currentPlayer()?.name}</b> · <button className="link-btn" onClick={switchPlayer}>Switch player</button></span>
          <br />
          <button className="btn ghost sm" style={{ padding: '2px 0', fontSize: 11, color: 'var(--text-2)' }} onClick={() => navigate('updates')} title="See what changed">
            Data updated {fmtShortDate(data.manifest.generatedAt)}
          </button>
          <br />Not affiliated with Bandai Namco. Frame data: Wavu Wiki (CC0).{' '}
          <a href="#/credits">Credits</a> · <a href="#/privacy">Privacy</a>
          <br />Controller: D-pad navigates, ✕ selects, ○ goes back. In trainers, Options goes back.
        </div>
        {storage.isElectron() && (
          <button className="btn uninstall-btn" onClick={() => storage.uninstall()} title="Remove Iron Fist Academy from this computer">
            <span aria-hidden>✕</span> <span className="lbl">Uninstall</span>
          </button>
        )}
      </nav>
      <div className="main">
        <TopBar />
        <main className="content" id="main" tabIndex={-1}>
          <div className="page">
            <ErrorBoundary resetKey={route.join('/')}>{content}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
