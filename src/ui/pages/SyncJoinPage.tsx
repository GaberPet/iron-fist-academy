import { useEffect, useState } from 'react';
import { cleanCode, pull, type Remote } from '../../runtime/sync';
import { navigate, useRoute } from '../hooks';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

// Opened by scanning the "Add another device" QR code: #/sync/<code>.
export function SyncJoinPage() {
  const code = cleanCode(useRoute()[1] ?? '');
  const { updateSettings } = useStore();
  const [remote, setRemote] = useState<Remote | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    if (code) pull(code).then(setRemote, (e) => setError((e as Error).message));
  }, [code]);

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Sync this device</h1></div></div>
      {!code && <p className="notice warn">This link has no valid sync code. Scan the code again.</p>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      {code && remote === null && <p className="notice warn">No progress was found for this code yet. Turn on sync on the other device first.</p>}
      {code && remote && (
        <section className="card stack">
          <p>Sync <b>{currentPlayer()?.name}</b> on this device with <b>{remote.player || 'the other device'}</b>'s progress? From now on, both stay the same automatically. Nothing on this device is lost: the best result of each lesson and combo is kept.</p>
          <div className="row"><button className="btn primary" onClick={() => { updateSettings({ syncCode: code }); navigate('progress'); }}>Start syncing</button></div>
        </section>
      )}
    </div>
  );
}
