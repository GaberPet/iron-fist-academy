// Content integrity: every curated reference must resolve against the imported frame data,
// and every combo/exercise notation must parse. This is what keeps the app from showing
// made-up moves.
import { BUNDLED, GENERAL_LESSONS, buildCharacter, lookupMove, lessonsFor } from './index';
import { parseNotation } from '../core/notation';
import type { Exercise } from '../types';

for (const b of BUNDLED) {
  const c = buildCharacter(b.frames, b.curated);
  describe(`${b.id} curated data`, () => {
    it('has frame data with provenance', () => {
      expect(c.frames.moves.length).toBeGreaterThan(100);
      expect(c.frames.source.url).toMatch(/^https:\/\/wavu\.wiki\//);
      expect(c.frames.source.fetchedAt).toBeTruthy();
    });

    it('key move notes reference existing moves', () => {
      for (const k of c.keyMoves) expect(lookupMove(c, k.id), k.id).toBeTruthy();
    });

    it('punisher table references existing moves', () => {
      for (const p of c.punishers) expect(lookupMove(c, p.moveId), p.moveId).toBeTruthy();
      for (const w of c.whiffPunishers) expect(lookupMove(c, w), w).toBeTruthy();
    });

    it('every combo starter and route parses', () => {
      for (const combo of c.combos) {
        expect(() => parseNotation(combo.route), combo.id).not.toThrow();
        for (const s of combo.starters) expect(() => parseNotation(s), `${combo.id} starter ${s}`).not.toThrow();
        expect(combo.source.url).toMatch(/^https:\/\//);
        if (combo.easierAlternative) expect(c.combos.some((x) => x.id === combo.easierAlternative)).toBe(true);
      }
    });

    it('every press step in every combo resolves to a known move or a string continuation', () => {
      const unresolved: string[] = [];
      for (const combo of c.combos) {
        for (const s of [...combo.starters.slice(0, 1), combo.route]) {
          for (const tok of s.split(/\s+/)) {
            const clean = tok.replace(/(T!|W!|HB!)$/, '').replace(/~[A-Z]+$/, '');
            if (!clean || /^(CH|CJM|dash|run|ssr|ssl|SSL|SSR|T!|W!|HB!|~F)$/.test(clean) || clean.startsWith('~')) continue;
            if (!lookupMove(c, clean)) unresolved.push(`${combo.id}: ${clean}`);
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

    const lessons = lessonsFor(c);
    it('lesson ids are unique and related links resolve', () => {
      const ids = new Set<string>();
      for (const l of lessons) {
        expect(ids.has(l.id), l.id).toBe(false);
        ids.add(l.id);
      }
      for (const l of lessons) {
        for (const r of l.related.lessons ?? []) expect(ids.has(r), `${l.id} -> ${r}`).toBe(true);
        for (const m of l.related.moves ?? []) expect(lookupMove(c, m), `${l.id} -> ${m}`).toBeTruthy();
        for (const cb of l.related.combos ?? []) expect(c.combos.some((x) => x.id === cb), `${l.id} -> ${cb}`).toBe(true);
        if (l.visual && l.visual.type !== 'controller') for (const m of l.visual.moveIds) expect(lookupMove(c, m), `${l.id} visual ${m}`).toBeTruthy();
      }
    });

    it('lesson exercises are valid', () => {
      const check = (lid: string, e: Exercise) => {
        if (e.type === 'input') for (const m of e.moves) expect(() => parseNotation(m), `${lid}: ${m}`).not.toThrow();
        if (e.type === 'combo') expect(c.combos.some((x) => x.id === e.comboId), `${lid}: ${e.comboId}`).toBe(true);
        if (e.type === 'quiz') for (const m of e.moveIds ?? []) expect(lookupMove(c, m), `${lid}: ${m}`).toBeTruthy();
      };
      for (const l of lessons) {
        check(l.id, l.guided);
        check(l.id, l.challenge);
      }
    });

    it('every stage has a stage test, and stages 1-5 exist', () => {
      for (const st of [1, 2, 3, 4, 5]) {
        expect(lessons.some((l) => l.stage === st), `stage ${st}`).toBe(true);
        expect(c.lessons.some((l) => l.stage === st && l.isStageTest), `stage ${st} test`).toBe(true);
      }
    });
  });
}

describe('general lessons', () => {
  it('exist and are stage 1-2', () => {
    expect(GENERAL_LESSONS.length).toBeGreaterThan(4);
    for (const l of GENERAL_LESSONS) expect(l.stage).toBeLessThanOrEqual(2);
  });
});
