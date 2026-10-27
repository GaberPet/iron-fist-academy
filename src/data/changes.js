// Describes what changed between two versions of a generated character file.
// Used by the importer to write public/data/changelog.json (the in-app "What's new" page).

const FRAME_FIELDS = ['startup', 'block', 'hit', 'ch', 'damage'];
const CAP = 40; // keep the changelog small; totals are always exact

const cap = (arr) => arr.slice(0, CAP);

/**
 * @param {any} oldFile previous character file (null for a new character)
 * @param {any} newFile new character file
 * @returns {null | Record<string, any>} null if nothing user-visible changed
 */
export function diffCharacter(oldFile, newFile) {
  const base = { id: newFile.id, name: newFile.name };
  if (!oldFile) {
    return { ...base, newCharacter: true, totals: { moves: newFile.frames.moves.length, combos: newFile.combos.items.length } };
  }
  const oldMoves = new Map(oldFile.frames.moves.map((m) => [m.id, m]));
  const newMoves = new Map(newFile.frames.moves.map((m) => [m.id, m]));
  const movesAdded = [...newMoves.keys()].filter((id) => !oldMoves.has(id));
  const movesRemoved = [...oldMoves.keys()].filter((id) => !newMoves.has(id));
  const movesChanged = [];
  for (const [id, m] of newMoves) {
    const o = oldMoves.get(id);
    if (!o) continue;
    const fields = {};
    for (const f of FRAME_FIELDS) if ((o[f] ?? '') !== (m[f] ?? '')) fields[f] = [o[f] ?? '', m[f] ?? ''];
    if (Object.keys(fields).length) movesChanged.push({ id, name: m.name, fields });
  }
  const oldCombos = new Map(oldFile.combos.items.map((c) => [c.id, c]));
  const newIds = new Set(newFile.combos.items.map((c) => c.id));
  const combosAdded = newFile.combos.items.filter((c) => !oldCombos.has(c.id)).map((c) => ({ id: c.id, section: c.section, starters: c.starters, route: c.route }));
  const combosRemoved = [...oldCombos.values()].filter((c) => !newIds.has(c.id)).map((c) => ({ section: c.section, starters: c.starters, route: c.route }));
  const punishersChanged = JSON.stringify(oldFile.punishers.items) !== JSON.stringify(newFile.punishers.items);
  const totals = {
    movesAdded: movesAdded.length,
    movesRemoved: movesRemoved.length,
    movesChanged: movesChanged.length,
    combosAdded: combosAdded.length,
    combosRemoved: combosRemoved.length,
  };
  const anything = Object.values(totals).some((n) => n > 0) || punishersChanged;
  return {
    ...base,
    ...(anything ? {} : { otherChanges: true }), // e.g. overview text or notes edited on the wiki
    totals,
    movesAdded: cap(movesAdded),
    movesRemoved: cap(movesRemoved),
    movesChanged: cap(movesChanged),
    combosAdded: cap(combosAdded),
    combosRemoved: cap(combosRemoved),
    punishersChanged,
  };
}

/** Carry "first seen" dates forward so the app can badge new combos. */
export function stampFirstSeen(oldFile, newFile, today) {
  const seen = new Map((oldFile?.combos.items ?? []).map((c) => [c.id, c.firstSeen ?? null]));
  for (const c of newFile.combos.items) {
    // Combos of a brand-new character aren't badged individually (the character is).
    const first = seen.has(c.id) ? seen.get(c.id) : oldFile ? today : null;
    // Only store real dates, so existing data keeps its hash (no spurious "changes").
    if (first) c.firstSeen = first;
    else delete c.firstSeen;
  }
  return newFile;
}
