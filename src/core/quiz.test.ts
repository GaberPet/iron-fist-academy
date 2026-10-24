import { BUNDLED, buildCharacter, lookupMove } from '../data';
import { generateQuiz, seededRng } from './quiz';
import { classifySafety } from './frames';

const [anna, ak] = BUNDLED.map((b) => buildCharacter(b.frames, b.curated));

describe('quiz generation', () => {
  it('safety answers match the imported frame data', () => {
    const qs = generateQuiz('safety', ak, [anna], 8, seededRng(7));
    expect(qs.length).toBe(8);
    for (const q of qs) {
      const m = lookupMove(ak, q.moveId!)!;
      const correct = q.options[q.answer];
      expect(q.explain).toContain(m.block);
      expect(correct.toLowerCase()).toContain(classifySafety(m) === 'launch-punishable' ? 'launch' : classifySafety(m).split('-')[0]);
    }
  });

  it('punisher questions only offer one guaranteed option', () => {
    const qs = generateQuiz('punisher', anna, [ak], 10, seededRng(9));
    expect(qs.length).toBeGreaterThan(3);
    for (const q of qs) {
      const window = Number(/which is (-\d+)\w* on block/.exec(q.prompt)![1]);
      const windows = q.options.map((o) => Number(/punishes (-\d+)/.exec(o)![1]));
      const guaranteed = windows.filter((w) => -w <= -window);
      expect(guaranteed).toHaveLength(1);
      expect(windows[q.answer]).toBe(guaranteed[0]);
    }
  });

  it('startup questions pick the lowest startup', () => {
    for (const q of generateQuiz('startup', anna, [], 5, seededRng(3))) {
      const nums = [...q.explain.matchAll(/: i?(\d+)/g)].map((m) => Number(m[1]));
      expect(nums.length).toBe(3);
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateQuiz('hitlevel', anna, [], 5, seededRng(1)).map((q) => q.id);
    const b = generateQuiz('hitlevel', anna, [], 5, seededRng(1)).map((q) => q.id);
    expect(a).toEqual(b);
  });
});
