#!/usr/bin/env node
// Imports Tekken 8 frame data from Wavu Wiki (https://wavu.wiki), which is
// licensed CC0 (public domain). Writes one JSON file per character with
// provenance (page revision, fetch time) so the app can show where data came from.
//
// Usage: node scripts/import-wavu.mjs [characterId ...]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWavuRows } from '../src/data/wavuNormalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://wavu.wiki/w/api.php';
const FIELDS =
  'id,num,name,input,alias,alt,parent,target,damage,reach,startup,recv,tot,crush,block,hit,ch,tracksLeft,tracksRight,notes';

// characterId -> Wavu page/id prefix
const CHARACTERS = {
  anna: 'Anna',
  'armor-king': 'Armor King',
};

async function getJson(params, attempts = 3) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'IronFistAcademy-importer/0.1 (+https://github.com/GaberPet/iron-fist-academy)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      if (i >= attempts) throw e;
      console.warn(`Request failed (${e.message}), retrying ${i}/${attempts - 1}...`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function importCharacter(id, wavuName) {
  const data = await getJson({
    action: 'cargoquery',
    tables: 'Move',
    fields: FIELDS,
    where: `Move.id LIKE '${wavuName}-%'`,
    limit: '500',
  });
  if (!data.cargoquery) throw new Error(`Unexpected response for ${wavuName}: ${JSON.stringify(data).slice(0, 200)}`);
  const rows = data.cargoquery.map((r) => r.title);
  const page = wavuName.replace(/ /g, '_');
  const rev = await getJson({ action: 'parse', page: `${page}_movelist`, prop: 'revid' }).catch(() => null);
  const moves = normalizeWavuRows(rows, wavuName);
  const out = {
    characterId: id,
    source: {
      name: 'Wavu Wiki',
      url: `https://wavu.wiki/t/${page}_movelist`,
      license: 'CC0 1.0 (public domain)',
      revision: rev?.parse?.revid ?? null,
      fetchedAt: new Date().toISOString(),
      note: 'Community-maintained frame data. Values can lag behind the latest patch; verify in Practice mode frame display.',
    },
    moves,
  };
  const file = join(ROOT, 'src', 'data', 'characters', id, 'frames.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`${id}: ${moves.length} moves -> ${file}`);
}

const wanted = process.argv.slice(2);
for (const [id, name] of Object.entries(CHARACTERS)) {
  if (wanted.length && !wanted.includes(id)) continue;
  await importCharacter(id, name);
}
