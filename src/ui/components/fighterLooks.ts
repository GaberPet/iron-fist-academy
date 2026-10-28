// Generic, original looks for the arena fighters: body type, hair and colours only.
// No Bandai Namco designs or art are reproduced; the colours are loose hints so characters can be told apart.
import type { FightStyle, FighterLook } from './arenaRenderer';

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
  kunimitsu: F('ponytail', '#2a1410'),
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

/** Outfit cut, height and width for the 3D fighters (generic categories, not the game's designs). */
const BODY: Record<string, [FighterLook['outfit'], number, number?]> = {
  alisa: ['suit', 0.93], anna: ['dress', 0.95], asuka: ['jacket', 0.92], azucena: ['tank', 0.93], jun: ['gi', 0.94], leo: ['jacket', 0.93],
  lidia: ['gi', 0.94], kunimitsu: ['suit', 0.93], lili: ['dress', 0.91], 'miary-zo': ['jacket', 0.93], nina: ['suit', 0.94], reina: ['jacket', 0.93],
  xiaoyu: ['dress', 0.88], zafina: ['dress', 0.95],
  'armor-king': ['bare', 1.08, 1.15], bob: ['tank', 1.0, 1.4], bryan: ['tank', 1.03], claudio: ['jacket', 1.0], clive: ['suit', 1.02],
  'devil-jin': ['bare', 1.01], dragunov: ['suit', 1.03], eddy: ['bare', 1.0], fahkumram: ['bare', 1.1, 1.1], feng: ['gi', 1.0],
  heihachi: ['gi', 0.97, 1.08], hwoarang: ['jacket', 1.0], jin: ['bare', 1.01], kazuya: ['bare', 1.0], king: ['bare', 1.06, 1.15],
  lars: ['suit', 1.03], law: ['bare', 0.98], lee: ['suit', 0.98], leroy: ['jacket', 0.97], paul: ['gi', 1.01], raven: ['suit', 1.03],
  shaheen: ['jacket', 1.02], steve: ['tank', 1.0], victor: ['suit', 1.01], yoshimitsu: ['suit', 1.0],
  kuma: ['bare', 1.25, 1.45], panda: ['bare', 1.2, 1.45], 'jack-8': ['suit', 1.22, 1.3],
};

/** Fighting style of each character (general martial-art families, used for the 3D stance). */
const STYLE: Record<string, FightStyle> = {
  steve: 'boxer', jin: 'karate', kazuya: 'mishima', 'devil-jin': 'mishima', heihachi: 'mishima', reina: 'mishima',
  'armor-king': 'wrestler', king: 'wrestler', eddy: 'capoeira', bryan: 'muaythai', fahkumram: 'muaythai',
  lee: 'kungfu', law: 'kungfu', xiaoyu: 'kungfu', feng: 'kungfu', jun: 'kungfu', leo: 'kungfu', azucena: 'kungfu', 'miary-zo': 'kungfu',
  hwoarang: 'kicker', lili: 'elegant', asuka: 'karate', leroy: 'wingchun', raven: 'ninja', kunimitsu: 'ninja', yoshimitsu: 'ninja',
  nina: 'elegant', anna: 'elegant', zafina: 'ninja', paul: 'grappler', dragunov: 'grappler', lidia: 'karate', claudio: 'karate',
  shaheen: 'kungfu', victor: 'boxer', clive: 'karate', bob: 'karate', alisa: 'robot', 'jack-8': 'robot', kuma: 'beast', panda: 'beast', lars: 'karate',
};

/** Look for a character. `role` picks the default outfit (you = red gloves, bot = blue). */
export function lookFor(charId: string | undefined, color: string, role: 'you' | 'bot'): FighterLook {
  const l = (charId && LOOKS[charId]) || M('short', '#1a1210');
  const beast = l.build === 'beast' || l.build === 'robot';
  const body = (charId && BODY[charId]) || ['tank', 1];
  return {
    id: charId,
    outfit: body[0],
    style: (charId && STYLE[charId]) || 'karate',
    height: body[1],
    width: body[2] ?? 1,
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
