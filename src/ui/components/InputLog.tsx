// Tekken-style input history: one row per change of direction/buttons, with frame durations.
import { useRef, useState } from 'react';
import type { Dir } from '../../types';
import { buttonsOf } from '../../core/input';
import { useInputFrames } from '../hooks';
import { ButtonGlyph, DirGlyph } from './Notation';

interface Row { dir: Dir; buttons: number; frames: number; id: number }

export function InputLog({ rows = 14 }: { rows?: number }) {
  const [log, setLog] = useState<Row[]>([]);
  const cur = useRef<Row | null>(null);
  const nextId = useRef(0);
  const lastRender = useRef(0);
  useInputFrames((f) => {
    const c = cur.current;
    if (c && c.dir === f.dir && c.buttons === f.buttons) {
      c.frames++;
      if (performance.now() - lastRender.current > 100) {
        lastRender.current = performance.now();
        setLog((l) => [...l]);
      }
      return;
    }
    const row = { dir: f.dir, buttons: f.buttons, frames: 1, id: nextId.current++ };
    cur.current = row;
    setLog((l) => [...l.slice(-(rows - 1)), row]);
  });
  if (!log.length) return <div className="muted small">Press something on the controller (or keyboard WASD + U I J K).</div>;
  return (
    <div className="inputlog" aria-label="Input history">
      {log.map((r) => (
        <div className="inputlog-row" key={r.id}>
          <span className="muted">{r.frames > 99 ? '99+' : r.frames}f</span>
          <DirGlyph d={r.dir} />
          <span className="row" style={{ gap: 3 }}>
            {buttonsOf(r.buttons).map((b) => <ButtonGlyph key={b} b={b} />)}
          </span>
        </div>
      ))}
    </div>
  );
}
