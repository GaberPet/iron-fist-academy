// Character tiles: name, move and combo counts, badges, and the initials set large and faded.
import { useMemo, useState } from 'react';
import { isRecent } from '../../data';
import { useStore } from '../store';
import { finePointer } from '../hooks';

function initials(name: string) {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

export function RosterTiles({ onPicked, autoFocusSearch }: { onPicked?(id: string): void; autoFocusSearch?: boolean }) {
  const { roster, char, setActiveChar, progress, isCurated } = useStore();
  const [q, setQ] = useState('');
  const mastered = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(progress.lessons)) if (v.mastered) m.set(k.split(':')[0], (m.get(k.split(':')[0]) ?? 0) + 1);
    return m;
  }, [progress.lessons]);
  const shown = roster.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (id: string) => {
    setActiveChar(id);
    onPicked?.(id);
  };
  return (
    <div className="stack">
      <input type="search" placeholder="Find a character" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a character" autoFocus={autoFocusSearch && finePointer()} style={{ maxWidth: 320 }} />
      <div className="roster">
        {shown.map((c) => (
          <button key={c.id} className={`char-tile ${c.id === char.profile.id ? 'sel' : ''}`} onClick={() => pick(c.id)} aria-pressed={c.id === char.profile.id}>
            <span className="char-tile-glyph" aria-hidden>{initials(c.name)}</span>
            <span className="char-name">{c.name}</span>
            <span className="char-tags">
              {isCurated(c.id) && <span className="badge char">Curriculum</span>}
              {isRecent(c.addedAt) && <span className="badge good">New</span>}
              <span className="badge">{c.counts.moves} moves</span>
              <span className="badge">{c.counts.combos} combos</span>
              {mastered.get(c.id) ? <span className="badge good">{mastered.get(c.id)} mastered</span> : null}
            </span>
          </button>
        ))}
      </div>
      {!shown.length && <div className="empty">No character matches "{q}".</div>}
    </div>
  );
}
