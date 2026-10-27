// Generic, original looks for the arena fighters: body type, hair and colours only.
// No Bandai Namco designs or art are reproduced; the colours are loose hints so characters can be told apart.
import type { FighterLook } from './arenaRenderer';

type Partial = Pick<FighterLook, 'build' | 'hairStyle'> & { hair?: string; skin?: string; top?: string; pants?: string };

const F = (hairStyle: FighterLook['hairStyle'], hair: string, skin = '#e3b394'): Partial => ({ build: 'female', hairStyle, hair, skin });
const M = (hairStyle: FighterLook['hairStyle'], hair: string, skin = '#d9a07c'): Partial => ({ build: 'male', hairStyle, hair, skin });

const LOOKS: Record<string, Partial> = {
  // women
  alisa: F('bob', '#e889b0', '#f0cdb6'),
  anna: F('bob', '#2a1a14'),
  asuka: F('short', '#4a2c1a'),
  azucena: F('ponytail', '#22160f', '#c88d68'),
  jun: F('long', '#120c0a'),
  leo: F('short', '#c99a52'),
  lidia: F('ponytail', '#3b2418'),
  lili: F('long', '#f0d58a', '#f2d2bd'),
  'miary-zo': F('ponytail', '#1c120c', '#9c6644'),
  nina: F('ponytail', '#efd27a', '#f0cdb6'),
  reina: F('short', '#c9b07a'),
  xiaoyu: F('buns', '#1a110c'),
  zafina: F('long', '#0f0b0a', '#c48a63'),
  // men
  'armor-king': { ...M('bald', '#1a1a1a', '#6b4a35'), top: '#111114' },
  bob: M('short', '#e4c27a', '#f0c8a8'),
  bryan: M('short', '#3a2a1e', '#d9a585'),
  claudio: M('short', '#20160f'),
  clive: M('short', '#e8dcc0', '#f0c8a8'),
  'devil-jin': M('spiky', '#0d0b0b', '#b9a6b0'),
  dragunov: M('short', '#1b1b1b', '#e8d6cc'),
  eddy: M('short', '#141010', '#8a5a3c'),
  fahkumram: M('short', '#141010', '#a8704c'),
  feng: M('short', '#141010'),
  heihachi: M('spiky', '#cfcfcf'),
  hwoarang: M('spiky', '#b5422a'),
  jin: M('spiky', '#0f0c0b'),
  kazuya: M('spiky', '#141010'),
  king: M('bald', '#1a1a1a', '#b98a5a'),
  lars: M('spiky', '#7a5232'),
  law: M('short', '#141010'),
  lee: M('short', '#c8c8d0'),
  leroy: M('short', '#e6e6e6', '#6e4630'),
  paul: M('spiky', '#e6cf74', '#f0c8a8'),
  raven: M('bald', '#d8d8d8', '#5a3a28'),
  shaheen: M('short', '#141010', '#b98060'),
  steve: M('short', '#e4c27a', '#f0c8a8'),
  victor: M('short', '#d6d6d6', '#f0c8a8'),
  yoshimitsu: M('bald', '#20181a', '#8a8f9c'),
  // non-human
  kuma: { build: 'beast', hairStyle: 'bald', hair: '#4a2e1c', skin: '#5a3822' },
  panda: { build: 'beast', hairStyle: 'bald', hair: '#141414', skin: '#ecebe6' },
  'jack-8': { build: 'robot', hairStyle: 'bald', hair: '#2a2e36', skin: '#8f98a6', top: '#4a5260', pants: '#3a414c' },
};

/** Look for a character. `role` picks the default outfit (you = red gloves, bot = blue). */
export function lookFor(charId: string | undefined, color: string, role: 'you' | 'bot'): FighterLook {
  const l = (charId && LOOKS[charId]) || M('short', '#1a1210');
  const beast = l.build === 'beast' || l.build === 'robot';
  return {
    build: l.build,
    hairStyle: l.hairStyle,
    hair: l.hair ?? '#1a1210',
    skin: l.skin ?? '#d9a07c',
    top: beast ? (l.top ?? l.skin ?? '#555') : (l.top ?? color),
    pants: beast ? (l.pants ?? l.skin ?? '#333') : (l.pants ?? '#1d1d26'),
    shoes: beast ? (l.hair ?? '#222') : role === 'you' ? '#141418' : '#e8e8ec',
    gloves: role === 'you' ? '#c8282c' : '#2b6fd6',
    belt: beast ? (l.pants ?? l.skin ?? '#333') : role === 'you' ? '#ffad00' : '#9aa0aa',
  };
}

/** True for characters drawn with the female build. */
export const isFemale = (charId: string) => LOOKS[charId]?.build === 'female';
