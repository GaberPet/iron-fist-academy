// Test-only helpers: load generated character files from public/data (Node fs).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterData, CharacterFile, Manifest } from '../types';
import { buildCharacter, CURATED } from './index';

const DATA = join(__dirname, '..', '..', 'public', 'data');

export function loadManifest(): Manifest {
  return JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
}

export function loadFile(id: string): CharacterFile {
  const file = join(DATA, 'characters', `${id}.json`);
  if (!existsSync(file)) throw new Error(`Missing generated data for ${id}: run npm run import-data`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadCharacter(id: string): CharacterData {
  return buildCharacter(loadFile(id), CURATED[id]);
}
