// Iron Fist Academy logo, option C: nested diamonds with a rising chevron ("level up"), drawn
// in one stroke weight. Black or white only (Level Academy brand rules): `tone` picks which.
// The mark alone is used in small spaces; the full logo adds the heavy / light wordmark.
export function LogoMark({ size = 40, tone = 'white', title = 'Iron Fist Academy' }: { size?: number; tone?: 'white' | 'black'; title?: string }) {
  const ink = tone === 'white' ? '#ffffff' : '#000000';
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      <g fill="none" strokeWidth="5.5">
        <path d="M50 4 L96 50 L50 96 L4 50 Z" stroke={ink} />
        <path d="M50 26 L74 50 L50 74 L26 50 Z" stroke="#8a8a8a" />
        <path d="M34 58 L50 42 L66 58" stroke={ink} strokeLinecap="square" />
      </g>
    </svg>
  );
}

/** Kept for existing imports: the white mark (on the black sidebar). */
export function Logo({ size = 40, title = 'Iron Fist Academy' }: { size?: number; title?: string }) {
  return <LogoMark size={size} tone="white" title={title} />;
}

/** Wordmark: IRONFIST heavy caps, ACADEMY light caps (the heavy / light contrast of the brand). */
export function Wordmark() {
  return (
    <span className="brand-name" aria-hidden>
      <b>IRONFIST</b>
      <span>ACADEMY</span>
    </span>
  );
}
