// In-app frame data refresh from Wavu Wiki (CC0). Same normalization as the import script.
import type { FrameDataFile, Move } from '../types';
import { normalizeWavuRows } from '../data/wavuNormalize.js';

const API = 'https://wavu.wiki/w/api.php';
const FIELDS = 'id,num,name,input,alias,alt,parent,target,damage,reach,startup,recv,tot,crush,block,hit,ch,tracksLeft,tracksRight,notes';

async function getJson(params: Record<string, string>) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Wavu Wiki returned HTTP ${res.status}`);
  return res.json();
}

export async function fetchFrameData(characterId: string, wavuName: string): Promise<FrameDataFile> {
  const data = await getJson({ action: 'cargoquery', tables: 'Move', fields: FIELDS, where: `Move.id LIKE '${wavuName}-%'`, limit: '500' });
  if (!Array.isArray(data.cargoquery)) throw new Error('Unexpected response from Wavu Wiki');
  const rows = data.cargoquery.map((r: { title: Record<string, unknown> }) => r.title);
  if (rows.length < 20) throw new Error(`Only ${rows.length} moves returned; keeping existing data`);
  const page = wavuName.replace(/ /g, '_');
  const rev = await getJson({ action: 'parse', page: `${page}_movelist`, prop: 'revid' }).catch(() => null);
  return {
    characterId,
    source: {
      name: 'Wavu Wiki',
      url: `https://wavu.wiki/t/${page}_movelist`,
      license: 'CC0 1.0 (public domain)',
      revision: rev?.parse?.revid ?? null,
      fetchedAt: new Date().toISOString(),
      note: 'Refreshed in-app. Community-maintained; verify in Practice mode frame display.',
    },
    moves: normalizeWavuRows(rows, wavuName) as Move[],
  };
}

/** Which moves changed between two data sets (by frame-relevant fields). */
export function diffFrames(a: FrameDataFile, b: FrameDataFile): { added: string[]; removed: string[]; changed: string[] } {
  const key = (m: Move) => [m.startup, m.block, m.hit, m.ch, m.damage, m.hitLevels.join(','), m.crush].join('|');
  const am = new Map(a.moves.map((m) => [m.id, m]));
  const bm = new Map(b.moves.map((m) => [m.id, m]));
  return {
    added: [...bm.keys()].filter((k) => !am.has(k)),
    removed: [...am.keys()].filter((k) => !bm.has(k)),
    changed: [...bm.keys()].filter((k) => am.has(k) && key(am.get(k)!) !== key(bm.get(k)!)),
  };
}
