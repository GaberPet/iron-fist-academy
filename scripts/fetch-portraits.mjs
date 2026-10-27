#!/usr/bin/env node
// Fetches one freely licensed photo per character from Wikimedia Commons (motif photos, never real
// people), saves a 640px copy to public/portraits/<id>.jpg and records its credit.
//
// Usage: node scripts/fetch-portraits.mjs [id ...]      (all characters if none given)
// To swap a picture, edit "query" or add "skip": n (skip the first n acceptable results) in
// scripts/portrait-motifs.json and re-run for that id.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'portraits');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'IronFistAcademy-portraits/0.1 (+https://github.com/GaberPet/iron-fist-academy)';
const OK_LICENSE = /^(cc0|public domain|pd\b|pd-|cc by(-sa)? [0-9.]+)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWithRetry(url, timeoutMs) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i >= 5) throw e;
      await sleep(3000 * i);
    }
  }
}

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

async function search(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '20',
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '640',
  });
  const res = await getWithRetry(`${API}?${params}`, 30000);
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
}

function acceptable(page) {
  const ii = page.imageinfo?.[0];
  if (!ii || ii.mime !== 'image/jpeg' || ii.width < 700 || ii.height < 500) return null;
  const m = ii.extmetadata ?? {};
  const license = strip(m.LicenseShortName?.value);
  if (!OK_LICENSE.test(license)) return null;
  const artist = strip(m.Artist?.value) || (/^(cc0|public domain|pd)/i.test(license) ? 'unknown (public domain)' : '');
  if (!artist) return null;
  return { thumb: ii.thumburl, source: ii.descriptionurl, title: page.title.replace(/^File:/, ''), artist, license, licenseUrl: m.LicenseUrl?.value ?? null };
}

const motifs = JSON.parse(await readFile(join(ROOT, 'scripts', 'portrait-motifs.json'), 'utf8'));
const creditsFile = join(OUT, 'credits.json');
let credits = {};
try {
  credits = JSON.parse(await readFile(creditsFile, 'utf8'));
} catch {
  credits = {};
}
await mkdir(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const ids = Object.keys(motifs).filter((k) => !k.startsWith('_') && (!wanted.length || wanted.includes(k)));

for (const id of ids) {
  const { motif, query, skip = 0 } = motifs[id];
  try {
    const found = (await search(query)).map(acceptable).filter(Boolean);
    const pick = found[skip];
    if (!pick) throw new Error(`no freely licensed JPEG found for "${query}"`);
    await sleep(500);
    const img = await getWithRetry(pick.thumb, 60000);
    if (!img.ok) throw new Error(`image HTTP ${img.status}`);
    await writeFile(join(OUT, `${id}.jpg`), Buffer.from(await img.arrayBuffer()));
    credits[id] = { motif, query, ...pick, thumb: undefined };
    console.log(`ok    ${id.padEnd(11)} ${pick.license.padEnd(14)} ${pick.title.slice(0, 60)}`);
  } catch (e) {
    console.warn(`FAIL  ${id}: ${e.message}`);
  }
  await sleep(1500);
}
await writeFile(creditsFile, JSON.stringify(credits, null, 1) + '\n');
