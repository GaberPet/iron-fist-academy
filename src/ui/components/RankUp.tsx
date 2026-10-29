import { useEffect, useMemo, useRef } from 'react';
import { rankFor, rankPoints } from '../../core/rank';
import { navigate } from '../hooks';
import { useStore } from '../store';
import { RankBadge } from '../pages/RankingPage';

/** Shows a celebration once each time the player reaches a new rank. */
export function RankUp() {
  const { progress, settings, updateSettings } = useStore();
  const rank = useMemo(() => rankFor(rankPoints(progress).total), [progress]);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (settings.lastRank === -1) updateSettings({ lastRank: rank.index }); // first run: no party for the starting rank
    else if (rank.index > settings.lastRank && !dlg.current?.open) dlg.current?.showModal();
  }, [rank.index, settings.lastRank]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    dlg.current?.close();
    updateSettings({ lastRank: rank.index });
  };
  return (
    <dialog ref={dlg} className="card import-dialog rank-up" aria-labelledby="rankup-title" onCancel={close}>
      <div className="stack">
        <div className="eyebrow">Rank up!</div>
        <RankBadge index={rank.index} size={96} />
        <h2 id="rankup-title">You are now {rank.name}</h2>
        <p className="small">{rank.next ? `Next: ${rank.next.name} at ${rank.next.points.toLocaleString()} points.` : 'This is the highest rank. Legendary.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={close}>Keep training</button>
          <button className="btn" onClick={() => { close(); navigate('ranking'); }}>See ranking</button>
        </div>
      </div>
    </dialog>
  );
}
