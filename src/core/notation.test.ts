import { parseNotation, inputSteps, parseBody, stringNotation } from './notation';

describe('parseNotation', () => {
  it('parses a simple move with direction', () => {
    const [s] = parseNotation('df+2');
    expect(s.kind).toBe('press');
    expect(s.buttons).toEqual([2]);
    expect(s.pressDir).toBe('df');
  });

  it('treats a plain button as neutral, and string follow-ups as any direction', () => {
    const steps = parseNotation('1,2,1');
    expect(steps.map((s) => s.pressDir)).toEqual(['n', 'any', 'any']);
    expect(steps.map((s) => s.buttons[0])).toEqual([1, 2, 1]);
  });

  it('folds direction-only parts into a motion (f,n,d,df+2)', () => {
    const steps = parseNotation('f,n,d,df+2');
    expect(steps).toHaveLength(1);
    expect(steps[0].motion.map((m) => m.dir)).toEqual(['f', 'n', 'd', 'df']);
    expect(steps[0].pressDir).toBe('df');
  });

  it('marks holds, simultaneous buttons and held buttons', () => {
    const [s] = parseNotation('f,F+1+2');
    expect(s.motion).toEqual([{ dir: 'f', hold: false }, { dir: 'f', hold: true }]);
    expect(s.buttons).toEqual([1, 2]);
    const [h] = parseNotation('ub+1+2*');
    expect(h.holdButton).toBe(true);
  });

  it('parses Armor King BnB with cancels, stances and tornado marker', () => {
    const steps = parseNotation('df+3 f+3,2~DF CD.1 f+3,2,1 T! dash f+1+2~F BAD.2+4');
    const kinds = steps.map((s) => `${s.kind}:${s.text}`);
    expect(kinds).toEqual([
      'press:df+3', 'press:f+3', 'press:2', 'motion:DF', 'press:CD.1',
      'press:f+3', 'press:2', 'press:1', 'marker:T!', 'motion:dash', 'press:f+1+2', 'motion:F', 'press:BAD.2+4',
    ]);
    const cancel = steps[3];
    expect(cancel.immediate).toBe(true);
    expect(cancel.motion).toEqual([{ dir: 'df', hold: true }]);
    expect(steps[4].stance).toBe('CD');
    expect(inputSteps(steps)).toHaveLength(12);
  });

  it('handles just-frame, same-frame and heat notation', () => {
    const jf = parseNotation('f,hcf:1')[0];
    expect(jf.justFrame).toBe(true);
    expect(jf.motion.map((m) => m.dir)).toEqual(['f', 'b', 'db', 'd', 'df', 'f']);
    const sf = parseNotation('f,f,F#2+4')[0];
    expect(sf.sameFrame).toBe(true);
    expect(sf.buttons).toEqual([2, 4]);
    const heat = parseNotation('1,2,1,H.2');
    expect(heat[3].heat).toBe(true);
  });

  it('handles Anna route with optional step, bare stance token and slash directions', () => {
    const steps = parseNotation('2,2 HAM.2,1 u+2 HAM.2,2T! (TOM.3) CJM u/f+3 d/b+2 TOM.2');
    const tom3 = steps.find((s) => s.text === 'TOM.3')!;
    expect(tom3.optional).toBe(true);
    const uf3 = steps.find((s) => s.text === 'uf+3')!;
    expect(uf3.stance).toBe('CJM');
    expect(uf3.pressDir).toBe('uf');
    expect(steps.some((s) => s.marker === 'T!')).toBe(true);
    expect(steps.find((s) => s.text === 'db+2')!.stance).toBeNull();
  });

  it('parses while-standing and counter-hit prefixes', () => {
    const steps = parseNotation('CH ws2,2');
    expect(steps[0].stance).toBe('ws');
    expect(steps[0].counterHit).toBe(true);
    expect(steps[1].counterHit).toBe(false);
    expect(parseNotation('iws3,1')[0].stance).toBe('iws');
  });

  it('rejects garbage', () => {
    expect(() => parseNotation('df+9')).toThrow();
    expect(parseBody('xyz+1')).toBeNull();
  });
});

describe('stringNotation', () => {
  it('rebuilds string notation for move lookup', () => {
    const st = parseNotation('f+3,2~DF CD.1 1,2,1');
    expect(stringNotation(st, 1)).toBe('f+3,2');
    expect(stringNotation(st, 3)).toBe('CD.1');
    expect(stringNotation(st, 6)).toBe('1,2,1');
    expect(st[3].group).toBe(1);
  });
});
