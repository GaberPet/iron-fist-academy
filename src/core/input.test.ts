import { DEFAULT_CONTROLLER, dirFromCardinals, dirFromStick, readPad, readKeyboard, describeGamepad, STANDARD_INDEX, type RawPadState } from './input';

function pad(pressed: number[], axes = [0, 0, 0, 0]): RawPadState {
  return {
    buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

describe('direction mapping', () => {
  it('combines cardinals and resolves SOCD to neutral', () => {
    expect(dirFromCardinals(false, true, false, true)).toBe('df');
    expect(dirFromCardinals(true, true, false, false)).toBe('n');
    expect(dirFromCardinals(false, false, true, true)).toBe('n');
  });

  it('mirrors forward/back on the P2 side', () => {
    expect(dirFromCardinals(false, false, false, true, true)).toBe('b');
    expect(dirFromCardinals(false, true, true, false, true)).toBe('df');
  });

  it('reads 8-way stick with deadzone', () => {
    expect(dirFromStick(0.2, 0.1, 0.5)).toBe('n');
    expect(dirFromStick(1, 0, 0.5)).toBe('f');
    expect(dirFromStick(0.7, 0.7, 0.5)).toBe('df'); // +y is down
    expect(dirFromStick(-0.7, -0.7, 0.5)).toBe('ub');
    expect(dirFromStick(0, -1, 0.5)).toBe('u');
  });
});

describe('readPad', () => {
  it('maps DualSense face buttons to Tekken 1-4 (Square=1 Triangle=2 Cross=3 Circle=4)', () => {
    expect(readPad(pad([STANDARD_INDEX.square]), DEFAULT_CONTROLLER).buttons).toBe(0b0001);
    expect(readPad(pad([STANDARD_INDEX.triangle]), DEFAULT_CONTROLLER).buttons).toBe(0b0010);
    expect(readPad(pad([STANDARD_INDEX.cross]), DEFAULT_CONTROLLER).buttons).toBe(0b0100);
    expect(readPad(pad([STANDARD_INDEX.circle]), DEFAULT_CONTROLLER).buttons).toBe(0b1000);
  });

  it('supports shoulder macros after remapping and d-pad priority over stick', () => {
    const cfg = { ...DEFAULT_CONTROLLER, tekken: { ...DEFAULT_CONTROLLER.tekken, r1: [1, 2] as (1 | 2 | 3 | 4)[] } };
    const r = readPad(pad([STANDARD_INDEX.r1, STANDARD_INDEX.down], [-1, 0, 0, 0]), cfg);
    expect(r.buttons).toBe(0b0011);
    expect(r.dir).toBe('d');
  });

  it('falls back to the stick when the d-pad is neutral', () => {
    expect(readPad(pad([], [1, 0, 0, 0]), DEFAULT_CONTROLLER).dir).toBe('f');
  });

  it('honours a remapped raw index (non-standard mapping)', () => {
    const cfg = { ...DEFAULT_CONTROLLER, rawIndex: { ...DEFAULT_CONTROLLER.rawIndex, square: 7 } };
    expect(readPad(pad([7]), cfg).buttons).toBe(0b0001);
  });
});

describe('keyboard fallback', () => {
  it('reads WASD + UIJK', () => {
    const r = readKeyboard(new Set(['KeyS', 'KeyD', 'KeyI']));
    expect(r).toEqual({ dir: 'df', buttons: 0b0010 });
  });
});

describe('describeGamepad', () => {
  it('recognises DualSense ids from Chromium', () => {
    expect(describeGamepad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)').kind).toBe('dualsense');
    expect(describeGamepad('Xbox 360 Controller (XInput STANDARD GAMEPAD)').kind).toBe('xinput');
  });
});
