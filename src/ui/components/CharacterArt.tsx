// Original character card art. No game assets: every visual is generated from the character's
// name, so all characters get a distinct, consistent card.
import { hashId } from '../../data/wavuParse.js';

import { useState } from 'react';

export type ArtVariant = 'photo' | 'emblem' | 'silhouette' | 'type' | 'mix';

/** Deterministic pseudo-random numbers from a name. */
function seeded(name: string) {
  let s = parseInt(hashId(name), 36) || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

export function hueFor(name: string): number {
  return parseInt(hashId(name), 36) % 360;
}

/** Initials: "Armor King" -> "AK", "Jack-8" -> "J8", "Anna" -> "AN". */
export function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function Emblem({ name, hue }: { name: string; hue: number }) {
  const r = seeded(name);
  const sides = 3 + Math.floor(r() * 4); // 3..6
  const rot = r() * 360;
  const rings = 1 + Math.floor(r() * 3);
  const slashes = Math.floor(r() * 3);
  const poly = (radius: number, offset = 0) =>
    Array.from({ length: sides }, (_, i) => {
      const a = ((i / sides) * 360 + rot + offset) * (Math.PI / 180);
      return `${100 + radius * Math.cos(a)},${100 + radius * Math.sin(a)}`;
    }).join(' ');
  const strong = `oklch(78% 0.16 ${hue})`;
  const soft = `oklch(55% 0.12 ${hue} / 0.55)`;
  return (
    <svg viewBox="0 0 200 200" aria-hidden className="art-svg">
      {Array.from({ length: rings }, (_, i) => (
        <polygon key={i} points={poly(88 - i * 18, i * 12)} fill="none" stroke={i === 0 ? strong : soft} strokeWidth={i === 0 ? 5 : 2} />
      ))}
      <polygon points={poly(34, 180 / sides)} fill={strong} />
      {Array.from({ length: slashes }, (_, i) => (
        <line key={i} x1={30 + i * 22} y1={182} x2={120 + i * 22} y2={18} stroke={soft} strokeWidth={6} strokeLinecap="square" />
      ))}
    </svg>
  );
}

// Original, generic fighting-stance silhouettes (not traced from any game).
const POSES = [
  // guard up, weight back
  'M96 40a14 14 0 1 1 0.1 0zM86 60h22l10 34-10 6-6-18-4 46 14 60h-14l-14-52-12 52H58l16-62-2-40-14 16-10-6 20-32z',
  // high kick
  'M70 38a14 14 0 1 1 0.1 0zM62 58h20l8 30 60-30 6 12-58 36-6 20 8 70H86l-8-60-16 60H48l14-82-14 12-8-8 18-28z',
  // low stance, lunging punch
  'M80 64a14 14 0 1 1 0.1 0zM70 84h22l48-8 2 12-44 14 2 22 34 72h-15l-28-58-18 58H58l14-74-20 10-6-10 22-24z',
  // ready stance, fists low
  'M100 36a14 14 0 1 1 0.1 0zM88 56h24l14 40-10 4-10-24 0 40 20 84h-15l-18-70-18 70H60l20-84 0-40-10 24-10-4z',
];

function Silhouette({ name, hue }: { name: string; hue: number }) {
  const r = seeded(name);
  const pose = POSES[Math.floor(r() * POSES.length)];
  const flip = r() > 0.5;
  return (
    <svg viewBox="0 0 200 240" aria-hidden className="art-svg">
      <circle cx="100" cy="120" r="92" fill={`oklch(40% 0.12 ${hue} / 0.35)`} />
      <path d="M0 236h200" stroke={`oklch(70% 0.14 ${hue} / 0.6)`} strokeWidth="3" />
      <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
        <path d={pose} fill={`oklch(88% 0.06 ${hue})`} />
      </g>
    </svg>
  );
}

function TypeArt({ name, hue }: { name: string; hue: number }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className="art-svg">
      <defs>
        <pattern id={`st-${hue}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect width="4" height="10" fill={`oklch(45% 0.1 ${hue} / 0.35)`} />
        </pattern>
      </defs>
      <rect width="200" height="200" fill={`url(#st-${hue})`} />
      <text x="100" y="150" textAnchor="middle" className="art-initials" fill={`oklch(80% 0.15 ${hue})`}>{initials(name)}</text>
    </svg>
  );
}

function Mix({ name, hue }: { name: string; hue: number }) {
  return (
    <div className="art-mix">
      <div className="art-mix-back"><Emblem name={name} hue={hue} /></div>
      <svg viewBox="0 0 200 200" aria-hidden className="art-svg art-mix-front">
        <text x="100" y="150" textAnchor="middle" className="art-initials" fill="var(--color-ink)">{initials(name)}</text>
      </svg>
    </div>
  );
}

/** A freely licensed motif photo from Wikimedia Commons (credited on the Credits page). */
function Photo({ id, name, hue }: { id: string; name: string; hue: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Emblem name={name} hue={hue} />;
  return <img className="art-photo" src={`./portraits/${id}.jpg`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function CharacterArt({ id, name, variant }: { id: string; name: string; variant: ArtVariant }) {
  const hue = hueFor(name);
  if (variant === 'photo') return <Photo id={id} name={name} hue={hue} />;
  if (variant === 'silhouette') return <Silhouette name={name} hue={hue} />;
  if (variant === 'type') return <TypeArt name={name} hue={hue} />;
  if (variant === 'mix') return <Mix name={name} hue={hue} />;
  return <Emblem name={name} hue={hue} />;
}
