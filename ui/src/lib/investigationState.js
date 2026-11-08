const record = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
const title = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160) : 'Investigation';
export function sourceLocation(value) {
  if (!record(value) || typeof value.file !== 'string' || !value.file || value.file.length > 2048 || /[\x00-\x1f\x7f\\]/.test(value.file) || value.file.startsWith('/') || /^[a-z]:/i.test(value.file) || value.file.split('/').some(part => !part || part === '.' || part === '..')) return null;
  if (typeof value.rev !== 'string' || !/^[a-f0-9]{40}$/i.test(value.rev)) return null;
  return { file: value.file, rev: value.rev, base: /^[a-f0-9]{40}$/i.test(value.base ?? '') ? value.base : null, side: 'right', view: 'source', line: Number.isSafeInteger(value.line) && value.line > 0 ? value.line : 1 };
}
const trail = value => Array.isArray(value) ? value.slice(-20).map(sourceLocation).filter(Boolean) : [];
export function normalizeInvestigation(value) {
  if (!record(value) || !id(value.id)) return undefined;
  const location = sourceLocation(value.location);
  if (!location) return undefined;
  let history = trail(value.history);
  if (!history.length) history = [location];
  const cursor = Number.isInteger(value.cursor) && value.cursor >= 0 && value.cursor < history.length ? value.cursor : history.length - 1;
  history[cursor] = location;
  const previewLocation = sourceLocation(value.preview?.location);
  const preview = previewLocation ? { location: previewLocation, trail: trail(value.preview.trail), origin: sourceLocation(value.preview.origin) ?? location } : null;
  return { id: value.id, title: title(value.title) || 'Investigation', location: history[cursor], history, cursor, preview,
    pinned: trail(value.pinned).slice(-2), search: typeof value.search === 'string' ? value.search.slice(0,1024) : '' };
}
export function investigationSnapshot(actor) {
  const { id, title, location, history, cursor, preview, pinned, search } = actor.getSnapshot().context;
  return normalizeInvestigation({ id, title, location, history, cursor, preview, pinned, search });
}

export function shareInvestigation(value) {
  const item = normalizeInvestigation(value);
  if (!item) return undefined;
  const history = item.history.slice(Math.max(0,item.cursor-4),item.cursor+1);
  return { ...item, history, cursor: history.length-1, preview: item.preview ? { ...item.preview, trail:item.preview.trail.slice(-5) } : null };
}

export function restoreInvestigation(previous, incoming) {
  const next = normalizeInvestigation(incoming);
  if (!next || previous.id !== next.id) return next;
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const cursor = previous.history.findLastIndex((entry,index) => same(entry,next.location)
    && next.history.slice(0,next.cursor+1).every((item,offset,items) => same(item,previous.history[index-items.length+1+offset])));
  if (cursor >= 0) { next.history = previous.history; next.cursor = cursor; }
  if (next.preview && previous.preview && same(next.preview.location,previous.preview.location)
    && same(next.preview.origin,previous.preview.origin)
    && next.preview.trail.every((entry,index,items) => same(entry,previous.preview.trail[previous.preview.trail.length-items.length+index]))) next.preview.trail = previous.preview.trail;
  return next;
}
