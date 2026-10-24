// Character registry. To add a character:
//   1. add it to CHARACTERS in scripts/import-wavu.mjs and run `npm run import-data`
//   2. create src/data/characters/<id>/curated.json (copy an existing one as a template)
//   3. add one entry to BUNDLED below
// `npm test` validates every reference in the curated file against the frame data.
import type { CharacterCurated, CharacterData, FrameDataFile, Lesson, Move } from '../types';
import annaFrames from './characters/anna/frames.json';
import annaCurated from './characters/anna/curated.json';
import akFrames from './characters/armor-king/frames.json';
import akCurated from './characters/armor-king/curated.json';
import general from './general.json';
import { parseFrame, parseFrameRange, parseStartup } from './wavuNormalize.js';

export interface BundledCharacter {
  id: string;
  wavuName: string;
  frames: FrameDataFile;
  curated: CharacterCurated;
}

export const BUNDLED: BundledCharacter[] = [
  { id: 'anna', wavuName: 'Anna', frames: annaFrames as FrameDataFile, curated: annaCurated as unknown as CharacterCurated },
  { id: 'armor-king', wavuName: 'Armor King', frames: akFrames as FrameDataFile, curated: akCurated as unknown as CharacterCurated },
];

export const GENERAL_LESSONS: Lesson[] = (general as unknown as { lessons: Lesson[] }).lessons;

/** User-entered corrections, stored locally. Field values replace imported ones. */
export interface MoveOverride {
  fields: Partial<Pick<Move, 'startup' | 'block' | 'hit' | 'ch' | 'damage' | 'notes' | 'crush'>>;
  note?: string;
  updatedAt: string;
}
export type OverrideMap = Record<string, Record<string, MoveOverride>>; // charId -> moveId -> override

/** Normalize notation variants so "u/f+3", "ws+1+2", "SS+3" and "ss4" find their moves. */
export function normalizeNotation(s: string): string {
  return s
    .trim()
    .replace(/^CH\s+/, '')
    .replace(/[()]/g, '')
    .replace(/\b([udUD])\/([fbFB])\b/g, '$1$2')
    .replace(/^ws\+/, 'ws')
    .replace(/^(?:SS|ss)\+?(?=[1-4])/, 'SS.')
    .replace(/\s+/g, '');
}


export function applyOverride(m: Move, o: MoveOverride | undefined): Move {
  if (!o) return m;
  const merged: Move = { ...m, ...o.fields };
  if (o.fields.startup !== undefined) merged.startupFrame = parseStartup(o.fields.startup);
  if (o.fields.block !== undefined) {
    merged.blockFrame = parseFrame(o.fields.block);
    merged.blockRange = parseFrameRange(o.fields.block) as [number, number] | null;
  }
  if (o.fields.hit !== undefined) merged.hitFrame = parseFrame(o.fields.hit);
  return merged;
}

export function buildCharacter(frames: FrameDataFile, curated: CharacterCurated, overrides: Record<string, MoveOverride> = {}): CharacterData {
  const moves = frames.moves.map((m) => applyOverride({ ...m, alt: m.alt ?? [] }, overrides[m.id]));
  const moveIndex = new Map<string, Move>();
  for (const m of moves) moveIndex.set(m.id, m);
  for (const m of moves) for (const a of m.alt) if (!moveIndex.has(a)) moveIndex.set(a, m);
  return { ...curated, frames: { ...frames, moves }, moveIndex };
}

export function lookupMove(c: CharacterData, notation: string): Move | undefined {
  const direct = c.moveIndex.get(notation);
  if (direct) return direct;
  const n = normalizeNotation(notation);
  const candidates = [n, `CH.${n}`];
  // Stance shorthands, e.g. Armor King "CD.1" = "f,n,d,df+1"
  for (const [prefix, expansion] of Object.entries(c.profile.stanceAliases ?? {})) {
    if (n.startsWith(prefix)) candidates.push(expansion + n.slice(prefix.length));
  }
  for (const k of candidates) {
    const m = c.moveIndex.get(k);
    if (m) return m;
  }
  return undefined;
}

export function lessonsFor(c: Pick<CharacterCurated, 'lessons'>): Lesson[] {
  const all = [...GENERAL_LESSONS, ...c.lessons];
  return all.sort((a, b) => a.stage - b.stage || Number(!!a.isStageTest) - Number(!!b.isStageTest));
}

export const STAGE_NAMES: Record<number, string> = {
  1: 'Foundations',
  2: 'Core Combat',
  3: 'Reliable Execution',
  4: 'Advanced Character Play',
  5: 'Competitive Preparation',
};
