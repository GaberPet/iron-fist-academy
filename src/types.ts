// Shared domain types.

/** Numpad-style direction for a player facing right (P1 side). */
export type Dir = 'n' | 'u' | 'uf' | 'f' | 'df' | 'd' | 'db' | 'b' | 'ub';
export type TekkenButton = 1 | 2 | 3 | 4;

export interface Move {
  id: string; // full notation, e.g. "df+1,2"
  num: number | null;
  name: string;
  alt: string[]; // alternate inputs, e.g. "u+2" for Anna's uf+2
  input: string;
  parent: string | null;
  hitLevels: string[];
  damage: string;
  startup: string;
  startupFrame: number | null;
  block: string;
  blockFrame: number | null;
  blockRange: [number, number] | null;
  hit: string;
  hitFrame: number | null;
  ch: string;
  crush: string;
  recovery: string;
  reach: string;
  tracks: string;
  notes: string;
  isThrow: boolean;
}

export interface DataSource {
  name: string;
  url: string;
  license?: string;
  revision?: number | null;
  fetchedAt?: string;
  note?: string;
}

export interface FrameDataFile {
  characterId: string;
  source: DataSource;
  moves: Move[];
}

export type MoveRole =
  | 'poke'
  | 'punisher'
  | 'launcher'
  | 'counter-hit'
  | 'whiff-punish'
  | 'pressure'
  | 'low'
  | 'mixup'
  | 'throw'
  | 'heat'
  | 'power-crush'
  | 'wall'
  | 'evasion';

/** Coach notes: strategic advice. Never a source of frame data. */
export interface KeyMoveNote {
  id: string; // move id in frames.json
  roles: MoveRole[];
  summary: string;
  purpose: string;
  use: string;
  avoid: string;
  counterplay: string;
  afterBlock: string;
  afterHit: string;
  afterEvade: string;
  gamePlan: string;
}

export interface ComboDef {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Starter(s) as written on the source, e.g. ["df+2", "uf+4"]. */
  starters: string[];
  situation: string;
  route: string; // notation after the starter
  damage?: string; // as listed by the source, verbatim
  wallCarry?: string;
  tags: string[];
  mistakes: string[];
  easierAlternative?: string; // combo id
  stepTips?: Record<string, string>; // notation token -> timing tip
  source: { name: string; url: string; revision?: number; verified: 'source' | 'unverified' };
}

export interface PunisherEntry {
  window: number; // e.g. -10 means opponent is -10
  moveId: string;
  stance: 'standing' | 'crouching';
  note?: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  short: string;
  color: string;
  overview: string;
  playstyle: string;
  strengths: string[];
  weaknesses: string[];
  stances: { code: string; name: string; entry: string; note: string }[];
  heat: string[];
  heatEngagers: string[];
  keyLaunchers: string[];
  /** Notation shorthands, e.g. { "CD.": "f,n,d,df+" } so CD.1 resolves to f,n,d,df+1. */
  stanceAliases?: Record<string, string>;
  sources: DataSource[];
}

export type Exercise =
  | { type: 'input'; moves: string[]; reps: number; note?: string }
  | { type: 'combo'; comboId: string; reps: number }
  | { type: 'quiz'; generator: QuizGenerator; moveIds?: string[]; count: number }
  | { type: 'drill'; drill: DrillId; reps: number; passRate: number }
  | { type: 'checklist'; items: string[] };

export type QuizGenerator = 'safety' | 'hitlevel' | 'startup' | 'punisher' | 'notation' | 'throwbreak';

export type DrillId =
  | 'punish-standing'
  | 'punish-crouching'
  | 'block-mixup'
  | 'throw-break'
  | 'whiff-punish'
  | 'mixed-pressure';

export interface Lesson {
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  title: string;
  objectives: string[];
  explanation: string; // light markup: paragraphs, "- " lists, **bold**, `code`
  visual?: { type: 'moves'; moveIds: string[] } | { type: 'controller' } | { type: 'frames'; moveIds: string[] };
  guided: Exercise;
  challenge: Exercise;
  success: string;
  review: string[];
  related: { moves?: string[]; lessons?: string[]; combos?: string[] };
  isStageTest?: boolean;
}

export interface CharacterCurated {
  profile: CharacterProfile;
  keyMoves: KeyMoveNote[];
  combos: ComboDef[];
  punishers: PunisherEntry[];
  whiffPunishers: string[];
  lessons: Lesson[];
}

export interface CharacterData extends CharacterCurated {
  frames: FrameDataFile;
  moveIndex: Map<string, Move>;
}
