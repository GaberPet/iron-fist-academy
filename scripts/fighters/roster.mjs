// Fighter specs for the MPFB generator (gen_fighter.py). One realistic, original human per
// character: build, ethnicity, age, hairstyle and outfit are general hints, not copies of the
// game's designs. Kuma, Panda and Jack-8 are not human and keep their procedural models.
//
//   node scripts/fighters/roster.mjs <outdir>     writes <id>.json specs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const race = (asian, caucasian, african) => ({ asian, caucasian, african });
const ASIAN = race(1, 0, 0), WHITE = race(0, 1, 0), BLACK = race(0, 0, 1);
const MIX = (a, c, f) => race(a, c, f);

const M = (o) => ({ gender: 1, age: 0.5, muscle: 0.75, weight: 0.5, proportions: 0.85, height: 0.6, cupsize: 0.5, firmness: 0.5, ...o });
const F = (o) => ({ gender: 0, age: 0.45, muscle: 0.6, weight: 0.45, proportions: 0.9, height: 0.45, cupsize: 0.5, firmness: 0.7, ...o });

// outfits
// bare-chested: the overalls cut at the waist make fight trousers (recoloured in the app); barefoot or boots
const SHIRTLESS = (shoes = false) => ({ clothes: ['male_worksuit01/male_worksuit01.mhclo', ...(shoes ? ['shoes06/shoes06.mhclo'] : [])], cutAbove: 0.6, cutObjects: ['worksuit'] });
const TEE = { clothes: ['male_casualsuit06/male_casualsuit06.mhclo', 'shoes02/shoes02.mhclo'] };
const JACKET = { clothes: ['male_casualsuit05/male_casualsuit05.mhclo', 'shoes03/shoes03.mhclo'] };
const SHIRT = { clothes: ['male_casualsuit01/male_casualsuit01.mhclo', 'shoes02/shoes02.mhclo'] };
const DARK_SHIRT = { clothes: ['male_casualsuit02/male_casualsuit02.mhclo', 'shoes06/shoes06.mhclo'] };
const SUIT = { clothes: ['male_elegantsuit01/male_elegantsuit01.mhclo', 'shoes06/shoes06.mhclo'] };
const WORK = { clothes: ['male_worksuit01/male_worksuit01.mhclo', 'shoes03/shoes03.mhclo'] };
const SPORT = { clothes: ['female_sportsuit01/female_sportsuit01.mhclo', 'shoes05/shoes05.mhclo'] };
const F_CASUAL = { clothes: ['female_casualsuit01/female_casualsuit01.mhclo', 'shoes05/shoes05.mhclo'] };
const F_SHORTS = { clothes: ['female_casualsuit02/female_casualsuit02.mhclo', 'shoes05/shoes05.mhclo'] };
const F_ELEGANT = { clothes: ['female_elegantsuit01/female_elegantsuit01.mhclo', 'shoes04/shoes04.mhclo'] };

const hair = (h) => `${h}/${h}.mhclo`;
const brow = (n) => `eyebrow00${n}/eyebrow00${n}.mhclo`.replace('eyebrow0010', 'eyebrow010');
const skin = (s) => `${s}/${s}.mhmat`;

export const ROSTER = {
  // women
  alisa: { p: F({ height: 0.45 }), race: WHITE, skin: 'young_caucasian_female', hair: 'bob02', brow: 7, ...SPORT },
  anna: { p: F({ age: 0.5, height: 0.5 }), race: WHITE, skin: 'young_caucasian_female2', hair: 'bob01', brow: 8, ...F_ELEGANT },
  asuka: { p: F({ height: 0.4, muscle: 0.62 }), race: ASIAN, skin: 'young_asian_female', hair: 'bob01', brow: 3, ...F_CASUAL },
  azucena: { p: F({ height: 0.45 }), race: MIX(0, 0.7, 0.3), skin: 'young_caucasian_female', hair: 'ponytail01', brow: 8, ...SPORT },
  jun: { p: F({ age: 0.5, height: 0.48 }), race: ASIAN, skin: 'young_asian_female', hair: 'long01', brow: 3, ...F_ELEGANT },
  leo: { p: F({ height: 0.42, muscle: 0.65 }), race: WHITE, skin: 'young_caucasian_female', hair: 'bob01', brow: 3, ...F_CASUAL },
  lidia: { p: F({ height: 0.5, muscle: 0.66 }), race: WHITE, skin: 'young_caucasian_female2', hair: 'ponytail01', brow: 7, ...SPORT },
  kunimitsu: { p: F({ height: 0.45 }), race: ASIAN, skin: 'young_asian_female', hair: 'ponytail01', brow: 3, ...SPORT },
  lili: { p: F({ age: 0.4, height: 0.4, muscle: 0.55 }), race: WHITE, skin: 'young_caucasian_female', hair: 'long01', brow: 7, ...F_ELEGANT },
  'miary-zo': { p: F({ height: 0.45 }), race: BLACK, skin: 'young_african_female', hair: 'braid01', brow: 8, ...SPORT },
  nina: { p: F({ age: 0.5, height: 0.5, muscle: 0.68 }), race: WHITE, skin: 'young_caucasian_female', hair: 'ponytail01', brow: 7, ...SPORT },
  reina: { p: F({ height: 0.45 }), race: ASIAN, skin: 'young_asian_female', hair: 'bob02', brow: 3, ...F_SHORTS },
  xiaoyu: { p: F({ age: 0.4, height: 0.32, muscle: 0.55 }), race: ASIAN, skin: 'young_asian_female', hair: 'ponytail01', brow: 3, ...F_SHORTS },
  zafina: { p: F({ height: 0.55 }), race: MIX(0, 0.6, 0.4), skin: 'young_caucasian_female2', hair: 'long01', brow: 8, ...SPORT },
  // men
  'armor-king': { p: M({ muscle: 1, weight: 0.75, height: 0.72 }), race: MIX(0, 0.5, 0.5), skin: 'young_african_male', hair: 'short04', brow: 1, ...SHIRTLESS(true) },
  bob: { p: M({ muscle: 0.8, weight: 1, height: 0.55 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short02', brow: 2, ...TEE },
  bryan: { p: M({ muscle: 0.95, height: 0.7 }), race: WHITE, skin: 'young_caucasian_male2', hair: 'short01', brow: 2, ...TEE },
  claudio: { p: M({ height: 0.62 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short03', brow: 2, ...SHIRT },
  clive: { p: M({ height: 0.68 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short02', brow: 2, ...JACKET },
  'devil-jin': { p: M({ muscle: 0.9, height: 0.62 }), race: ASIAN, skin: 'young_asian_male', hair: 'short04', brow: 1, ...SHIRTLESS() },
  dragunov: { p: M({ muscle: 0.85, height: 0.7 }), race: WHITE, skin: 'young_caucasian_male2', hair: 'short01', brow: 2, ...DARK_SHIRT },
  eddy: { p: M({ muscle: 0.85, height: 0.6 }), race: BLACK, skin: 'young_african_male', hair: 'afro01', brow: 1, ...SHIRTLESS() },
  fahkumram: { p: M({ muscle: 1, height: 0.72 }), race: ASIAN, skin: 'young_asian_male', hair: 'short01', brow: 1, ...SHIRTLESS() },
  feng: { p: M({ height: 0.6 }), race: ASIAN, skin: 'young_asian_male', hair: 'short04', brow: 1, ...DARK_SHIRT },
  heihachi: { p: M({ age: 0.95, muscle: 0.9, height: 0.5 }), race: ASIAN, skin: 'old_asian_male', hair: 'short01', brow: 4, ...SHIRTLESS() },
  hwoarang: { p: M({ height: 0.62 }), race: ASIAN, skin: 'young_asian_male', hair: 'short03', brow: 1, ...JACKET },
  jin: { p: M({ age: 0.45, muscle: 0.88, height: 0.62 }), race: ASIAN, skin: 'young_asian_male', hair: 'short02', brow: 1, ...SHIRTLESS() },
  kazuya: { p: M({ age: 0.6, muscle: 0.9, height: 0.6 }), race: ASIAN, skin: 'middleage_asian_male', hair: 'short04', brow: 1, ...SHIRTLESS() },
  king: { p: M({ muscle: 1, weight: 0.7, height: 0.7 }), race: MIX(0, 0.7, 0.3), skin: 'young_caucasian_male2', hair: 'short04', brow: 1, ...SHIRTLESS(true) },
  lars: { p: M({ height: 0.72 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short02', brow: 2, ...SUIT },
  law: { p: M({ muscle: 0.85, height: 0.55 }), race: ASIAN, skin: 'young_asian_male', hair: 'short04', brow: 1, ...TEE },
  lee: { p: M({ age: 0.55, height: 0.58 }), race: ASIAN, skin: 'middleage_asian_male', hair: 'short02', brow: 4, ...SUIT },
  leroy: { p: M({ age: 0.8, height: 0.55 }), race: BLACK, skin: 'middleage_african_male', hair: 'short01', brow: 4, ...JACKET },
  paul: { p: M({ muscle: 0.85, height: 0.62 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short02', brow: 2, ...SHIRT },
  raven: { p: M({ muscle: 0.85, height: 0.72 }), race: BLACK, skin: 'young_african_male', hair: 'short01', brow: 1, ...SUIT },
  shaheen: { p: M({ height: 0.68 }), race: MIX(0, 0.7, 0.3), skin: 'young_caucasian_male2', hair: 'short04', brow: 1, ...DARK_SHIRT },
  steve: { p: M({ muscle: 0.88, height: 0.62 }), race: WHITE, skin: 'young_caucasian_male', hair: 'short02', brow: 2, ...TEE },
  victor: { p: M({ age: 0.8, height: 0.62 }), race: WHITE, skin: 'middleage_caucasian_male', hair: 'short02', brow: 4, ...SUIT },
  yoshimitsu: { p: M({ height: 0.65 }), race: ASIAN, skin: 'young_asian_male', hair: 'short01', brow: 1, ...WORK },
};

export function spec(id) {
  const r = ROSTER[id];
  return {
    id,
    phenotype: { ...r.p, race: r.race },
    skin: skin(r.skin),
    hair: hair(r.hair),
    eyebrows: brow(r.brow),
    clothes: r.clothes,
    ...(r.cutAbove ? { cutAbove: r.cutAbove, cutObjects: r.cutObjects } : {}),
    maxTex: 1024,
  };
}

if (process.argv[2]) {
  mkdirSync(process.argv[2], { recursive: true });
  for (const id of Object.keys(ROSTER)) writeFileSync(join(process.argv[2], `${id}.json`), JSON.stringify(spec(id), null, 1));
  console.log(Object.keys(ROSTER).length, 'specs');
}
