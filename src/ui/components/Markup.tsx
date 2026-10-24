// Minimal, safe markup for lesson text: paragraphs, "- " / "1. " lists, **bold**, `code`.
import type { ReactNode } from 'react';
import { parseNotation } from '../../core/notation';
import { NotationView } from './Notation';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const code = tok.slice(1, -1);
      let isNotation = false;
      try {
        isNotation = parseNotation(code).length > 0 && /[1-4]|dash|ss/.test(code);
      } catch {
        isNotation = false;
      }
      out.push(isNotation ? <NotationView key={`${key}-${i++}`} notation={code} /> : <code key={`${key}-${i++}`}>{code}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markup({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="lesson-body">
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim());
        if (lines.every((l) => /^\s*- /.test(l)))
          return <ul key={bi}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*- /, ''), `${bi}-${i}`)}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+\. /.test(l)))
          return <ol key={bi}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+\. /, ''), `${bi}-${i}`)}</li>)}</ol>;
        return <p key={bi}>{inline(lines.join(' '), String(bi))}</p>;
      })}
    </div>
  );
}
