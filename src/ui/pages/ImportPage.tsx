import { useEffect, useState } from 'react';
import { decodeTransfer, mergeProgress, type Transfer } from '../../core/transfer';
import { fmtDateTime } from '../format';
import { navigate, useRoute } from '../hooks';
import { useStore } from '../store';
import { currentPlayer } from '../LoginGate';

// Opened by scanning a "Send to phone" QR code: #/import/<packed progress>.
export function ImportPage() {
  const route = useRoute();
  const { progress, replaceProgress } = useStore();
  const [t, setT] = useState<Transfer | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!route[1]) return setError('This link has no progress in it. Scan the code again.');
    decodeTransfer(route[1]).then(setT, () => setError('This code could not be read. Make a new one with Send to phone and scan it again.'));
  }, [route[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessons = t ? Object.values(t.progress.lessons).filter((l) => l.mastered).length : 0;
  const combos = t ? Object.values(t.progress.combos).filter((c) => c.mastered).length : 0;
  const add = () => {
    if (!t) return;
    replaceProgress(mergeProgress(progress, t.progress));
    setDone(true);
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Add progress from another device</h1></div></div>
      {error && <p className="notice warn" role="alert">{error}</p>}
      {t && !done && (
        <section className="card stack">
          <p>From <b>{t.from}</b> on the {t.source === 'desktop' ? 'desktop app' : 'website'}, {fmtDateTime(t.at)}:</p>
          <ul>
            <li>{lessons} {lessons === 1 ? 'lesson' : 'lessons'} mastered</li>
            <li>{combos} {combos === 1 ? 'combo' : 'combos'} mastered</li>
            <li>{t.progress.attempts.length} recent {t.progress.attempts.length === 1 ? 'attempt' : 'attempts'}</li>
          </ul>
          <p className="small">This is added to <b>{currentPlayer()?.name}</b>'s progress on this device. Nothing is lost: the best result of each lesson and combo is kept.</p>
          <div className="row"><button className="btn primary" onClick={add}>Add to my progress</button></div>
        </section>
      )}
      {done && (
        <section className="card stack">
          <p className="notice info" role="status">Done. Your progress from {t?.source === 'desktop' ? 'the desktop app' : 'the website'} is on this phone now.</p>
          <div className="row"><button className="btn primary" onClick={() => navigate('progress')}>See my progress</button><button className="btn" onClick={() => navigate('academy')}>Open the Academy</button></div>
        </section>
      )}
    </div>
  );
}
