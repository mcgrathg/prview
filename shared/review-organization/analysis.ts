export const roleLabels = {
  source: 'Source', test: 'Tests', configuration: 'Configuration',
  manifest: 'Dependencies', documentation: 'Documentation', snapshot: 'Snapshots',
  fixture: 'Fixtures', lockfile: 'Lockfiles', unknown: 'Other',
};

export type Role = keyof typeof roleLabels;
export type Visibility = 'show' | 'fold' | 'hide';
export type Strategy = 'attention' | 'original' | 'volume';
export type VisibilityRules = Partial<Record<Role, Visibility>>;
export type FileProperty = 'schema' | 'configuration';

export interface CapturedFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  head_content?: string;
  patch_absence?: string;
  blob_sha?: string;
}

export interface Capture {
  repository: string;
  pull_request?: number;
  pr_number?: number;
  title: string;
  url: string;
  head_sha: string;
  reported_base_sha: string;
  changed_files: number;
  additions: number;
  deletions: number;
  files: CapturedFile[];
}

export interface AnalyzedFile extends CapturedFile {
  originalIndex: number;
  name: string;
  directory: string;
  language: string;
  area: string;
  roles: Role[];
  classification: { role: Role; reason: string }[];
  properties: FileProperty[];
  propertyEvidence: { property: FileProperty; reason: string }[];
  hasControlFlowChange: boolean;
  attentionTier: number;
  attentionReasons: string[];
}

export const defaultRules: VisibilityRules = { snapshot: 'fold', fixture: 'fold' };

function language(path: string): string {
  if (/\.tsx$/.test(path)) return 'TSX';
  if (/\.ts$/.test(path)) return 'TypeScript';
  if (/\.[cm]?jsx?$/.test(path)) return 'JavaScript';
  if (/\.json$/.test(path)) return 'JSON';
  if (/\.mdx?$/.test(path)) return 'Markdown';
  if (/\.rs$/.test(path)) return 'Rust';
  if (/\.css$/.test(path)) return 'CSS';
  if (/\.(snap|snapshot)$/.test(path)) return 'Snapshot text';
  if (/(^|\/)(yarn\.lock|pnpm-lock\.yaml|package-lock\.json)$/.test(path)) return 'Lockfile';
  return 'Text';
}

function classify(path: string) {
  const facts: AnalyzedFile['classification'] = [];
  const add = (role: Role, reason: string) => facts.push({ role, reason });
  const isFixture = /(?:^|\/)(?:__testfixtures__|__fixtures__|fixtures|mocks)\//.test(path);
  const isTest = /\.(?:test(?:-d)?|spec)\.[cm]?[jt]sx?$/.test(path) || /(?:^|\/)(?:test|tests|__tests__)\//.test(path);
  const isSnapshot = /\.(?:snap|snapshot)$/.test(path);
  const isLock = /(?:^|\/)(?:yarn\.lock|pnpm-lock\.yaml|package-lock\.json|Cargo\.lock)$/.test(path);
  if (isFixture) add('fixture', 'Path is inside a fixture or mock directory.');
  if (isSnapshot) add('snapshot', 'Filename ends in .snap or .snapshot.');
  if (isTest && !isFixture) add('test', 'Test filename convention or test directory.');
  if (isLock) add('lockfile', 'Recognized dependency lockfile name.');
  if (/(?:^|\/)(?:package\.json|Cargo\.toml|pyproject\.toml)$/.test(path)) add('manifest', 'Recognized dependency manifest name.');
  if (/\.mdx?$/.test(path)) add('documentation', 'Markdown document.');
  if (/(?:^|\/)(?:tsconfig(?:\.[^/]+)?\.json|[^/]+\.config\.[cm]?[jt]s|\.gitattributes)$/.test(path)) {
    add('configuration', 'Recognized project configuration filename.');
  }
  if (!isFixture && !isTest && !isLock && /\.(?:[cm]?[jt]sx?|rs|go|py|css|html)$/.test(path)) {
    add('source', 'Source language outside a recognized fixture or test path.');
  }
  if (!facts.length) add('unknown', 'No role rule matched; kept visible.');
  return facts;
}

function area(path: string): string {
  const packagePath = /^(?:packages|apps)\/([^/]+)/.exec(path);
  if (packagePath) return path.split('/')[0]! + ' / ' + packagePath[1]!;
  const core = /^code\/core\/src\/([^/]+)/.exec(path);
  if (core) return `core / ${core[1]}`;
  const storybook = /^code\/(?:addons|builders|frameworks|renderers|lib)\/([^/]+)/.exec(path);
  if (storybook) return storybook[1]!;
  const vscode = /^src\/vs\/(?:platform\/([^/]+)|workbench\/contrib\/([^/]+))/.exec(path);
  if (vscode) return (vscode[1] || vscode[2])!;
  return path.includes('/') ? path.split('/')[0]! : 'Repository root';
}

export function analyze(capture: Capture): AnalyzedFile[] {
  return capture.files.map((file, originalIndex) => {
    const classification = classify(file.filename);
    const roles = classification.map(fact => fact.role);
    const name = file.filename.split('/').at(-1)!;
    const propertyEvidence: AnalyzedFile['propertyEvidence'] = [];
    if (roles.includes('source') && /schema/i.test(name)) {
      propertyEvidence.push({ property: 'schema', reason: 'Source filename contains “schema”; filename heuristic, not semantic validation.' });
    }
    if (roles.includes('source') && /config|settings/i.test(name)) {
      propertyEvidence.push({ property: 'configuration', reason: 'Source filename suggests configuration or settings behavior; filename heuristic.' });
    }
    const added = (file.patch || '').split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
    const hasControlFlowChange = roles.includes('source') && /\b(?:if\s*\(|throw\s|catch\s*\(|assert\w*\s*\()/.test(added);
    const attentionTier = roles.includes('snapshot') || roles.includes('fixture') || roles.includes('lockfile') ? 4
      : roles.includes('source') || roles.includes('configuration') || roles.includes('manifest') ? 0
      : roles.includes('test') ? 1 : roles.includes('documentation') ? 2 : 3;
    const attentionReasons = [
      attentionTier === 0 ? 'Implementation, configuration or dependency change.'
        : attentionTier === 1 ? 'Test behavior; ordered after implementation in this initial heuristic.'
        : attentionTier === 4 ? 'Supporting output or fixture; grouped later, still fully inspectable.'
        : 'Supporting document or unclassified file.',
      ...(hasControlFlowChange ? ['Added lines include a branch, throw, catch or assertion. This is a text heuristic.'] : []),
      `${file.changes.toLocaleString()} changed lines (${file.additions} added, ${file.deletions} removed).`,
    ];
    if (file.status === 'renamed') attentionReasons.push('Renamed file; previous path is retained.');
    if (file.patch === null && file.head_content === '') attentionReasons.push('Empty file; no patch text is expected.');
    return {
      ...file, originalIndex, name,
      directory: file.filename.split('/').slice(0, -1).join('/') || 'Repository root',
      language: language(file.filename), area: area(file.filename), roles,
      classification, hasControlFlowChange, attentionTier, attentionReasons,
      properties: propertyEvidence.map(fact => fact.property), propertyEvidence,
    };
  });
}

const pathOrder = (a: AnalyzedFile, b: AnalyzedFile) => a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;

export function orderFiles(files: AnalyzedFile[], strategy: Strategy): AnalyzedFile[] {
  return [...files].sort((a, b) => {
    if (strategy === 'original') return a.originalIndex - b.originalIndex;
    if (strategy === 'volume') return b.changes - a.changes || pathOrder(a, b);
    return a.attentionTier - b.attentionTier
      || Number(b.hasControlFlowChange) - Number(a.hasControlFlowChange)
      || b.changes - a.changes || pathOrder(a, b);
  });
}

export function visibilityFor(file: AnalyzedFile, rules: VisibilityRules, override?: Visibility) {
  if (override) return { state: override, reason: 'Per-file override.' };
  const matching = file.roles.filter(role => rules[role]);
  for (const state of ['show', 'fold', 'hide'] as const) {
    const winners = matching.filter(role => rules[role] === state);
    if (winners.length) return { state, reason: `${winners.map(role => roleLabels[role]).join(', ')} set to ${state}.` };
  }
  return { state: 'show' as const, reason: 'No category override; shown by default.' };
}
