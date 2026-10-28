// Content integrity: generated data for every character must be well-formed; every curated reference
// must resolve against the imported frame data; every notation must parse.
import { CURATED, GENERAL_LESSONS, buildCharacter, lookupMove, lessonsFor } from './index';
import { loadCharacter, loadFile, loadManifest } from './testData';
import { parseNotation } from '../core/notation';
import type { Exercise } from '../types';

const manifest = loadManifest();

describe('generated roster data', () => {
  it('manifest lists the roster with provenance', () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.characters.length).toBeGreaterThanOrEqual(30);
    expect(new Set(manifest.characters.map((c) => c.id)).size).toBe(manifest.characters.length);
  });

  for (const entry of manifest.characters) {
    it(`${entry.name}: file matches manifest and is well-formed`, () => {
      const f = loadFile(entry.id);
      expect(f.schema).toBe(1);
      expect(f.id).toBe(entry.id);
      expect(f.frames.moves.length).toBe(entry.counts.moves);
      expect(f.frames.moves.length).toBeGreaterThan(40);
      expect(f.frames.source.url).toMatch(/^https:\/\/wavu\.wiki\//);
      expect(f.combos.items.length).toBe(entry.counts.combos);
      const ids = new Set(f.combos.items.map((c) => c.id));
      expect(ids.size).toBe(f.combos.items.length);
      for (const c of f.combos.items) {
        if (c.parseOk) expect(() => parseNotation(c.route), `${entry.id} ${c.route}`).not.toThrow();
        expect(c.route).toMatch(/[1-4]/);
      }
      for (const p of f.punishers.items) {
        expect(Number.isInteger(p.window)).toBe(true);
        expect(p.window).toBeLessThan(0);
        expect(['standing', 'crouching']).toContain(p.stance);
      }
    });
  }

  it('most imported combos are readable by the trainer', () => {
    const t = manifest.characters.reduce((a, c) => ({ all: a.all + c.counts.combos, ok: a.ok + c.counts.combosParsed }), { all: 0, ok: 0 });
    expect(t.ok / t.all).toBeGreaterThan(0.8);
  });
});

for (const id of Object.keys(CURATED)) {
  const c = loadCharacter(id);
  describe(`${id} curated content`, () => {
    it('key move notes reference existing moves', () => {
      for (const k of c.keyMoves) expect(lookupMove(c, k.id), k.id).toBeTruthy();
    });

    it('punisher table references existing moves', () => {
      // Only hand-entered entries: an empty list falls back to Wavu's table, which may name moves the frame data lacks.
      for (const p of CURATED[id].punishers) expect(lookupMove(c, p.moveId), p.moveId).toBeTruthy();
      for (const w of c.whiffPunishers) expect(lookupMove(c, w), w).toBeTruthy();
    });

    it('every curated combo starter and route parses', () => {
      for (const combo of c.combos.filter((x) => x.curated)) {
        expect(() => parseNotation(combo.route), combo.id).not.toThrow();
        for (const s of combo.starters) expect(() => parseNotation(s), `${combo.id} starter ${s}`).not.toThrow();
        if (combo.easierAlternative) expect(c.combos.some((x) => x.id === combo.easierAlternative)).toBe(true);
      }
    });

    it('every press step in curated combos resolves to a known move', () => {
      const unresolved: string[] = [];
      for (const combo of c.combos.filter((x) => x.curated)) {
        for (const s of [...combo.starters.slice(0, 1), combo.route]) {
          for (const tok of s.split(/\s+/)) {
            const clean = tok.replace(/[A-Za-z]{1,4}!$/, '').replace(/(?<=\d)[~,][A-Z]+$/, '');
            if (!clean || /^(CH|CJM|dash|run|ssr|ssl|SSL|SSR|f,F|f,f|b,b|f,f,F|b,B)$/.test(clean) || clean.startsWith('~')) continue;
            if (lookupMove(c, clean)) continue;
            // Cancels ("f+4~RFS.3~4", "3,1~df~3"): each part must be a move, a direction or a button follow-up.
            const parts = clean.split('~').map((p) => p.replace(/,[A-Za-z]+$/, '')).filter((p) => p && !/^[A-Za-z]+$/.test(p));
            // A trailing button press can be a stance transition, e.g. "u+1+2,3+4" (into Hunting Bear).
            const ok = (p: string) => lookupMove(c, p) || /^[1-4+,]+$/.test(p) || (/,[1-4+]+$/.test(p) && lookupMove(c, p.replace(/,[1-4+]+$/, '')));
            if (!parts.length || !parts.every(ok)) unresolved.push(`${combo.id}: ${clean}`);
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

  });
}

for (const entry of manifest.characters) {
  const c = loadCharacter(entry.id);
  describe(`${entry.name} curriculum (${CURATED[entry.id] ? 'hand-written' : 'generated'})`, () => {
    it('key move notes reference existing moves', () => {
      expect(c.keyMoves.length).toBeGreaterThan(3);
      for (const k of c.keyMoves) expect(lookupMove(c, k.id), k.id).toBeTruthy();
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

    it('every stage has a stage test', () => {
      for (const st of [1, 2, 3, 4, 5]) expect(c.lessons.some((l) => l.stage === st && l.isStageTest), `stage ${st}`).toBe(true);
    });
  });
}

describe('characters without coaching still work', () => {
  it('builds an auto profile, imported combos and punishers', () => {
    const paul = buildCharacter(loadFile('paul'));
    expect(paul.profile.name).toBe('Paul');
    expect(paul.combos.length).toBeGreaterThan(50);
    expect(paul.punishers.length).toBeGreaterThan(5);
    expect(lessonsFor(paul).length).toBe(GENERAL_LESSONS.length + 24);
    expect(paul.lessons.every((l) => l.generated)).toBe(true);
  });

  it('does not duplicate curated combos with imported ones', () => {
    const ak = loadCharacter('armor-king');
    const routes = ak.combos.filter((c) => c.curated).map((c) => `${c.starters[0] ?? ''}=>${c.route}`);
    const imported = ak.combos.filter((c) => !c.curated).map((c) => `${c.starters[0] ?? ''}=>${c.route}`);
    for (const r of routes) expect(imported).not.toContain(r);
  });
});
