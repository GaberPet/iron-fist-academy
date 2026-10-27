#!/usr/bin/env node
// Imports the full Tekken 8 roster from Wavu Wiki (https://wavu.wiki, CC0 public domain):
// frame data, combo routes, punisher tables and character overviews.
//
// Output: public/data/manifest.json + public/data/characters/<id>.json
// A character file is only rewritten when its content changed, so scheduled runs produce
// commits only when Wavu actually changed.
//
// Usage:
//   node scripts/import-wavu.mjs              # whole roster
//   node scripts/import-wavu.mjs anna paul    # selected characters (ids)
//   node scripts/import-wavu.mjs --force      # rewrite even if unchanged
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWavuRows } from '../src/data/wavuNormalize.js';
import { parseCombosPage, parsePunishersPage, parseCharacterPage, hashId } from '../src/data/wavuParse.js';
import { diffCharacter, stampFirstSeen } from '../src/data/changes.js';
import { parseNotation } from '../src/core/notation.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const API = 'https://wavu.wiki/w/api.php';
const UA = 'IronFistAcademy-importer/0.2 (+https://github.com/GaberPet/iron-fist-academy)';
const SCHEMA = 1;
const DELAY_MS = 350; // be polite to the wiki
const FIELDS =
  'id,num,name,input,alias,alt,parent,target,damage,reach,startup,recv,tot,crush,block,hit,ch,tracksLeft,tracksRight,notes';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function getJson(params, attempts = 3) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let i = 1; ; i++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= attempts) throw new Error(`${e.message} (${params.action} ${params.page ?? params.tables ?? ''})`);
      console.warn(`  request failed (${e.message}), retry ${i}/${attempts - 1}`);
      await sleep(2000 * i);
    }
  }
}

async function getPage(page) {
  const d = await getJson({ action: 'parse', page, prop: 'wikitext|revid' });
  if (!d.parse) return null;
  return { text: d.parse.wikitext['*'], revision: d.parse.revid };
}

/** The roster as Wavu lists it ({{#invoke:Fighter|list8}} powers the fighters navbox). */
async function fetchRoster() {
  const d = await getJson({ action: 'parse', text: '{{#invoke:Fighter|list8}}', contentmodel: 'wikitext', prop: 'text' });
  const html = d.parse?.text?.['*'] ?? '';
  const names = [...html.matchAll(/title="([^"]+)"/g)].map((m) => m[1].replace(/&#039;/g, "'"));
  if (names.length < 20) throw new Error(`Roster looks wrong (${names.length} names)`);
  return [...new Set(names)];
}

function validateNotation(s) {
  try {
    return parseNotation(s).some((st) => st.kind === 'press');
  } catch {
    return false;
  }
}

function hueColor(name) {
  const h = parseInt(hashId(name), 36) % 360;
  return `hsl(${h} 70% 62%)`;
}

/** Stable JSON for hashing (no timestamps). */
const contentHash = (obj) => hashId(JSON.stringify(obj));

async function importCharacter(name) {
  const id = slug(name);
  const page = name.replace(/ /g, '_');
  const cargo = await getJson({ action: 'cargoquery', tables: 'Move', fields: FIELDS, where: `Move.id LIKE '${name.replace(/'/g, "''")}-%'`, limit: '500' });
  if (!Array.isArray(cargo.cargoquery)) throw new Error('unexpected cargo response');
  const moves = normalizeWavuRows(cargo.cargoquery.map((r) => r.title), name);
  const [movelist, combosPage, punPage, charPage] = [await getPage(`${page}_movelist`), await getPage(`${page}_combos`), await getPage(`${page}_punishers`), await getPage(page)];

  const combos = combosPage
    ? parseCombosPage(combosPage.text, { characterId: id, url: `https://wavu.wiki/t/${page}_combos`, revision: combosPage.revision, validate: validateNotation })
    : { source: null, items: [], dropped: [] };

  // Punishers without an explicit window use the move's startup (that's how Wavu's template works).
  const byId = new Map();
  for (const m of moves) {
    byId.set(m.id, m);
    for (const a of m.alt ?? []) if (!byId.has(a)) byId.set(a, m);
  }
  const punishers = (punPage ? parsePunishersPage(punPage.text, name) : [])
    .map((p) => {
      if (p.window !== null) return p;
      const root = byId.get(p.moveId.split(',')[0]) ?? byId.get(p.moveId);
      return root?.startupFrame ? { ...p, window: -root.startupFrame, derived: true } : null;
    })
    .filter(Boolean);

  const overview = charPage ? parseCharacterPage(charPage.text, name) : null;
  return {
    id,
    content: {
      schema: SCHEMA,
      id,
      name,
      wavuName: name,
      profile: {
        color: hueColor(name),
        ...(overview ?? {}),
        source: { name: `Wavu Wiki: ${name}`, url: `https://wavu.wiki/t/${page}`, revision: charPage?.revision ?? null, license: 'CC0 1.0' },
      },
      frames: {
        characterId: id,
        source: {
          name: 'Wavu Wiki',
          url: `https://wavu.wiki/t/${page}_movelist`,
          license: 'CC0 1.0 (public domain)',
          revision: movelist?.revision ?? null,
          note: 'Community-maintained frame data. Values can lag behind the latest patch; verify in Practice mode frame display.',
        },
        moves,
      },
      combos: { source: combos.source, items: combos.items, droppedCount: combos.dropped.length },
      punishers: {
        source: punPage ? { name: 'Wavu Wiki punishers', url: `https://wavu.wiki/t/${page}_punishers`, revision: punPage.revision, license: 'CC0 1.0' } : null,
        items: punishers,
      },
    },
  };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  await mkdir(join(OUT, 'characters'), { recursive: true });
  const oldManifest = (await readJson(join(OUT, 'manifest.json'))) ?? { characters: [] };
  const oldById = new Map(oldManifest.characters.map((c) => [c.id, c]));

  const roster = await fetchRoster();
  console.log(`Roster: ${roster.length} characters`);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const firstRun = oldManifest.characters.length === 0;
  const entries = [];
  const problems = [];
  const changelog = [];
  let changed = 0;

  for (const name of roster) {
    const id = slug(name);
    const prev = oldById.get(id);
    if (only.length && !only.includes(id)) {
      if (prev) entries.push(prev);
      continue;
    }
    try {
      const { content } = await importCharacter(name);
      const file = join(OUT, 'characters', `${id}.json`);
      const old = await readJson(file);
      // Safety gate: a big drop usually means vandalism or a partial outage, not a patch.
      const oldMoves = old?.frames?.moves?.length ?? 0;
      if (oldMoves && content.frames.moves.length < oldMoves * 0.7) {
        throw new Error(`move count dropped ${oldMoves} -> ${content.frames.moves.length}; keeping previous data`);
      }
      stampFirstSeen(old, content, today);
      const hash = contentHash(content);
      const isChanged = force || !prev || prev.hash !== hash;
      const updatedAt = isChanged ? now : prev.updatedAt;
      if (isChanged) {
        await writeFile(file, JSON.stringify({ ...content, updatedAt }) + '\n');
        changed++;
        if (!firstRun) {
          const diff = diffCharacter(old, content);
          if (diff) changelog.push(diff);
        }
      }
      const c = content.combos.items;
      entries.push({
        id,
        name,
        file: `characters/${id}.json`,
        hash,
        updatedAt,
        addedAt: prev ? prev.addedAt ?? null : firstRun ? null : today,
        counts: { moves: content.frames.moves.length, combos: c.length, combosParsed: c.filter((x) => x.parseOk).length, punishers: content.punishers.items.length },
        revisions: { movelist: content.frames.source.revision, combos: content.combos.source?.revision ?? null, punishers: content.punishers.source?.revision ?? null, page: content.profile.source.revision },
      });
      console.log(`${isChanged ? 'updated' : 'unchanged'}  ${name.padEnd(12)} moves ${content.frames.moves.length}, combos ${c.length} (${c.filter((x) => x.parseOk).length} trainable), punishers ${content.punishers.items.length}`);
    } catch (e) {
      problems.push(`${name}: ${e.message}`);
      console.warn(`FAILED     ${name}: ${e.message}`);
      if (prev) entries.push(prev); // keep serving the previous data
    }
  }

  const anyChange = changed > 0 || entries.length !== oldManifest.characters.length;
  const manifest = {
    schema: SCHEMA,
    generatedAt: anyChange || !oldManifest.generatedAt ? now : oldManifest.generatedAt,
    source: { name: 'Wavu Wiki', url: 'https://wavu.wiki', license: 'CC0 1.0 (public domain)' },
    characters: entries.sort((a, b) => a.name.localeCompare(b.name)),
  };
  if (anyChange || force) await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  if (changelog.length) {
    const logFile = join(OUT, 'changelog.json');
    const log = (await readJson(logFile)) ?? { schema: SCHEMA, entries: [] };
    log.entries.unshift({ date: today, at: now, characters: changelog });
    log.entries = log.entries.slice(0, 90); // about three months of daily runs
    await writeFile(logFile, JSON.stringify(log) + '\n');
    console.log(`Changelog: ${changelog.length} character(s) recorded.`);
  }
  console.log(`\n${changed} character file(s) changed, ${problems.length} problem(s).`);
  if (problems.length) console.log(problems.map((p) => `  - ${p}`).join('\n'));
  // Fail the run (so GitHub emails you) only if most of the roster failed.
  if (problems.length > roster.length / 2) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
