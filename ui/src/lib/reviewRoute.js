import { parseCommentTarget } from './commentTarget.js';
import { normalizeInvestigation, shareInvestigation } from './investigationState.js';

const ROLES = new Set(['source', 'test', 'configuration', 'manifest', 'documentation', 'snapshot', 'fixture', 'lockfile', 'unknown']);
const VISIBILITY = new Set(['show', 'fold', 'hide']);
const ORDERS = new Set(['attention', 'original', 'volume', 'flow']);
const DEFAULT_RULES = { snapshot: 'fold', fixture: 'fold' };
const MAX_PANES = 8;
const MAX_CONTROL_PATHS = 200;
const MAX_JSON_LENGTH = 65536;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => /^(?:[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const text = (value, limit) => typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value) ? value.slice(0, limit) : '';

function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith('/') || /^[a-z]:/i.test(value)) return null;
  return value.split('/').some(part => part === '.' || part === '..' || part === '') ? null : value;
}
// Each collection has a character budget so every built JSON parameter can be read back.
function boundedPaths(entries) {
  let length = 0;
  return entries.filter(entry => {
    length += (Array.isArray(entry) ? entry[0] : entry).length;
    return length <= 12000;
  }).slice(0, MAX_CONTROL_PATHS);
}
function revision(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value : null;
}
function position(value = {}) {
  const input = record(value) ? value : {};
  const file = relativePath(input.file);
  return { file, line: file ? positiveInteger(input.line) : null, side: input.side === 'left' ? 'left' : 'right', view: input.view === 'source' ? 'source' : 'diff', rev: revision(input.rev), base: revision(input.base), layout: input.layout === 'unified' ? 'unified' : 'split' };
}

export function normalizeReferenceOrigin(value) {
  if (!record(value)) return undefined;
  const path = relativePath(value.path);
  const contextOnly = value.kind === 'context';
  const symbol = contextOnly ? text(value.symbol, 200) : typeof value.symbol === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,199}$/.test(value.symbol) ? value.symbol : null;
  const line = positiveInteger(value.line);
  const character = Number.isSafeInteger(value.character) && value.character >= 0 ? value.character : null;
  const rev = revision(value.rev);
  if (!path || !symbol || !line || character === null || !rev) return undefined;
  const candidate = record(value.preview) ? value.preview : {};
  const previewPath = relativePath(candidate.path);
  const previewLine = positiveInteger(candidate.line);
  const previewCharacter = Number.isSafeInteger(candidate.character) && candidate.character >= 0 ? candidate.character : null;
  const preview = previewPath && previewLine && previewCharacter !== null ? { path: previewPath, line: previewLine, character: previewCharacter } : null;
  if (contextOnly && !preview) return undefined;
  return { path, symbol, line, character, rev, base: revision(value.base), ...(contextOnly ? {kind:'context'} : {}), ...(preview ? { preview } : {}) };
}

/** Full organization controls; explicit rules:{} preserves Show all across reloads. */
export function normalizeReviewControls(value = {}) {
  const input = record(value) ? value : {};
  const rules = record(input.rules) ? Object.fromEntries(Object.entries(input.rules).filter(([role, mode]) => ROLES.has(role) && VISIBILITY.has(mode)).sort(([a], [b]) => a.localeCompare(b))) : { ...DEFAULT_RULES };
  const overrides = record(input.overrides) ? Object.fromEntries(boundedPaths(Object.entries(input.overrides).filter(([path, mode]) => relativePath(path) && VISIBILITY.has(mode)).sort(([a], [b]) => a.localeCompare(b)))) : {};
  const expanded = Array.isArray(input.expanded) ? boundedPaths([...new Set(input.expanded.map(relativePath).filter(Boolean))]) : [];
  const collapsedFolders = Array.isArray(input.collapsedFolders) ? boundedPaths([...new Set(input.collapsedFolders.map(relativePath).filter(Boolean))]) : [];
  const order = ORDERS.has(input.order) ? input.order : 'attention';
  const root = relativePath(input.root);
  return { order, query: text(input.query, 1024), rules, overrides, ...(root ? { root } : {}), expanded, folders: order !== 'flow' && input.folders === true, collapsedFolders };
}

/** Pure, bounded URL snapshot. Missing controls/panes/search leave those surfaces untouched. */
export function normalizeReviewState(value = {}) {
  const input = record(value) ? value : {};
  const result = position(input);
  const investigation = normalizeInvestigation(input.investigation);
  if (investigation) result.investigation = investigation;
  const references = normalizeReferenceOrigin(input.references);
  if (references) result.references = references;
  if (record(input.controls)) result.controls = normalizeReviewControls(input.controls);
  if (Array.isArray(input.panes)) {
    const ids = new Set();
    const panes = [];
    for (const pane of input.panes.slice(0, 64)) {
      if (!record(pane) || typeof pane.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(pane.id) || ids.has(pane.id)) continue;
      const next = position(pane);
      const auxiliary = pane.view === 'files' || pane.view === 'related';
      if (auxiliary) next.view = pane.view;
      if (!auxiliary && !next.file) continue;
      ids.add(pane.id);
      panes.push({ id: pane.id, ...next });
      if (panes.length === MAX_PANES) break;
    }
    if (panes.length) {
      result.panes = panes;
      result.active = ids.has(input.active) ? input.active : panes[0].id;
    }
  }
  if (record(input.search) && ['files', 'search'].includes(input.search.mode)) result.search = { mode: input.search.mode, query: text(input.search.query, 1024) };
  return result;
}
export function referenceDiffLocation(origin, path, comparison = {}) {
  const head = revision(comparison.head);
  const base = revision(comparison.base);
  if (!head || !base || !origin || ![head, base].includes(origin.rev)) return null;
  const original = origin.rev === base && origin.rev !== head;
  const file = (comparison.files ?? []).find(file => (original ? file.previousPath ?? file.path : file.path) === path);
  return file ? { file: file.path, rev: head, base, side: original ? 'left' : 'right', view: 'diff' } : null;
}
export function reviewReferenceDestination(review, entry, comparison = {}) {
  const state = normalizeReviewState(review);
  const path = relativePath(entry?.path);
  const line = positiveInteger(entry?.line);
  const character = Number.isSafeInteger(entry?.character) && entry.character >= 0 ? entry.character : 0;
  if (!state.references || !path || !line) return state;
  const change = referenceDiffLocation(state.references, path, comparison);
  if (!change) {
    const anchor = state.view === 'source' ? referenceDiffLocation({ rev: state.rev }, state.file, comparison) : null;
    return normalizeReviewState({ ...state, ...(anchor ?? {}), search: undefined, references: { ...state.references, preview: { path, line, character } } });
  }
  return reviewFileDestination({...state,references:state.references.kind === 'context' ? undefined : {...state.references,preview:undefined}}, {...change,line});
}

export function reviewFileDestination(review, location) {
  const state=normalizeReviewState(review);
  const target=position({...state,...location});
  delete target.layout;
  if (!target.file) return state;
  const codePanes = state.panes?.filter(pane => !['files', 'related'].includes(pane.view));
  const pane = codePanes?.find(pane => pane.id === state.active) ?? codePanes?.[0];
  return normalizeReviewState({
    ...state, ...target, search:undefined,
    ...(pane ? {panes:state.panes.map(candidate=>candidate.id===pane.id ? {...candidate,...target} : candidate),active:pane.id} : {}),
  });
}

export function reviewDefinitionDestination(review, definition, request, comparison = {}) {
  const state = normalizeReviewState(review);
  const references = normalizeReferenceOrigin({kind:'context',path:request.path,symbol:request.symbol,line:request.position?.line ?? 1,character:request.position?.character ?? 0,rev:request.sha,base:state.base,preview:{path:definition.path,line:definition.line ?? 1,character:0}});
  if (!references) return state;
  const destination = reviewReferenceDestination({...state,references},{...definition,line:definition.line ?? 1},comparison);
  if (!destination.references && state.references?.kind !== 'context') return normalizeReviewState({...destination,references:state.references ? {...state.references,preview:undefined} : undefined});
  return destination;
}

export function reviewBesideDestination(review, location) {
  const state = normalizeReviewState(review);
  const target = position(location);
  if (!target.file || !target.rev) return state;
  const panes = state.panes ? [...state.panes] : state.file ? [{id:'p1',...position(state)}] : [];
  if (panes.length >= MAX_PANES) return state;
  const id = Array.from({length:MAX_PANES},(_,i)=>`p${i+1}`).find(id=>!panes.some(pane=>pane.id===id));
  panes.push({id,...target,layout:location.layout ?? state.layout});
  return normalizeReviewState({...state,...target,rev:state.rev,base:state.base,search:undefined,panes,active:id});
}

function jsonParam(params, key) {
  const value = params.get(key);
  if (!value || value.length > MAX_JSON_LENGTH) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

/** Existing PR routes plus version-1 Files queries; invalid optional values are ignored. */
export function parseReviewRoute(hash) {
  if (typeof hash !== 'string') return null;
  const match = hash.match(/^#\/pr\/([^/?#]+)\/([^/?#]+)\/(\d+)(?:\/(files|agents|actions)|\/history\/([^/?#]+))?(?:\?([^#]*))?$/i);
  if (!match) return null;
  const number = positiveInteger(match[3]);
  if (!number) return null;
  const params = new URLSearchParams(match[6] ?? '');
  const tab = match[5] ? 'files' : (match[4] ?? 'conversation').toLowerCase();
  let historyPath = null;
  let historySymbol = null;
  if (match[5]) {
    try { historyPath = decodeURIComponent(match[5]); } catch { return null; }
    historySymbol = params.get('symbol');
  }
  const actionSha = tab === 'actions' ? params.get('sha') : null;
  const actionJobText = tab === 'actions' ? params.get('job') : null;
  if (actionSha !== null && !/^[0-9a-f]{40}$/i.test(actionSha)) return null;
  if (actionJobText !== null && (!/^\d+$/.test(actionJobText) || !Number.isSafeInteger(Number(actionJobText)))) return null;
  const review = normalizeReviewState({
    file: params.get('file'), line: params.get('line'), side: params.get('side'), view: params.get('view'), rev: params.get('rev'), base: params.get('base'), layout: params.get('layout'),
    investigation: jsonParam(params, 'investigation'), references: jsonParam(params, 'references'), controls: jsonParam(params, 'controls'), panes: jsonParam(params, 'panes'), active: params.get('active'), search: jsonParam(params, 'search'),
  });
  return { name: 'detail', repo: `${match[1]}/${match[2]}`, number, tab, actionSha, actionJob: actionJobText === null ? null : Number(actionJobText), historyPath, historySymbol, commentTarget: parseCommentTarget(params.get('comment')), review };
}

/** Canonical Files hash. Browser push/replace and async restoration belong to the caller. */
export function buildReviewHash(repo, number, review = {}) {
  if (typeof repo !== 'string' || !/^[^/?#]+\/[^/?#]+$/.test(repo) || !positiveInteger(number)) throw new TypeError('A repository and positive PR number are required.');
  const state = normalizeReviewState(review);
  const params = new URLSearchParams({ v: '1' });
  for (const key of ['file', 'line']) if (state[key] !== null) params.set(key, String(state[key]));
  if (state.side !== 'right') params.set('side', state.side);
  if (state.view !== 'diff') params.set('view', state.view);
  for (const key of ['rev', 'base']) if (state[key]) params.set(key, state[key]);
  if (state.layout !== 'split') params.set('layout', state.layout);
  if (state.investigation) {
    params.set('investigation', JSON.stringify(shareInvestigation(state.investigation)));
  }
  if (state.references) params.set('references', JSON.stringify(state.references));
  if (state.controls) params.set('controls', JSON.stringify(state.controls));
  if (state.panes) { params.set('panes', JSON.stringify(state.panes)); params.set('active', state.active); }
  if (state.search) params.set('search', JSON.stringify(state.search));
  return `#/pr/${repo}/${Number(number)}/files?${params}`;
}
