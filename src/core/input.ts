// Controller input normalization: raw Gamepad / keyboard -> Tekken input frame.
// Pure functions so they can be unit tested without a browser.
import type { Dir, TekkenButton } from '../types';

/** Logical DualSense buttons, named as printed on the controller. */
export type PadButton =
  | 'cross' | 'circle' | 'square' | 'triangle'
  | 'l1' | 'r1' | 'l2' | 'r2'
  | 'create' | 'options' | 'l3' | 'r3'
  | 'up' | 'down' | 'left' | 'right'
  | 'ps' | 'touchpad';

export const PAD_BUTTONS: PadButton[] = [
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
  'create', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'ps', 'touchpad',
];

export const PAD_LABEL: Record<PadButton, string> = {
  cross: '✕', circle: '○', square: '□', triangle: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2',
  create: 'Create', options: 'Options', l3: 'L3', r3: 'R3', up: 'D-pad ↑', down: 'D-pad ↓',
  left: 'D-pad ←', right: 'D-pad →', ps: 'PS', touchpad: 'Touchpad',
};

export type PadStyle = 'ps' | 'xbox' | 'stick';
export const PAD_STYLES: PadStyle[] = ['ps', 'xbox', 'stick'];

// Xbox pads and arcade sticks report the same standard buttons; only the names on them differ.
const XBOX_LABEL: Partial<Record<PadButton, string>> = {
  cross: 'A', circle: 'B', square: 'X', triangle: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT',
  create: 'View', options: 'Menu', ps: 'Xbox', touchpad: 'Share', l3: 'LS', r3: 'RS',
};
/** Arcade stick (Vewlix layout): top row □ △ R1 L1, bottom row ✕ ○ R2 L2, numbered left to right. */
export const STICK_LABEL: Partial<Record<PadButton, string>> = {
  square: 'Top 1', triangle: 'Top 2', r1: 'Top 3', l1: 'Top 4', cross: 'Bottom 1', circle: 'Bottom 2', r2: 'Bottom 3', l2: 'Bottom 4',
  create: 'Select', options: 'Start', ps: 'Home', up: 'Stick ↑', down: 'Stick ↓', left: 'Stick ←', right: 'Stick →',
};

export function padLabel(b: PadButton, style: PadStyle): string {
  return (style === 'xbox' ? XBOX_LABEL[b] : style === 'stick' ? STICK_LABEL[b] : undefined) ?? PAD_LABEL[b];
}

/** W3C "standard" gamepad mapping indices (what Chromium reports for a DualSense). */
export const STANDARD_INDEX: Record<PadButton, number> = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  create: 8, options: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, ps: 16, touchpad: 17,
};

export interface ControllerConfig {
  /** Physical button -> raw gamepad button index (remappable for non-standard mappings). */
  rawIndex: Record<PadButton, number>;
  /** Physical button -> Tekken buttons it presses (e.g. R1 -> [1,2]). */
  tekken: Partial<Record<PadButton, TekkenButton[]>>;
  stickDeadzone: number; // 0..1
  useLeftStick: boolean;
  useDpad: boolean;
  /** Mirror left/right, for practicing from the P2 side. */
  p2Side: boolean;
  triggerThreshold: number; // analog L2/R2 press threshold
}

/** Tekken 8's default PlayStation layout for the four attack buttons. Shoulders are left unmapped:
 *  set them to match your in-game Button Config. */
export const DEFAULT_CONTROLLER: ControllerConfig = {
  rawIndex: { ...STANDARD_INDEX },
  tekken: { square: [1], triangle: [2], cross: [3], circle: [4] },
  stickDeadzone: 0.5,
  useLeftStick: true,
  useDpad: true,
  p2Side: false,
  triggerThreshold: 0.5,
};

export interface RawPadState {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

export interface TekkenInput {
  dir: Dir;
  /** Bitmask: bit0 = 1 (LP), bit1 = 2 (RP), bit2 = 3 (LK), bit3 = 4 (RK). */
  buttons: number;
}

export const buttonBit = (b: TekkenButton) => 1 << (b - 1);
export const maskOf = (bs: TekkenButton[]) => bs.reduce((m, b) => m | buttonBit(b), 0);
export const buttonsOf = (mask: number): TekkenButton[] =>
  ([1, 2, 3, 4] as TekkenButton[]).filter((b) => mask & buttonBit(b));
export const maskText = (mask: number) => buttonsOf(mask).join('+') || '—';

/** Combine up/down/left/right booleans into a direction (screen-space: right = forward on P1 side). */
export function dirFromCardinals(up: boolean, down: boolean, left: boolean, right: boolean, p2Side = false): Dir {
  if (up && down) { up = false; down = false; } // SOCD: neutral vertical
  if (left && right) { left = false; right = false; }
  const fwd = p2Side ? left : right;
  const back = p2Side ? right : left;
  if (up) return fwd ? 'uf' : back ? 'ub' : 'u';
  if (down) return fwd ? 'df' : back ? 'db' : 'd';
  if (fwd) return 'f';
  if (back) return 'b';
  return 'n';
}

/** 8-way direction from an analog stick (y axis positive = down, per Gamepad API). */
export function dirFromStick(x: number, y: number, deadzone: number, p2Side = false): Dir {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return 'n';
  // 8 sectors of 45°, centred on the cardinal/diagonal directions
  const angle = (Math.atan2(-y, x) * 180) / Math.PI; // 0 = right, 90 = up
  const sector = Math.round(((angle + 360) % 360) / 45) % 8;
  const screen = [
    [false, false, false, true], // right
    [true, false, false, true], // up-right
    [true, false, false, false], // up
    [true, false, true, false], // up-left
    [false, false, true, false], // left
    [false, true, true, false], // down-left
    [false, true, false, false], // down
    [false, true, false, true], // down-right
  ][sector];
  return dirFromCardinals(screen[0], screen[1], screen[2], screen[3], p2Side);
}

export function isPadPressed(state: RawPadState, cfg: ControllerConfig, btn: PadButton): boolean {
  const b = state.buttons[cfg.rawIndex[btn]];
  if (!b) return false;
  if (btn === 'l2' || btn === 'r2') return b.pressed || b.value >= cfg.triggerThreshold;
  return b.pressed;
}

export function pressedPadButtons(state: RawPadState, cfg: ControllerConfig): PadButton[] {
  return PAD_BUTTONS.filter((b) => isPadPressed(state, cfg, b));
}

/** Translate a raw gamepad snapshot into a Tekken input. */
export function readPad(state: RawPadState, cfg: ControllerConfig): TekkenInput {
  const p = (b: PadButton) => isPadPressed(state, cfg, b);
  let dir: Dir = 'n';
  if (cfg.useDpad) dir = dirFromCardinals(p('up'), p('down'), p('left'), p('right'), cfg.p2Side);
  if (dir === 'n' && cfg.useLeftStick && state.axes.length >= 2) {
    dir = dirFromStick(state.axes[0], state.axes[1], cfg.stickDeadzone, cfg.p2Side);
  }
  let buttons = 0;
  for (const [pad, tk] of Object.entries(cfg.tekken) as [PadButton, TekkenButton[]][]) {
    if (tk?.length && p(pad)) buttons |= maskOf(tk);
  }
  return { dir, buttons };
}

/** Keyboard fallback layout (for testing without a controller). */
export const KEYBOARD_LAYOUT = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  1: ['KeyU'],
  2: ['KeyI'],
  3: ['KeyJ'],
  4: ['KeyK'],
} as const;

export function readKeyboard(down: Set<string>, p2Side = false): TekkenInput {
  const any = (codes: readonly string[]) => codes.some((c) => down.has(c));
  const dir = dirFromCardinals(any(KEYBOARD_LAYOUT.up), any(KEYBOARD_LAYOUT.down), any(KEYBOARD_LAYOUT.left), any(KEYBOARD_LAYOUT.right), p2Side);
  let buttons = 0;
  ([1, 2, 3, 4] as TekkenButton[]).forEach((b) => {
    if (any(KEYBOARD_LAYOUT[b])) buttons |= buttonBit(b);
  });
  return { dir, buttons };
}

export function describeGamepad(id: string): { kind: 'dualsense' | 'dualsense-edge' | 'dualshock4' | 'xinput' | 'other'; label: string } {
  const s = id.toLowerCase();
  if (s.includes('0df2') || s.includes('dualsense edge')) return { kind: 'dualsense-edge', label: 'DualSense Edge' };
  if (s.includes('0ce6') || s.includes('dualsense')) return { kind: 'dualsense', label: 'DualSense (PS5)' };
  if (s.includes('054c') || s.includes('wireless controller') || s.includes('dualshock')) return { kind: 'dualshock4', label: 'PlayStation controller' };
  if (s.includes('xinput') || s.includes('xbox')) return { kind: 'xinput', label: 'XInput controller' };
  return { kind: 'other', label: 'Gamepad' };
}

export const DIR_ARROW: Record<Dir, string> = {
  n: '★', u: '↑', uf: '↗', f: '→', df: '↘', d: '↓', db: '↙', b: '←', ub: '↖',
};
