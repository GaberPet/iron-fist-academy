import { Component, type ReactNode } from 'react';
import { navigate, useControllerStatus, useRoute } from './hooks';
import { useStore } from './store';
import { HomePage } from './pages/HomePage';
import { CharactersPage } from './pages/CharactersPage';
import { AcademyPage } from './pages/AcademyPage';
import { MovesPage } from './pages/MovesPage';
import { ComboLabPage } from './pages/ComboLabPage';
import { PunishPage } from './pages/PunishPage';
import { DojoPage } from './pages/DojoPage';
import { ControllerPage } from './pages/ControllerPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { CompanionPage } from './pages/CompanionPage';

const NAV: { id: string; label: string; icon: string; sep?: boolean }[] = [
  { id: 'home', label: 'Dashboard', icon: '⌂' },
  { id: 'characters', label: 'Characters', icon: '♛' },
  { id: 'academy', label: 'Academy', icon: '◈' },
  { id: 'moves', label: 'Move Library', icon: '☰' },
  { id: 'combos', label: 'Combo Lab', icon: '⚡' },
  { id: 'punish', label: 'Punishment', icon: '✦' },
  { id: 'dojo', label: 'Bot Dojo', icon: '⚔' },
  { id: 'companion', label: 'In Tekken 8', icon: '⎚', sep: true },
  { id: 'controller', label: 'Controller', icon: '🎮' },
  { id: 'progress', label: 'Progress', icon: '▤' },
  { id: 'settings', label: 'Settings & Data', icon: '⚙' },
];

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
  const { roster, char, setActiveChar, saveError, isCurated, loadingIds, dataNotice, dismissDataNotice } = useStore();
  const { pads, active } = useControllerStatus();
  const pad = pads.find((p) => p.index === active);
  const curated = roster.filter((r) => isCurated(r.id));
  const others = roster.filter((r) => !isCurated(r.id));
  return (
    <>
      <div className="topbar">
        <label className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: char.profile.color }} />
          <select value={char.profile.id} onChange={(e) => setActiveChar(e.target.value)} aria-label="Character" style={{ fontWeight: 700, minWidth: 200 }}>
            <optgroup label="With full curriculum">
              {curated.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Frame data, combos & punishers">
              {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
        </label>
        {loadingIds.length > 0 && <span className="small muted">Loading {loadingIds.length} character{loadingIds.length > 1 ? 's' : ''}…</span>}
        <span className="spacer" />
        {saveError && <span className="badge bad" title={saveError}>Save failed</span>}
        <button className="pill" onClick={() => navigate('controller')} style={{ cursor: 'pointer', color: 'var(--text)' }}>
          <span className={`dot ${pad ? 'on' : 'off'}`} />
          {pad ? pad.label : 'No controller'}
        </button>
      </div>
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
  const { char } = useStore();
  const page = route[0];
  const content = (() => {
    switch (page) {
      case 'characters': return <CharactersPage />;
      case 'academy': return <AcademyPage lessonId={route[1]} />;
      case 'moves': return <MovesPage moveId={route[1]} />;
      case 'combos': return <ComboLabPage comboId={route[1]} focusStep={route[2] !== undefined ? Number(route[2]) : undefined} />;
      case 'punish': return <PunishPage />;
      case 'dojo': return <DojoPage drill={route[1]} />;
      case 'companion': return <CompanionPage />;
      case 'controller': return <ControllerPage />;
      case 'progress': return <ProgressPage />;
      case 'settings': return <SettingsPage />;
      default: return <HomePage />;
    }
  })();
  return (
    <div className="app" style={{ ['--char' as string]: char.profile.color }}>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <div className="brand-mark">IF</div>
          <div>
            <div className="brand-name">Iron Fist Academy</div>
            <div className="brand-sub">Unofficial Tekken 8 coach</div>
          </div>
        </div>
        {NAV.map((n) => (
          <div key={n.id}>
            {n.sep && <div className="nav-sep" />}
            <button className={`nav-btn ${page === n.id || (page === 'home' && n.id === 'home') ? 'active' : ''}`} onClick={() => navigate(n.id)}>
              <span className="nav-ico" aria-hidden>{n.icon}</span>
              <span className="lbl">{n.label}</span>
            </button>
          </div>
        ))}
        <div className="sidebar-foot">
          Not affiliated with Bandai Namco. Frame data: Wavu Wiki (CC0).
          <br />Controller: D-pad navigates, ✕ selects, ○ goes back. In trainers, Options goes back.
        </div>
      </nav>
      <div className="main">
        <TopBar />
        <main className="content">
          <div className="page">
            <ErrorBoundary resetKey={route.join('/')}>{content}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
