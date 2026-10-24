// Quiz generation. Answers are computed from imported frame data (never hand-written),
// except the notation/throw-break banks, which are general Tekken rules.
import type { CharacterData, Move, QuizGenerator } from '../types';
import { classifySafety, firstHitLevel, punishersFor, SAFETY_EXPLAIN, SAFETY_TEXT, type Safety } from './frames';
import { lookupMove } from '../data';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  moveId?: string;
  dataNote?: string; // provenance of the fact behind the answer
}

export type Rng = () => number;

/** Small seedable PRNG (mulberry32) so quizzes are reproducible in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, n);
}

/** Build a question with shuffled options. */
function q(id: string, prompt: string, correct: string, wrong: string[], explain: string, extra: Partial<QuizQuestion> = {}, rng: Rng): QuizQuestion {
  const options = shuffle([correct, ...wrong], rng);
  return { id, prompt, options, answer: options.indexOf(correct), explain, ...extra };
}

const label = (m: Move) => `${m.input}${m.name ? ` (${m.name})` : ''}`;
const dataNote = (c: CharacterData) => `Frame data: ${c.frames.source.name}, fetched ${c.frames.source.fetchedAt?.slice(0, 10) ?? 'unknown date'}`;

function movesFor(c: CharacterData, ids?: string[]): Move[] {
  if (ids?.length) return ids.map((id) => lookupMove(c, id)).filter((m): m is Move => !!m);
  const key = c.keyMoves.map((k) => lookupMove(c, k.id)).filter((m): m is Move => !!m);
  return key.length >= 6 ? key : c.frames.moves;
}

const SAFETY_OPTIONS: Safety[] = ['plus', 'safe', 'punishable', 'launch-punishable'];

function safetyQuestions(c: CharacterData, count: number, rng: Rng, ids?: string[]): QuizQuestion[] {
  const pool = movesFor(c, ids).filter((m) => SAFETY_OPTIONS.includes(classifySafety(m)));
  return sample(pool, count, rng).map((m) => {
    const s = classifySafety(m);
    return q(
      `safety:${c.profile.id}:${m.id}`,
      `${c.profile.short}'s ${label(m)} is blocked. What is the situation?`,
      SAFETY_TEXT[s],
      SAFETY_OPTIONS.filter((x) => x !== s).map((x) => SAFETY_TEXT[x]),
      `${m.input} is ${m.block} on block. ${SAFETY_EXPLAIN[s]}`,
      { moveId: m.id, dataNote: dataNote(c) },
      rng,
    );
  });
}

const LEVEL_TEXT = { high: 'High', mid: 'Mid', low: 'Low', throw: 'Throw' } as const;

function hitLevelQuestions(c: CharacterData, count: number, rng: Rng, ids?: string[]): QuizQuestion[] {
  const pool = movesFor(c, ids).filter((m) => ['high', 'mid', 'low', 'throw'].includes(firstHitLevel(m)));
  return sample(pool, count, rng).map((m) => {
    const lv = firstHitLevel(m) as keyof typeof LEVEL_TEXT;
    const block = { high: 'Block standing or duck it.', mid: 'Block standing; crouching gets hit.', low: 'Block crouching.', throw: 'Break it or duck it.' }[lv];
    return q(
      `hitlevel:${c.profile.id}:${m.id}`,
      `What is the hit level of ${c.profile.short}'s ${label(m)}${m.hitLevels.length > 1 ? ' (first hit)' : ''}?`,
      LEVEL_TEXT[lv],
      Object.values(LEVEL_TEXT).filter((x) => x !== LEVEL_TEXT[lv]),
      `${m.input} hits ${m.hitLevels.join(', ')} (Wavu notation). ${block}`,
      { moveId: m.id, dataNote: dataNote(c) },
      rng,
    );
  });
}

function startupQuestions(c: CharacterData, count: number, rng: Rng, ids?: string[]): QuizQuestion[] {
  const pool = movesFor(c, ids).filter((m) => m.startupFrame !== null && !m.parent && !m.isThrow);
  const out: QuizQuestion[] = [];
  for (let i = 0; i < count * 4 && out.length < count; i++) {
    const trio = sample(pool, 3, rng);
    if (trio.length < 3) break;
    const frames = trio.map((m) => m.startupFrame!);
    if (new Set(frames).size < 3) continue;
    const fastest = trio[frames.indexOf(Math.min(...frames))];
    const id = `startup:${c.profile.id}:${trio.map((m) => m.id).sort().join('|')}`;
    if (out.some((x) => x.id === id)) continue;
    out.push(
      q(
        id,
        `Which of ${c.profile.short}'s moves comes out fastest?`,
        label(fastest),
        trio.filter((m) => m !== fastest).map(label),
        trio.map((m) => `${m.input}: ${m.startup}`).join(' · ') + '. Lower startup = faster.',
        { dataNote: dataNote(c) },
        rng,
      ),
    );
  }
  return out;
}

/** "You block <opponent move> (-13). Which punisher is guaranteed?" */
export function punisherQuestions(c: CharacterData, opponents: CharacterData[], count: number, rng: Rng): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  const candidates: { opp: CharacterData; m: Move; stance: 'standing' | 'crouching' }[] = [];
  for (const opp of opponents) {
    for (const m of opp.frames.moves) {
      if (m.isThrow || m.blockFrame === null || !m.blockRange || m.blockRange[0] !== m.blockRange[1]) continue;
      if (m.blockFrame > -10 || m.blockFrame < -24) continue;
      const lv = firstHitLevel(m);
      if (m.hitLevels.length !== 1) continue; // single-hit moves only, so the punish window is unambiguous
      if (lv === 'mid' || lv === 'high') candidates.push({ opp, m, stance: 'standing' });
      else if (lv === 'low') candidates.push({ opp, m, stance: 'crouching' });
    }
  }
  for (const { opp, m, stance } of shuffle(candidates, rng)) {
    if (out.length >= count) break;
    const best = punishersFor(c.punishers, m.blockFrame!, stance);
    if (!best.length) continue;
    const window = -m.blockFrame!;
    const tooSlow = c.punishers.filter((p) => p.stance === stance && -p.window > window);
    const distinct = [...new Map(tooSlow.map((p) => [p.moveId, p])).values()];
    if (distinct.length < 2) continue;
    const correct = sample(best, 1, rng)[0];
    const wrong = sample(distinct, 3, rng);
    const fmt = (p: { moveId: string; window: number }) => `${p.moveId} (punishes ${p.window})`;
    out.push(
      q(
        `punish:${c.profile.id}:${opp.profile.id}:${m.id}`,
        `You ${stance === 'standing' ? 'block' : 'crouch-block'} ${opp.profile.short}'s ${label(m)}, which is ${m.block} on block. Which of your punishers is guaranteed and strongest?`,
        fmt(correct),
        wrong.map(fmt),
        `${m.block} gives you a ${window}-frame window. ${correct.moveId} is listed for ${correct.window}; the others need a bigger window. ${correct.note ?? ''}`.trim(),
        { moveId: m.id, dataNote: `${dataNote(opp)}; punishers: Wavu punisher table` },
        rng,
      ),
    );
  }
  return out;
}

const NOTATION_BANK: [string, string, string[], string][] = [
  ['What does "df+2" mean?', 'Hold down-forward and press 2 (right punch)', ['Tap down, then forward, then 2', 'Press 2 then down-forward', 'Hold down and press 2'], 'A "+" joins a direction and button pressed together.'],
  ['What does "1+2" mean?', 'Press 1 and 2 at the same time', ['Press 1, then 2', 'Hold 1, then tap 2', 'Press 1 twice'], '"+" between buttons = simultaneous.'],
  ['What does "1,2" mean?', 'Press 1, then 2 (a string)', ['Press 1 and 2 together', 'Hold 1 and 2', 'Press 2 then 1'], 'A comma means "followed by".'],
  ['What does uppercase "F" mean in "f,F+2"?', 'Hold forward', ['Tap forward quickly', 'Press forward on the right stick', 'Forward on counter hit'], 'Uppercase directions are held.'],
  ['What does "ws" mean?', 'While standing up from a crouch', ['While sidestepping', 'Wall splat', 'While running'], 'Crouch, release down and press as you rise.'],
  ['On a PS5 controller with Tekken 8 defaults, which button is 3?', '✕ (Cross)', ['□ (Square)', '△ (Triangle)', '○ (Circle)'], '1 = □, 2 = △, 3 = ✕, 4 = ○.'],
  ['What does "CH" before a move mean?', 'The move must hit as a counter hit', ['Crouching hit', 'Charge the move', 'Cancel the move'], 'Counter hit = hitting an opponent during their attack startup.'],
  ['What does "~" mean in "f+3,2~DF"?', 'Immediately after (cancel), then hold down-forward', ['Delay the input', 'Press on the same frame', 'Optional input'], '"~" means immediately follow with the next input.'],
  ['What does "H." mean in "H.2+3"?', 'Only during Heat', ['Hold the buttons', 'High attack', 'Hard input'], '"H." marks Heat-only moves.'],
  ['What does "qcf" mean?', 'Quarter circle forward: d, df, f', ['Quick crouch forward', 'Forward, forward', 'd, db, b'], 'qcf = down, down-forward, forward.'],
];

const THROW_BANK: [string, string, string[], string][] = [
  ['A throw started with 1+3 (left arm grabs first) is broken with:', '1', ['2', '1+2', '3+4'], 'Left-arm throws are broken with 1.'],
  ['A throw started with 2+4 (right arm first) is broken with:', '2', ['1', '1+2', '3+4'], 'Right-arm throws are broken with 2.'],
  ['A throw where both arms reach together (1+2 type) is broken with:', '1+2', ['1', '2', '3+4'], 'Both-arm throws are broken with 1+2.'],
  ['Which stance avoids standing throws entirely?', 'Crouching', ['Holding back', 'Sidestepping', 'Holding forward'], 'Standing throws whiff on crouching opponents.'],
];

function bankQuestions(prefix: string, bank: [string, string, string[], string][], count: number, rng: Rng): QuizQuestion[] {
  return sample(bank, count, rng).map(([prompt, correct, wrong, explain], i) => q(`${prefix}:${i}:${prompt.slice(0, 20)}`, prompt, correct, wrong, explain, { dataNote: 'General Tekken rule' }, rng));
}

export function generateQuiz(gen: QuizGenerator, c: CharacterData, opponents: CharacterData[], count: number, rng: Rng, moveIds?: string[]): QuizQuestion[] {
  switch (gen) {
    case 'safety':
      return safetyQuestions(c, count, rng, moveIds);
    case 'hitlevel':
      return hitLevelQuestions(c, count, rng, moveIds);
    case 'startup':
      return startupQuestions(c, count, rng, moveIds);
    case 'punisher':
      return punisherQuestions(c, opponents, count, rng);
    case 'notation':
      return bankQuestions('notation', NOTATION_BANK, count, rng);
    case 'throwbreak':
      return bankQuestions('throw', THROW_BANK, count, rng);
  }
}
