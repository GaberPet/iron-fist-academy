import { useState } from 'react';
import qrcode from 'qrcode-generator';
import { cleanCode, newCode, pull, showCode } from '../../runtime/sync';
import { storage } from '../../runtime/storage';
import { fmtTime } from '../format';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

const SITE = 'https://gaberpet.github.io/iron-fist-academy/';
export const joinLink = (code: string) => `${storage.isElectron() ? SITE : location.origin + location.pathname}#/sync/${code}`;

/** Settings: sync this player's progress between the website, the desktop app and the phone. */
export function SyncCard() {
  const { settings, updateSettings, sync, syncNow } = useStore();
  const code = settings.syncCode;
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showing, setShowing] = useState(false);

  const join = async () => {
    const c = cleanCode(input);
    if (!c) return setError('That is not a sync code. It has 26 letters and numbers, like ABCD-EFGH-…');
    try {
      if (!(await pull(c))) return setError('No progress was found for that code. Check it, or turn on sync on the other device first.');
    } catch (e) {
      return setError((e as Error).message);
    }
    setError('');
    setInput('');
    updateSettings({ syncCode: c });
  };

  if (!code) {
    return (
      <div className="card stack">
        <h3>Sync between devices</h3>
        <p className="small">Keep <b>{currentPlayer()?.name}</b>'s progress the same on the website, the desktop app and your phone, automatically. It uses a private sync code instead of an account.</p>
        <div className="row"><button className="btn primary" onClick={() => updateSettings({ syncCode: newCode() })}>Turn on sync</button></div>
        <label className="field">
          <span>Already synced on another device? Enter its code</span>
          <input name="sync-code" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH-…" value={input} onChange={(e) => { setInput(e.target.value); setError(''); }} />
        </label>
        <div className="row"><button className="btn" onClick={join} disabled={!input.trim()}>Join</button></div>
        {error && <p className="notice warn" role="alert">{error}</p>}
      </div>
    );
  }

  const qr = () => {
    const q = qrcode(0, 'M');
    q.addData(joinLink(code), 'Byte');
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  };

  return (
    <div className="card stack">
      <div className="card-title"><h3>Sync between devices</h3><button className="btn sm" onClick={() => syncNow()}>Sync now</button></div>
      <p className="small" role="status">
        {sync.state === 'ok' && <>Synced at {fmtTime(sync.at!)}. Changes reach your other devices within about 30 seconds.</>}
        {sync.state === 'syncing' && <>Syncing…</>}
        {sync.state === 'error' && <>Could not sync: {sync.error} Your progress is safe on this device and syncs again when the connection is back.</>}
      </p>
      <button className="btn" onClick={() => setShowing(!showing)}>{showing ? 'Hide code' : 'Add another device'}</button>
      {showing && (
        <>
          <p className="small">On the other device: scan this with the phone camera, or in Settings → Sync enter the code. Keep it private: anyone with the code can see and change this player's progress.</p>
          <div className="qr-box" role="img" aria-label="QR code to join sync" dangerouslySetInnerHTML={{ __html: qr() }} />
          <p className="mono" style={{ textAlign: 'center', fontSize: 'var(--text-lg)' }}>{showCode(code)}</p>
        </>
      )}
      <button className="btn sm" onClick={() => window.confirm('Stop syncing on this device? Your progress stays here and on the other devices.') && updateSettings({ syncCode: '' })}>Turn off sync on this device</button>
    </div>
  );
}
