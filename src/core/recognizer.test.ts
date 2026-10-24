import { parseNotation } from './notation';
import { SequenceRecognizer, matchMotion, type RecognizerEvent } from './recognizer';
import { script, type ScriptEntry } from './testUtils';

function run(notation: string, entries: ScriptEntry[]) {
  const rec = new SequenceRecognizer(parseNotation(notation));
  rec.prime({ frame: -1, dir: 'n', buttons: 0 });
  const events: RecognizerEvent[] = [];
  for (const f of script(entries)) events.push(...rec.push(f));
  return { rec, events, last: events[events.length - 1] };
}

describe('matchMotion', () => {
  it('finds ordered motion and tolerates stray directions', () => {
    const segs = ['f', 'n', 'd', 'db', 'd', 'df'].map((dir, i) => ({ dir: dir as any, start: i, end: i }));
    expect(matchMotion(['f', 'n', 'd', 'df'], segs)).toBe(true);
    expect(matchMotion(['f', 'd', 'df'], segs.slice(2))).toBe(false);
  });
});

describe('SequenceRecognizer', () => {
  it('completes a 1,2 string', () => {
    const { last } = run('1,2', [{ press: [1] }, { frames: 4 }, { press: [2] }, { frames: 3 }]);
    expect(last.type).toBe('complete');
  });

  it('reports the failing step and error type for a wrong button', () => {
    const { last } = run('1,2,1', [{ press: [1] }, { frames: 4 }, { press: [3] }, { frames: 3 }]);
    expect(last).toMatchObject({ type: 'fail', index: 1, error: 'wrong-button' });
  });

  it('requires the direction at the press', () => {
    const { last } = run('df+2', [{ dir: 'd', press: [2] }, { frames: 3 }]);
    expect(last).toMatchObject({ type: 'fail', error: 'wrong-direction' });
    const ok = run('df+2', [{ dir: 'df', press: [2] }, { frames: 3 }]);
    expect(ok.last.type).toBe('complete');
  });

  it('recognizes an electric-style motion f,n,d,df+2 and rejects it without the motion', () => {
    const good = run('f,n,d,df+2', [{ dir: 'f' }, { dir: 'n', frames: 1 }, { dir: 'd' }, { dir: 'df', press: [2] }, { frames: 3 }]);
    expect(good.last.type).toBe('complete');
    const bad = run('f,n,d,df+2', [{ dir: 'df', press: [2] }, { frames: 3 }]);
    expect(bad.last).toMatchObject({ type: 'fail', error: 'missing-motion' });
  });

  it('accepts simultaneous presses within the window and flags late ones', () => {
    const ok = run('1+2', [{ press: [1], frames: 1 }, { press: [1, 2], frames: 3 }, { frames: 3 }]);
    expect(ok.last.type).toBe('complete');
    const late = run('1+2', [{ press: [1], frames: 5 }, { press: [1, 2], frames: 3 }, { frames: 3 }]);
    expect(late.last).toMatchObject({ type: 'fail', error: 'not-simultaneous' });
  });

  it('handles a held-direction cancel into a stance move (f+3,2~DF CD.1)', () => {
    const ok = run('f+3,2~DF CD.1', [
      { dir: 'f', press: [3] }, { frames: 6 }, { press: [2] }, { dir: 'df', frames: 4 }, { dir: 'df', press: [1] }, { frames: 3 },
    ]);
    expect(ok.last.type).toBe('complete');
    const skipped = run('f+3,2~DF CD.1', [{ dir: 'f', press: [3] }, { frames: 6 }, { press: [2] }, { frames: 4 }, { press: [1] }, { frames: 3 }]);
    expect(skipped.last.type).toBe('fail');
  });

  it('checks while-standing inputs', () => {
    const ok = run('ws1', [{ dir: 'd', frames: 6 }, { dir: 'n', frames: 2 }, { press: [1] }, { frames: 3 }]);
    expect(ok.last.type).toBe('complete');
    const bad = run('ws1', [{ press: [1] }, { frames: 3 }]);
    expect(bad.last).toMatchObject({ type: 'fail', error: 'missing-crouch' });
  });

  it('fails when too slow between steps', () => {
    const { last } = run('1,2', [{ press: [1] }, { frames: 120 }, { press: [2] }]);
    expect(last).toMatchObject({ type: 'fail', index: 1, error: 'too-slow' });
  });

  it('skips tornado markers and recognizes dash', () => {
    const { last } = run('2 T! dash 1', [
      { press: [2] }, { frames: 4 }, { dir: 'f' }, { dir: 'n' }, { dir: 'f' }, { frames: 2 }, { press: [1] }, { frames: 3 },
    ]);
    expect(last.type).toBe('complete');
  });

  it('allows skipping optional steps', () => {
    const { last } = run('2 (TOM.3) 1', [{ press: [2] }, { frames: 4 }, { press: [1] }, { frames: 3 }]);
    expect(last.type).toBe('complete');
  });

  it('works with a full Armor King BnB input script', () => {
    const notation = 'df+3 f+3,2~DF CD.1 f+3,2,1 T! dash f+1+2~F BAD.2+4';
    const { last } = run(notation, [
      { dir: 'df', press: [3] }, { frames: 10 },
      { dir: 'f', press: [3] }, { frames: 6 }, { press: [2] }, { dir: 'df', frames: 4 }, { dir: 'df', press: [1] }, { frames: 8 },
      { dir: 'f', press: [3] }, { frames: 6 }, { press: [2] }, { frames: 6 }, { press: [1] }, { frames: 10 },
      { dir: 'f' }, { dir: 'n' }, { dir: 'f' }, { frames: 2 },
      { dir: 'f', press: [1, 2] }, { dir: 'f', frames: 6 }, { dir: 'f', press: [2, 4] }, { frames: 3 },
    ]);
    expect(last.type).toBe('complete');
  });
});

describe('held buttons at start', () => {
  it('ignores a button already held when the attempt starts', () => {
    const rec = new SequenceRecognizer(parseNotation('1'));
    const evs = script([{ press: [1], frames: 3 }, { frames: 2 }]).flatMap((f) => rec.push(f));
    expect(evs).toEqual([]);
    const evs2 = script([{ press: [1] }, { frames: 3 }], 10).flatMap((f) => rec.push(f));
    expect(evs2[evs2.length - 1].type).toBe('complete');
  });
});
