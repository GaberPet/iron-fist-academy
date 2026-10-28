// Stylized DualSense diagram that lights up physical buttons and shows stick positions.
import type { PadButton } from '../../core/input';

interface Props {
  pressed: PadButton[];
  axes?: number[];
  /** Tekken labels drawn under face buttons, e.g. { square: '1' } */
  labels?: Partial<Record<PadButton, string>>;
}

export function ControllerDiagram({ pressed, axes = [0, 0, 0, 0], labels = {} }: Props) {
  const on = (b: PadButton) => (pressed.includes(b) ? 'btn-shape on' : 'btn-shape');
  const lx = 210 + (axes[0] ?? 0) * 14;
  const ly = 250 + (axes[1] ?? 0) * 14;
  const rx = 390 + (axes[2] ?? 0) * 14;
  const ry = 250 + (axes[3] ?? 0) * 14;
  const face: [PadButton, number, number, string, string][] = [
    ['triangle', 470, 120, '△', 'var(--ps-triangle)'],
    ['square', 432, 158, '□', 'var(--ps-square)'],
    ['circle', 508, 158, '○', 'var(--ps-circle)'],
    ['cross', 470, 196, '✕', 'var(--ps-cross)'],
  ];
  const dpad: [PadButton, number, number, number, number][] = [
    ['up', 118, 104, 24, 32],
    ['down', 118, 180, 24, 32],
    ['left', 80, 146, 32, 24],
    ['right', 148, 146, 32, 24],
  ];
  return (
    <svg className="pad-svg" viewBox="0 0 600 360" role="img" aria-label="DualSense controller diagram">
      {/* triggers & bumpers */}
      <rect className={on('l2')} x="70" y="8" width="100" height="26" rx="12" />
      <rect className={on('r2')} x="430" y="8" width="100" height="26" rx="12" />
      <rect className={on('l1')} x="66" y="40" width="110" height="18" rx="8" />
      <rect className={on('r1')} x="424" y="40" width="110" height="18" rx="8" />
      <text x="120" y="26" textAnchor="middle" fontSize="12" fill="#c9cfdd">L2{labels.l2 ? ` · ${labels.l2}` : ''}</text>
      <text x="480" y="26" textAnchor="middle" fontSize="12" fill="#c9cfdd">R2{labels.r2 ? ` · ${labels.r2}` : ''}</text>
      <text x="121" y="53" textAnchor="middle" fontSize="11" fill="#c9cfdd">L1{labels.l1 ? ` · ${labels.l1}` : ''}</text>
      <text x="479" y="53" textAnchor="middle" fontSize="11" fill="#c9cfdd">R1{labels.r1 ? ` · ${labels.r1}` : ''}</text>
      {/* body */}
      <path className="body" d="M120 64 H480 C540 64 572 110 584 180 C596 250 590 330 540 344 C500 356 470 320 446 286 C430 262 410 256 390 256 H210 C190 256 170 262 154 286 C130 320 100 356 60 344 C10 330 4 250 16 180 C28 110 60 64 120 64 Z" />
      <path className="grip" d="M210 256 H390 C410 256 430 262 446 286 L420 300 C400 280 380 276 300 276 C220 276 200 280 180 300 L154 286 C170 262 190 256 210 256 Z" />
      {/* touchpad, create, options, ps */}
      <rect className={on('touchpad')} x="200" y="72" width="200" height="96" rx="14" />
      <text x="300" y="124" textAnchor="middle" fontSize="12" fill="#c9cfdd">Touchpad</text>
      <rect className={on('create')} x="176" y="82" width="14" height="26" rx="5" />
      <rect className={on('options')} x="410" y="82" width="14" height="26" rx="5" />
      <circle className={on('ps')} cx="300" cy="196" r="13" />
      <text x="300" y="200" textAnchor="middle" fontSize="10" fill="#c9cfdd">PS</text>
      {/* d-pad */}
      {dpad.map(([b, x, y, w, h]) => (
        <rect key={b} className={on(b)} x={x} y={y} width={w} height={h} rx="5" />
      ))}
      {/* face buttons */}
      {face.map(([b, x, y, sym, col]) => (
        <g key={b}>
          <circle className={on(b)} cx={x} cy={y} r="18" />
          <text x={x} y={y + 6} textAnchor="middle" fontSize="18" fill={pressed.includes(b) ? '#fff' : col}>{sym}</text>
          {labels[b] && <text x={x + 24} y={y - 12} textAnchor="middle" fontSize="12" fill="#d6d6d6">{labels[b]}</text>}
        </g>
      ))}
      {/* sticks */}
      <circle cx="210" cy="250" r="30" fill="#1d2230" />
      <circle className={on('l3')} cx={lx} cy={ly} r="20" />
      <circle cx="390" cy="250" r="30" fill="#1d2230" />
      <circle className={on('r3')} cx={rx} cy={ry} r="20" />
    </svg>
  );
}
