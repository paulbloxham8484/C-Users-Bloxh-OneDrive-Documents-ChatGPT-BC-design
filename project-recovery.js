// Small, bounded local checkpoints. This store is separate from the current project.
// A failed write never evicts an existing checkpoint or permits a destructive restore.
var BCProjectRecovery = (() => {
  const key = 'bc-design-checkpoints-v1', maxEntries = 8, maxChars = 1500000;
  function list(storage) {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r.id !== 'string' || typeof r.raw !== 'string' || typeof r.name !== 'string' || typeof r.reason !== 'string' || typeof r.savedAt !== 'string')) throw new Error('Checkpoint store is unreadable. Export the current project before continuing.');
    return rows;
  }
  function save(storage, raw, reason, now = new Date()) {
    if (typeof raw !== 'string') throw new Error('Checkpoint requires project text.');
    const rows = list(storage);
    if (rows[0]?.raw === raw) return rows[0];
    let name = 'Unreadable autosave';
    try { name = String(JSON.parse(raw)?.name || 'Untitled building').slice(0, 160); } catch { /* Preserve the original bytes for export. */ }
    const entry = { id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2), savedAt: now.toISOString(), name, reason: String(reason).slice(0, 160), raw };
    const next = [entry, ...rows].slice(0, maxEntries);
    while (JSON.stringify(next).length > maxChars && next.length > 1) next.pop();
    if (JSON.stringify(next).length > maxChars) throw new Error('Project is too large for local checkpoints. Save JSON before replacing it.');
    storage.setItem(key, JSON.stringify(next));
    return entry;
  }
  return { key, maxEntries, list, save };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BCProjectRecovery;
