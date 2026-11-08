import ts from "typescript";

// Language service over a virtual FS pinned to a git sha. Content is immutable
// per key, so snapshots never version and caches never invalidate.
//
// Everything here is synchronous (the LS host API and Git reads are sync), so
// this module must only run inside the AST worker - never on
// the HTTP event loop. See tsWorker.ts / astResolve.ts.
export interface ShaSource {
  key: string;
  paths: () => string[];
  readFile: (path: string) => string | null;
}

export interface AstDefinition {
  path: string;
  line: number;
  text: string;
  symbol: string;
}

interface PathsRule {
  baseDir: string;
  patterns: [pattern: string, targets: string[]][];
}

interface ServiceEntry {
  service: ts.LanguageService;
  roots: Set<string>;
  content: Map<string, string | null>;
  pathSet: Set<string>;
}

const SERVICE_CAP = 2;
const services = new Map<string, ServiceEntry>();

const SCRIPT_RE = /<script[^>]*>([\s\S]*?)<\/script>/g;

// Blank out markup so the virtual module keeps the .svelte file's exact line
// and column numbering in both directions. Template expressions are out of
// scope; clicks there fail the token guard and fall back to grep.
export function svelteScriptOnly(source: string): string {
  let out = "";
  let cursor = 0;
  for (const match of source.matchAll(SCRIPT_RE)) {
    const bodyStart = match.index + match[0].indexOf(">") + 1;
    out += blankPreservingLines(source.slice(cursor, bodyStart));
    out += match[1];
    cursor = bodyStart + match[1]!.length;
  }
  out += blankPreservingLines(source.slice(cursor));
  return out;
}

function blankPreservingLines(chunk: string): string {
  return chunk.replace(/[^\n]/g, " ");
}

const VIRTUAL_SVELTE_SUFFIX = ".svelte.ts";

function toVirtual(path: string): string {
  return path.endsWith(".svelte") ? `/${path}.ts` : `/${path}`;
}

function fromVirtual(fileName: string): string {
  const bare = fileName.replace(/^\//, "");
  return bare.endsWith(VIRTUAL_SVELTE_SUFFIX) ? bare.slice(0, -3) : bare;
}

const FILE_EXTS = [".ts", ".tsx", ".d.ts", ".svelte", ".js", ".jsx", ".mjs", ".cjs"];

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: false,
  noLib: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
};

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function extensionOf(path: string): ts.Extension {
  if (path.endsWith(".d.ts")) return ts.Extension.Dts;
  if (path.endsWith(".tsx")) return ts.Extension.Tsx;
  if (path.endsWith(".jsx")) return ts.Extension.Jsx;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.Extension.Js;
  return ts.Extension.Ts;
}

function parseTsconfigPaths(
  configPath: string,
  readFile: (path: string) => string | null,
  visited: Set<string>,
): PathsRule | null {
  if (visited.has(configPath)) return null;
  visited.add(configPath);
  const raw = readFile(configPath);
  if (raw === null) return null;
  const { config } = ts.parseConfigFileTextToJson(configPath, raw);
  if (!config) return null;
  const options = config.compilerOptions ?? {};
  const configDir = dirname(configPath);
  let rule: PathsRule | null = null;
  if (options.paths && typeof options.paths === "object") {
    const baseDir = options.baseUrl ? normalize(`${configDir}/${options.baseUrl}`) : configDir;
    const patterns: PathsRule["patterns"] = [];
    for (const [pattern, targets] of Object.entries(options.paths)) {
      if (Array.isArray(targets)) patterns.push([pattern, targets.filter((t): t is string => typeof t === "string")]);
    }
    if (patterns.length) rule = { baseDir, patterns };
  }
  if (!rule && typeof config.extends === "string" && config.extends.startsWith(".")) {
    const parent = normalize(`${configDir}/${config.extends}`);
    rule = parseTsconfigPaths(parent.endsWith(".json") ? parent : `${parent}.json`, readFile, visited);
  }
  return rule;
}

function parseTsconfigConditions(
  configPath: string,
  readFile: (path: string) => string | null,
  visited = new Set<string>(),
): string[] | null {
  if (visited.has(configPath)) return null;
  visited.add(configPath);
  const raw = readFile(configPath);
  if (raw === null) return null;
  const { config } = ts.parseConfigFileTextToJson(configPath, raw);
  if (!config) return null;
  const conditions = config.compilerOptions?.customConditions;
  if (Array.isArray(conditions)) return conditions.filter((value): value is string => typeof value === "string");
  if (typeof config.extends === "string" && config.extends.startsWith(".")) {
    const parent = normalize(`${dirname(configPath)}/${config.extends}`);
    return parseTsconfigConditions(parent.endsWith(".json") ? parent : `${parent}.json`, readFile, visited);
  }
  return null;
}

function matchPaths(rule: PathsRule, specifier: string): string[] {
  const out: string[] = [];
  for (const [pattern, targets] of rule.patterns) {
    const star = pattern.indexOf("*");
    let captured: string | null = null;
    if (star === -1) {
      if (specifier !== pattern) continue;
      captured = "";
    } else {
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < prefix.length + suffix.length) continue;
      captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    for (const target of targets) {
      out.push(normalize(`${rule.baseDir}/${target.replace("*", captured)}`));
    }
  }
  return out;
}

function entryFor(source: ShaSource): ServiceEntry {
  const cached = services.get(source.key);
  if (cached) {
    // refresh LRU order
    services.delete(source.key);
    services.set(source.key, cached);
    return cached;
  }

  const roots = new Set<string>();
  const content = new Map<string, string | null>();
  const pathSet = new Set(source.paths());
  const pathsRules = new Map<string, PathsRule | null>();

  const read = (fileName: string): string | null => {
    if (content.has(fileName)) return content.get(fileName)!;
    const repoPath = fromVirtual(fileName);
    let text = pathSet.has(repoPath) ? source.readFile(repoPath) : null;
    if (text !== null && repoPath.endsWith(".svelte")) text = svelteScriptOnly(text);
    content.set(fileName, text);
    return text;
  };

  const resolveStem = (stem: string): string | null => {
    if (pathSet.has(stem)) return stem;
    const swapped = stem.replace(/\.(m|c)?js$/, ".ts");
    if (swapped !== stem) {
      for (const candidate of [swapped, stem.replace(/\.(m|c)?js$/, ".tsx")]) {
        if (pathSet.has(candidate)) return candidate;
      }
    }
    for (const base of [stem, `${stem}/index`]) {
      for (const ext of FILE_EXTS) {
        if (pathSet.has(`${base}${ext}`)) return `${base}${ext}`;
      }
    }
    return null;
  };

  // Nearest sha-pinned tsconfig with paths, walking up from the importing file.
  const pathsRuleFor = (fromRepo: string): PathsRule | null => {
    let dir = dirname(fromRepo);
    const missed: string[] = [];
    while (true) {
      if (pathsRules.has(dir)) {
        const rule = pathsRules.get(dir)!;
        for (const m of missed) pathsRules.set(m, rule);
        return rule;
      }
      missed.push(dir);
      const configPath = dir ? `${dir}/tsconfig.json` : "tsconfig.json";
      if (pathSet.has(configPath)) {
        const rule = parseTsconfigPaths(configPath, source.readFile, new Set());
        if (rule) {
          for (const m of missed) pathsRules.set(m, rule);
          return rule;
        }
      }
      if (dir === "") {
        for (const m of missed) pathsRules.set(m, null);
        return null;
      }
      dir = dirname(dir);
    }
  };

  let packageDirs: Map<string, string[]> | undefined;
  const customConditions = new Map<string, string[]>();
  const conditionsFor = (fromRepo: string): string[] => {
    let dir = dirname(fromRepo);
    const cached = customConditions.get(dir);
    if (cached) return cached;
    while (true) {
      const conditions = parseTsconfigConditions(dir ? `${dir}/tsconfig.json` : "tsconfig.json", (path) => read(toVirtual(path)));
      if (conditions) {
        customConditions.set(dirname(fromRepo), conditions);
        return conditions;
      }
      if (!dir) break;
      dir = dirname(dir);
    }
    customConditions.set(dirname(fromRepo), []);
    return [];
  };

  const resolvePackage = (specifier: string, fromRepo: string): string | null => {
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
    if (!packageDirs) {
      packageDirs = new Map();
      for (const path of pathSet) {
        if (path !== "package.json" && !path.endsWith("/package.json")) continue;
        const raw = read(toVirtual(path));
        if (raw === null) continue;
        let manifest: unknown;
        try { manifest = JSON.parse(raw); } catch { continue; }
        if (!manifest || typeof manifest !== "object" || !("name" in manifest) || typeof manifest.name !== "string") continue;
        const dirs = packageDirs.get(manifest.name) ?? [];
        dirs.push(dirname(path));
        packageDirs.set(manifest.name, dirs);
      }
    }
    const dirs = packageDirs.get(name);
    if (dirs?.length !== 1) return null;
    const packageDir = dirs[0]!;
    const repoPathFor = (fileName: string): string => {
      const marker = `/node_modules/${name}/`;
      const offset = fileName.lastIndexOf(marker);
      return offset === -1 ? fromVirtual(fileName) : normalize(`${packageDir}/${fileName.slice(offset + marker.length)}`);
    };
    const resolved = ts.resolveModuleName(specifier, toVirtual(fromRepo), {
      ...COMPILER_OPTIONS,
      customConditions: conditionsFor(fromRepo),
    }, {
      fileExists: (fileName) => pathSet.has(repoPathFor(fileName)),
      readFile: (fileName) => read(toVirtual(repoPathFor(fileName))) ?? undefined,
    }).resolvedModule;
    if (!resolved) return null;
    const path = repoPathFor(resolved.resolvedFileName);
    return pathSet.has(path) ? path : null;
  };

  const resolveRepoPath = (specifier: string, fromRepo: string): string | null => {
    if (specifier.startsWith(".")) {
      return resolveStem(normalize(`${dirname(fromRepo)}/${specifier}`));
    }
    const rule = pathsRuleFor(fromRepo);
    for (const stem of rule ? matchPaths(rule, specifier) : []) {
      const resolved = resolveStem(stem);
      if (resolved) return resolved;
    }
    return resolvePackage(specifier, fromRepo);
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...roots],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text = read(fileName);
      return text === null ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => COMPILER_OPTIONS,
    getDefaultLibFileName: () => "lib.d.ts",
    fileExists: (fileName) => read(fileName) !== null,
    readFile: (fileName) => read(fileName) ?? undefined,
    useCaseSensitiveFileNames: () => true,
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => {
        const resolved = resolveRepoPath(literal.text, fromVirtual(containingFile));
        if (!resolved) return { resolvedModule: undefined };
        const virtual = toVirtual(resolved);
        return {
          resolvedModule: {
            resolvedFileName: virtual,
            extension: virtual.endsWith(VIRTUAL_SVELTE_SUFFIX) ? ts.Extension.Ts : extensionOf(virtual),
            isExternalLibraryImport: false,
          },
        };
      }),
  };

  const entry: ServiceEntry = { service: ts.createLanguageService(host), roots, content, pathSet };
  services.set(source.key, entry);
  if (services.size > SERVICE_CAP) {
    const oldest = services.keys().next().value;
    if (oldest !== undefined) {
      services.get(oldest)!.service.dispose();
      services.delete(oldest);
    }
  }
  return entry;
}

const IDENT_CHAR = /[A-Za-z0-9_$]/;

function identifierAt(text: string, offset: number): string | null {
  if (!IDENT_CHAR.test(text[offset] ?? "")) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && IDENT_CHAR.test(text[start - 1]!)) start -= 1;
  while (end < text.length && IDENT_CHAR.test(text[end]!)) end += 1;
  const word = text.slice(start, end);
  return /^[A-Za-z_$]/.test(word) ? word : null;
}

// line is 1-based, character is 0-based within the line.
export function definitionsAt(
  source: ShaSource,
  fromPath: string,
  symbol: string,
  line: number,
  character: number,
): AstDefinition[] | null {
  const entry = entryFor(source);
  const fileName = toVirtual(fromPath);
  entry.roots.add(fileName);

  const program = entry.service.getProgram();
  const sourceFile = program?.getSourceFile(fileName);
  if (!sourceFile) return null;

  let offset: number;
  try {
    offset = ts.getPositionOfLineAndCharacter(sourceFile, line - 1, character);
  } catch {
    return null;
  }
  let moduleString = false;
  const findModule = (node: ts.Node): void => {
    if (offset < node.getStart(sourceFile) || offset >= node.getEnd()) return;
    if (ts.isStringLiteralLike(node) && node.text === symbol) {
      const parent = node.parent;
      moduleString = (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node
        || ts.isExternalModuleReference(parent) && parent.expression === node
        || ts.isCallExpression(parent) && parent.arguments[0] === node
          && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(parent.expression) && parent.expression.text === "require")
        || ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent);
    } else ts.forEachChild(node, findModule);
  };
  findModule(sourceFile);
  if (!moduleString && identifierAt(sourceFile.text, offset) !== symbol) return null;

  const defs = entry.service.getDefinitionAtPosition(fileName, offset);
  if (!defs?.length) return null;

  const out: AstDefinition[] = [];
  for (const def of defs) {
    if (def.kind === ts.ScriptElementKind.alias) continue;
    const repoPath = fromVirtual(def.fileName);
    if (!entry.pathSet.has(repoPath)) continue;
    const defSource = program?.getSourceFile(def.fileName);
    if (!defSource) continue;
    const pos = ts.getLineAndCharacterOfPosition(defSource, def.textSpan.start);
    const lineText = defSource.text.split("\n")[pos.line] ?? "";
    out.push({ path: repoPath, line: pos.line + 1, text: lineText.trim(), symbol: moduleString ? symbol : def.name });
  }
  return out.length ? out : null;
}

export interface AstReference extends AstDefinition {
  character: number;
  length: number;
  isDefinition: boolean;
}
export interface AstReferences {
  references: AstReference[];
  names: string[];
}

export function referencesAt(source: ShaSource, fromPath: string, symbol: string, line: number, character: number, candidatePaths: string[]): AstReferences | null {
  const entry = entryFor(source);
  const previousRoots = [...entry.roots];
  entry.roots.clear();
  for (const path of [fromPath, ...candidatePaths]) if (entry.pathSet.has(path)) entry.roots.add(toVirtual(path));
  try {
    const fileName = toVirtual(fromPath);
    const sourceFile = entry.service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return null;
    let offset;
    try { offset = ts.getPositionOfLineAndCharacter(sourceFile, line - 1, character); } catch { return null; }
    if (identifierAt(sourceFile.text, offset) !== symbol) return null;
    const targets = [{ fileName, textSpan: { start: offset } }, ...(entry.service.getDefinitionAtPosition(fileName, offset) ?? [])];
    const groups = targets.flatMap(target => entry.service.findReferences(target.fileName, target.textSpan.start) ?? []);
    if (!groups.length) return null;
    const program = entry.service.getProgram();
    const found = new Map<string, AstReference>();
    const names = new Set<string>([symbol]);
    for (const group of groups) {
      for (const ref of [ { ...group.definition, isDefinition: true }, ...group.references ]) {
        const path = fromVirtual(ref.fileName);
        const file = program?.getSourceFile(ref.fileName);
        if (!entry.pathSet.has(path) || !file) continue;
        const name = file.text.slice(ref.textSpan.start, ref.textSpan.start + ref.textSpan.length);
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
        const pos = ts.getLineAndCharacterOfPosition(file, ref.textSpan.start);
        const key = `${path}:${ref.textSpan.start}`;
        const previous = found.get(key);
        found.set(key, { path, line: pos.line + 1, character: pos.character, length: ref.textSpan.length,
          text: (file.text.split("\n")[pos.line] ?? "").trim(), symbol: name,
          isDefinition: Boolean(ref.isDefinition || previous?.isDefinition),
        });
      }
    }
    return { references: [...found.values()].sort((a,b) => a.path.localeCompare(b.path) || a.line - b.line || a.character - b.character), names: [...names] };
  } finally {
    entry.roots.clear();
    for (const path of previousRoots) entry.roots.add(path);
  }
}

export type InsightKind = 'hover' | 'outline' | 'type' | 'implementation';
export interface InsightRange { line:number; character:number; endLine:number; endCharacter:number }
export interface InsightOutline { name:string; kind:string; range:InsightRange; selection:InsightRange; children:InsightOutline[] }
export interface AstInsight {
  status:'ok' | 'unsupported' | 'unavailable';
  reason?:string;
  hover:{signature:string;documentation:string} | null;
  outline:InsightOutline[];
  locations:AstDefinition[];
  limited:boolean;
}
export function insightAt(source:ShaSource,request:{path:string;kind:InsightKind;line:number;character:number;symbol?:string;candidatePaths?:string[]}):AstInsight {
  const {path:fromPath,kind,line,character,symbol='',candidatePaths=[]}=request;
  const result:AstInsight={status:'ok',hover:null,outline:[],locations:[],limited:false};
  if(!/\.(?:[cm]?[jt]sx?|svelte)$/.test(fromPath))return {...result,status:'unsupported',reason:'This file type has no source analysis provider.'};
  const raw=source.paths().includes(fromPath) ? source.readFile(fromPath) : null;
  if(raw===null)return {...result,status:'unavailable',reason:'Source is unavailable at this revision.'};
  if(Buffer.byteLength(raw,'utf8')>512*1024)return {...result,status:'unavailable',reason:'Source analysis is limited to files up to 512KiB.'};
  const entry=entryFor(source),fileName=toVirtual(fromPath),previousRoots=[...entry.roots];
  if(kind==='implementation')entry.roots.clear();
  const roots=[...new Set([fromPath,...candidatePaths])];
  if(roots.length>300)result.limited=true;
  for(const path of roots.slice(0,300))if(entry.pathSet.has(path))entry.roots.add(toVirtual(path));
  try {
    const program=entry.service.getProgram(),file=program?.getSourceFile(fileName);
    if(!file)return {...result,status:'unavailable'};
    const range=(span:ts.TextSpan):InsightRange=>{
      const start=ts.getLineAndCharacterOfPosition(file,Math.min(span.start,file.text.length));
      const end=ts.getLineAndCharacterOfPosition(file,Math.min(span.start+span.length,file.text.length));
      return {line:start.line+1,character:start.character,endLine:end.line+1,endCharacter:end.character};
    };
    if(kind==='outline') {
      let count=0;
      const items=(nodes:ts.NavigationTree[]=[]):InsightOutline[]=>{
        const output:InsightOutline[]=[];
        for(const node of nodes) {
          if(count>=500){result.limited=true;break;}
          const span=node.spans[0];if(!span)continue;count++;if(node.text.length>240)result.limited=true;
          output.push({name:node.text.slice(0,240),kind:node.kind,range:range(span),selection:range(node.nameSpan ?? span),children:items(node.childItems)});
        }
        return output;
      };
      result.outline=items(entry.service.getNavigationTree(fileName).childItems);return result;
    }
    const lineText=file.text.split('\n')[line-1];
    if(!Number.isSafeInteger(line) || !Number.isSafeInteger(character) || line<1 || character<0 || lineText===undefined || character>lineText.length)return {...result,status:'unavailable'};
    let offset:number;
    try{offset=ts.getPositionOfLineAndCharacter(file,line-1,character);}catch{return {...result,status:'unavailable'};}
    const identifier=identifierAt(file.text,offset);
    if(!identifier)return result;
    if(symbol && identifier!==symbol)return {...result,status:'unavailable'};
    if(kind==='hover') {
      const info=entry.service.getQuickInfoAtPosition(fileName,offset);
      if(info){const signature=ts.displayPartsToString(info.displayParts),documentation=ts.displayPartsToString(info.documentation);
        result.hover={signature:signature.slice(0,4000),documentation:documentation.slice(0,8000)};result.limited=signature.length>4000 || documentation.length>8000;}
      return result;
    }
    const definitions=kind==='type' ? entry.service.getTypeDefinitionAtPosition(fileName,offset) : entry.service.getImplementationAtPosition(fileName,offset);
    for(const definition of definitions ?? []) {
      const path=fromVirtual(definition.fileName),target=program?.getSourceFile(definition.fileName);
      if(!entry.pathSet.has(path) || !target)continue;
      if(result.locations.length>=200){result.limited=true;break;}
      const position=ts.getLineAndCharacterOfPosition(target,definition.textSpan.start);
      result.locations.push({path,line:position.line+1,text:(target.text.split('\n')[position.line] ?? '').trim(),symbol:identifierAt(target.text,definition.textSpan.start) ?? ''});
    }
    return result;
  } finally {entry.roots.clear();for(const root of previousRoots)entry.roots.add(root);}
}
