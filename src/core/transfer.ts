// "Send to phone": progress packed small enough for a QR code, and merged on arrival.
// Packing: JSON → deflate-raw → base64url. Lessons, combos and practice time always fit; recent
// attempts (which drive the charts) are added newest first while they still fit.
import type { AttemptRecord, ComboState, LessonState, ProgressData } from './progress';
import { applyResets, migrateProgress } from './progress';

/** Characters of packed data a QR code still scans reliably from a screen (QR byte capacity is ~2950). */
export const MAX_PACKED = 2500;

export interface Transfer {
  v: 1;
  from: string; // player name
  source: 'desktop' | 'web';
  at: string;
  progress: ProgressData;
}

const toB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const slim = (a: AttemptRecord): AttemptRecord => ({
  at: a.at, char: a.char, kind: a.kind, itemId: a.itemId, success: a.success,
  ...(a.lessonId ? { lessonId: a.lessonId } : {}), ...(a.errorType ? { errorType: a.errorType } : {}),
});

async function pack(t: Transfer): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(t)), new CompressionStream('deflate-raw')));
}

/** Packs progress for a QR code; returns the packed text and how many attempts made it in. */
export async function encodeTransfer(p: ProgressData, from: string, source: Transfer['source'], at = new Date().toISOString()): Promise<{ data: string; attempts: number; total: number }> {
  const newest = [...p.attempts].sort((a, b) => b.at.localeCompare(a.at)).map(slim);
  const make = (n: number) => pack({ v: 1, from, source, at, progress: { ...p, attempts: newest.slice(0, n).reverse() } });
  // Binary search for the most attempts that still fit.
  let lo = 0;
  let hi = newest.length;
  let best = await make(0);
  if (best.length > MAX_PACKED) throw new Error('Your lesson progress alone is too big for one QR code. Use Export and Import instead.');
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const d = await make(mid);
    if (d.length <= MAX_PACKED) {
      lo = mid;
      best = d;
    } else hi = mid - 1;
  }
  return { data: best, attempts: lo, total: newest.length };
}

export async function decodeTransfer(data: string): Promise<Transfer> {
  const json = new TextDecoder().decode(await pipe(fromB64url(data), new DecompressionStream('deflate-raw')));
  const t = JSON.parse(json) as Transfer;
  if (t?.v !== 1 || typeof t.from !== 'string') throw new Error('This is not an Iron Fist Academy progress code.');
  return { ...t, progress: migrateProgress(t.progress) };
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);
const max = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));

function mergeLesson(a: LessonState | undefined, b: LessonState): LessonState {
  if (!a) return b;
  return {
    guidedPassed: a.guidedPassed || b.guidedPassed,
    challengePassed: a.challengePassed || b.challengePassed,
    mastered: a.mastered || b.mastered,
    masteredAt: earlier(a.masteredAt, b.masteredAt),
    lastPracticed: later(a.lastPracticed, b.lastPracticed),
    bestGuided: max(a.bestGuided, b.bestGuided),
    bestChallenge: max(a.bestChallenge, b.bestChallenge),
  };
}

function mergeCombo(a: ComboState | undefined, b: ComboState): ComboState {
  if (!a) return b;
  const base = a.attempts >= b.attempts ? a : b;
  return { ...base, mastered: a.mastered || b.mastered, bestStreak: Math.max(a.bestStreak, b.bestStreak), masteredAt: earlier(a.masteredAt, b.masteredAt), lastPracticed: later(a.lastPracticed, b.lastPracticed) };
}

/** Combines progress from another device. Scanning the same code twice changes nothing. */
export function mergeProgress(mineIn: ProgressData, theirsIn: ProgressData): ProgressData {
  // A reset on any device wins over older progress everywhere: apply the newest reset of each character to both sides first.
  const resets = { ...mineIn.resets };
  for (const [c, at] of Object.entries(theirsIn.resets ?? {})) if (!resets[c] || at > resets[c]) resets[c] = at;
  const mine = applyResets(mineIn, resets);
  const theirs = applyResets(theirsIn, resets);
  const lessons = { ...mine.lessons };
  for (const [k, v] of Object.entries(theirs.lessons)) lessons[k] = mergeLesson(lessons[k], v);
  const combos = { ...mine.combos };
  for (const [k, v] of Object.entries(theirs.combos)) combos[k] = mergeCombo(combos[k], v);
  const practiceSeconds = { ...mine.practiceSeconds };
  for (const [d, s] of Object.entries(theirs.practiceSeconds)) practiceSeconds[d] = Math.max(practiceSeconds[d] ?? 0, s);
  const key = (a: AttemptRecord) => `${a.at}|${a.kind}|${a.itemId}`;
  const seen = new Set(mine.attempts.map(key));
  const attempts = [...mine.attempts, ...theirs.attempts.filter((a) => !seen.has(key(a)))].sort((a, b) => a.at.localeCompare(b.at));
  return { ...mine, createdAt: earlier(mine.createdAt, theirs.createdAt) ?? mine.createdAt, lessons, combos, practiceSeconds, attempts };
}
