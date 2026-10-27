// Character data = generated file (public/data/characters/<id>.json, imported nightly from Wavu Wiki)
// + optional curated content (src/data/characters/<id>/curated.json: lessons, coach notes, combo tips).
//
// Every character in the manifest works out of the box (move library, combos, punishers, quizzes,
// drills). To add a curriculum for one: create curated.json and add it to CURATED below.
// `npm test` validates every curated reference against the generated frame data.
import type { CharacterCurated, CharacterData, CharacterFile, CharacterProfile, ComboDef, Lesson, Move } from '../types';
import annaCurated from './characters/anna/curated.json';
import akCurated from './characters/armor-king/curated.json';
import general from './general.json';
import { parseFrame, parseFrameRange, parseStartup } from './wavuNormalize.js';

export const CURATED: Record<string, CharacterCurated> = {
  anna: annaCurated as unknown as CharacterCurated,
  'armor-king': akCurated as unknown as CharacterCurated,
};

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
    .replace(/^(i?)WS\+?(?=[1-4])/, '$1ws')
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

/** Profile for characters without curated content, built from the imported Wavu overview. */
export function autoProfile(f: CharacterFile): CharacterProfile {
  const p = f.profile;
  const stance = (s: string) => {
    // "HAM (Hammer Chance) – f+3"
    const m = /^(\S+)\s*(?:\(([^)]*)\))?\s*[–-]\s*(.+)$/.exec(s);
    return m ? { code: m[1], name: m[2] ?? m[1], entry: m[3], note: '' } : { code: s.split(' ')[0], name: s, entry: '', note: '' };
  };
  return {
    id: f.id,
    name: f.name,
    short: f.name,
    color: p.color,
    overview: p.overview || `No overview on Wavu Wiki yet for ${f.name}.`,
    playstyle: p.overview ? p.overview.split('. ')[0] + '.' : `Frame data, combos and punishers for ${f.name} imported from Wavu Wiki.`,
    strengths: p.strengths ?? [],
    weaknesses: p.weaknesses ?? [],
    stances: (p.stances ?? []).map(stance),
    heat: p.heat ?? [],
    heatEngagers: (p.heatEngagers ?? []).map((h) => h.split(' – ').pop()!.trim()),
    keyLaunchers: (p.launch ?? []).map((h) => h.split(' – ').pop()!.split(' ')[0].trim()),
    sources: [p.source, f.frames.source, ...(f.combos.source ? [f.combos.source] : []), ...(f.punishers.source ? [f.punishers.source] : [])],
  };
}

const routeKey = (s: string) => s.replace(/\s+/g, ' ').replace(/u\/f/g, 'uf').replace(/d\/b/g, 'db').trim().toLowerCase();

/** Imported Wavu combos as ComboDefs (skipping routes a curated combo already covers). */
export function importedCombos(f: CharacterFile, curated: ComboDef[] = []): ComboDef[] {
  // Same route + overlapping starters (or no starters on either side) = the same combo.
  const isCovered = (route: string, starters: string[]) =>
    curated.some((cc) => {
      if (routeKey(cc.route) !== routeKey(route)) return false;
      if (!cc.starters.length || !starters.length) return true;
      const mine = new Set(cc.starters.map(routeKey));
      return starters.some((s) => mine.has(routeKey(s)));
    });
  const counter = new Map<string, number>();
  const out: ComboDef[] = [];
  for (const c of f.combos.items) {
    if (isCovered(c.route, c.starters)) continue;
    const n = (counter.get(c.section) ?? 0) + 1;
    counter.set(c.section, n);
    out.push({
      id: c.id,
      name: `${c.section || 'Combo'} #${n}${c.starters[0] ? ` · ${c.starters[0]}` : ''}`,
      section: c.section,
      starters: c.starters,
      situation: c.starterNotes.length ? c.starterNotes.join(' · ') : c.starters.length ? `After ${c.starters.join(' / ')}.` : `${c.section} combo.`,
      route: c.route,
      damage: c.damage || undefined,
      notes: c.notes,
      parseOk: c.parseOk,
      ...(c.firstSeen ? { firstSeen: c.firstSeen } : {}),
      tags: [slugTag(c.section), 'imported'],
      mistakes: [],
      source: { name: f.combos.source?.name ?? 'Wavu Wiki combos', url: f.combos.source?.url ?? '', revision: f.combos.source?.revision ?? null, verified: 'source' },
    });
  }
  return out;
}

const slugTag = (s: string) => s.toLowerCase().split(' · ')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'combo';

export function buildCharacter(f: CharacterFile, curated?: CharacterCurated, overrides: Record<string, MoveOverride> = {}): CharacterData {
  const moves = f.frames.moves.map((m) => applyOverride({ ...m, alt: m.alt ?? [] }, overrides[m.id]));
  const moveIndex = new Map<string, Move>();
  for (const m of moves) moveIndex.set(m.id, m);
  for (const m of moves) for (const a of m.alt) if (!moveIndex.has(a)) moveIndex.set(a, m);
  const curatedCombos = (curated?.combos ?? []).map((c) => ({ ...c, curated: true, parseOk: true }));
  return {
    profile: curated?.profile ?? autoProfile(f),
    keyMoves: curated?.keyMoves ?? [],
    combos: [...curatedCombos, ...importedCombos(f, curatedCombos)],
    punishers: curated?.punishers?.length ? curated.punishers : f.punishers.items.map(({ window, moveId, stance, note }) => ({ window, moveId, stance, ...(note ? { note } : {}) })),
    whiffPunishers: curated?.whiffPunishers ?? [],
    lessons: curated?.lessons ?? [],
    frames: { ...f.frames, moves, source: { ...f.frames.source, fetchedAt: f.updatedAt } },
    moveIndex,
  };
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

/** True if an ISO date (YYYY-MM-DD...) is within the last `days` days. */
export function isRecent(date: string | null | undefined, days = 7, now = new Date()): boolean {
  if (!date) return false;
  const t = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  return Number.isFinite(t) && now.getTime() - t <= days * 86400000 && t <= now.getTime() + 86400000;
}
