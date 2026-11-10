import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { captureFromDiff } from '../shared/review-organization/capture.ts';
import { analyze } from '../shared/review-organization/analysis.ts';
import { extractSourceFacts } from '../shared/review-organization/source-analysis.js';
import { buildReferenceGraph } from '../shared/review-organization/relationships.ts';
import { orderByImports } from '../shared/review-organization/flow.ts';
import { compareFunctions, type FunctionMetric, type HistoryCommit, type ReviewInsights } from '../shared/review-insights.ts';
import { parseDiff } from '../ui/src/lib/diff.js';

const SOURCE = /\.[cm]?[jt]sx?$/i;
const MAX_FILES = 128, MAX_FILE_BYTES = 512_000, MAX_TOTAL_BYTES = 12_000_000, MAX_COMMITS = 500;
const SHA = /^[a-f0-9]{40}$/;
function git(checkout: string, args: string[], maxBuffer = 5_000_000, timeout = 5000) {
  const result = Bun.spawnSync(['git', '--no-lazy-fetch', '-C', checkout, ...args], {stdout:'pipe',stderr:'ignore',maxBuffer,timeout});
  if (!result.success) throw new Error('Pinned Git evidence is unavailable or exceeded its limits.');
  return result.stdout.toString();
}
function validPath(path: string) { return Boolean(path) && path.length <= 4096 && !path.startsWith('/') && !path.includes('\0') && !path.split('/').includes('..'); }
function functions(value: unknown, content: string): FunctionMetric[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid analyzer function inventory.');
  const count = content.split('\n').length;
  return value.map(item => {
    if (!item || typeof item.name !== 'string' || typeof item.signature !== 'string' || item.name.length > 2000 || item.signature.length > 8000 || !['start','end','complexity','nloc'].every(key => Number.isSafeInteger(item[key]) && item[key] >= 0) || item.start < 1 || item.end < item.start || item.end > count || item.complexity < 1) throw new Error('Invalid analyzer function measurement.');
    return {name:item.name,signature:item.signature,start:item.start,end:item.end,complexity:item.complexity,nloc:item.nloc};
  });
}
export function computeReviewInsights(checkout: string, request: {repo: string; number: number; base: string; head: string}, patch: string, python?: string): ReviewInsights {
  const capture = captureFromDiff(request.repo,request.number,request.base,request.head,parseDiff(patch));
  if (capture.files.some(file => !validPath(file.filename) || (file.previous_filename && !validPath(file.previous_filename)))) throw new Error('Invalid changed-file path.');
  if(capture.files.length>500)throw new Error('Insights support at most 500 changed files per comparison.');
  const diffBase=git(checkout,['merge-base',request.base,request.head],128).trim();
  if(!SHA.test(diffBase))throw new Error('The effective diff base is unavailable.');
  const revisions={base:diffBase,head:request.head};
  const selected = capture.files.filter(file => SOURCE.test(file.filename)).slice(0,MAX_FILES);
  const contents = new Map<string,string>(); let bytes = 0;
  for (const file of selected) for (const side of ['base','head'] as const) {
    if (side === 'base' && file.status === 'added' || side === 'head' && file.status === 'removed') continue;
    const path = side === 'base' ? file.previous_filename ?? file.filename : file.filename;
    try {
      const object = `${revisions[side]}:${path}`;
      const size = Number(git(checkout,['cat-file','-s',object],128));
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES || bytes + size > MAX_TOTAL_BYTES) continue;
      const content = git(checkout,['show','--no-ext-diff','--no-textconv',object],MAX_FILE_BYTES);
      contents.set(`${side}:${file.filename}`,content); bytes += size;
    } catch {}
  }
  const factsFor = (side: 'base' | 'head') => extractSourceFacts(selected.flatMap(file => {
    const content = contents.get(`${side}:${file.filename}`);
    return content === undefined ? [] : [{path:side==='base' ? file.previous_filename ?? file.filename : file.filename,content,changedLines:new Set<number>()}];
  }));
  const headFacts = factsFor('head'), baseFacts = factsFor('base');
  const goodHead = new Set(headFacts.filter((fact: any)=>fact.status==='ok').map((fact: any)=>fact.path));
  const goodBase = new Set(baseFacts.filter((fact: any)=>fact.status==='ok').map((fact: any)=>fact.path));
  const units = selected.flatMap(file => (['base','head'] as const).flatMap(side => {
    const content = contents.get(`${side}:${file.filename}`), path = side==='base' ? file.previous_filename ?? file.filename : file.filename;
    return content !== undefined && (side==='head' ? goodHead : goodBase).has(path) ? [{id:`${side}:${file.filename}`,path,content}] : [];
  }));
  const measurements = new Map<string,{functions:FunctionMetric[];limited:boolean}>();
  const provider: ReviewInsights['provider'] = {name:'Lizard',version:null,available:false};
  const executable = python ?? process.env.PRVIEW_ANALYSIS_PYTHON ?? join(import.meta.dir,'../node_modules/.prview-analysis/bin/python');
  try {
    if (!existsSync(executable)) throw new Error('Optional complexity analyzer is not installed.');
    const process = Bun.spawnSync([executable,'-I',join(import.meta.dir,'../scripts/review-complexity.py')], {cwd:import.meta.dir,stdin:Buffer.from(JSON.stringify(units)),stdout:'pipe',stderr:'ignore',maxBuffer:3_000_000,timeout:15_000});
    if (!process.success) throw new Error('Complexity analysis failed or exceeded its limits.');
    const decoded = JSON.parse(process.stdout.toString());
    if (decoded.version !== '1.25.1' || !Array.isArray(decoded.units) || decoded.units.length !== units.length) throw new Error('Unexpected analyzer version or result.');
    for (const unit of units) {
      const matches = decoded.units.filter((item: any)=>item.id===unit.id);
      if (matches.length !== 1 || typeof matches[0].limited !== 'boolean') throw new Error('Invalid analyzer result identity.');
      measurements.set(unit.id,{functions:functions(matches[0].functions,unit.content),limited:matches[0].limited});
    }
    provider.available = true; provider.version = decoded.version;
  } catch (error) { measurements.clear(); provider.reason = error instanceof Error ? error.message : 'Complexity analysis unavailable.'; }
  const history: ReviewInsights['history'] = {status:'unavailable',from:0,until:0,days:90,commitsExamined:0,limited:false};
  const historyByPath = new Map<string,HistoryCommit[]>(), cochanges = new Map<string,Map<string,number>>();
  const aliases = new Map(capture.files.map(file=>[file.previous_filename ?? file.filename,file.filename]));
  try {
    history.until = Number(git(checkout,['show','-s','--format=%ct',request.base],128));
    if (!Number.isSafeInteger(history.until) || history.until <= 0) throw new Error('Invalid base commit time.');
    history.from = history.until - history.days * 86400;
    const raw = git(checkout,['log','--no-ext-diff','--no-textconv','--no-merges',`--max-count=${MAX_COMMITS+1}`,`--since-as-filter=@${history.from}`,'--format=%x00%H%x00%an%x00%ct%x00%s','--name-only','-z',request.base],5_000_000,8000);
    const records = raw ? raw.slice(1).split('\0\0') : [];
    history.limited = records.length > MAX_COMMITS;
    for (const record of records.slice(0,MAX_COMMITS)) {
      const [sha,author,time,title,...names] = record.split('\0');
      if (!sha || !SHA.test(sha) || author === undefined || title === undefined || !Number.isSafeInteger(Number(time))) throw new Error('Cannot decode bounded history.');
      history.commitsExamined++;
      const timestamp = Number(time);
      if (timestamp < history.from || timestamp > history.until) continue;
      if (names[0]?.startsWith('\n')) names[0] = names[0].slice(1);
      const paths = [...new Set(names.filter(validPath).map(path=>aliases.get(path) ?? path))];
      const clippedAuthor=author.slice(0,120),clippedTitle=title.slice(0,400);
      if(clippedAuthor!==author||clippedTitle!==title)history.limited=true;
      const commit = {sha,author:clippedAuthor,timestamp,title:clippedTitle};
      for (const path of paths) {
        if (![...aliases.values()].includes(path)) continue;
        const entries = historyByPath.get(path) ?? []; entries.push(commit); historyByPath.set(path,entries);
        const pairs = cochanges.get(path) ?? new Map<string,number>();
        if (paths.length <= 200) { for (const related of paths) if (related !== path) pairs.set(related,(pairs.get(related) ?? 0)+1); }
        else history.limited = true;
        cochanges.set(path,pairs);
      }
    }
    history.status='ok';
  } catch (error) { historyByPath.clear(); cochanges.clear(); history.reason=error instanceof Error ? error.message : 'History unavailable.'; }
  const baseCapture = {...capture,head_sha:diffBase,files:capture.files.filter(file=>file.status!=='added').map(file=>({...file,filename:file.previous_filename ?? file.filename,status:'modified'}))};
  const graphFor = (side: 'base'|'head', facts: any[]) => buildReferenceGraph(side==='base'?baseCapture:capture,{schemaVersion:1,repository:request.repo,headSha:revisions[side],reportedBaseSha:request.base,files:facts.filter(fact=>fact.status==='ok').map(fact=>({...fact,side:'head',revision:revisions[side]}))});
  const graph = graphFor('head',headFacts), baseGraph = graphFor('base',baseFacts);
  baseGraph.edges=baseGraph.edges.map(edge=>({...edge,from:aliases.get(edge.from) ?? edge.from,to:aliases.get(edge.to) ?? edge.to}));
  const headCycles=orderByImports(analyze(capture),graph).cycles, oldCycles=orderByImports(analyze(capture),baseGraph).cycles;
  const cycles=headCycles.map(paths=>({paths,isNew:!oldCycles.some(old=>paths.every(path=>old.includes(path))) && paths.every(path=>{const file=capture.files.find(file=>file.filename===path)!;return file.status==='added'||goodBase.has(file.previous_filename ?? path);})}));
  const files: ReviewInsights['files'] = Object.create(null);
  for (const file of capture.files) {
    const before=measurements.get(`base:${file.filename}`), after=measurements.get(`head:${file.filename}`);
    const measured=provider.available && !before?.limited && !after?.limited && Boolean(before || file.status==='added') && Boolean(after || file.status==='removed');
    const supported=SOURCE.test(file.filename), basePath=file.previous_filename ?? file.filename;
    const complexity: ReviewInsights['files'][string]['complexity'] = {status:measured?'ok':supported?'unavailable':'unsupported',total:measured?(after?.functions ?? []).reduce((n,fn)=>n+fn.complexity,0):null,maximum:measured?Math.max(0,...(after?.functions ?? []).map(fn=>fn.complexity)):null,changes:measured?compareFunctions(before?.functions ?? [],after?.functions ?? [],file.patch,file.status==='added',file.status==='removed'):[],limited:Boolean(before?.limited || after?.limited)};
    if (!measured) complexity.reason=!supported?'Function metrics currently cover JavaScript and TypeScript.':before?.limited||after?.limited?'Function inventory was incomplete or exceeded 500 functions; comparisons are unavailable.':provider.reason ?? 'Source was unavailable, invalid, or outside the bounded analysis.';
    const commits=historyByPath.get(file.filename) ?? [], related=[...(cochanges.get(file.filename) ?? [])].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([path,commits])=>({path,commits}));
    const imports=new Map<string,number>(),dependents=new Map<string,number>();
    for (const edge of graph.edges.filter(edge=>edge.kind==='import')) {
      if(edge.from===file.filename)imports.set(edge.to,edge.evidence[0]?.line ?? 1);
      if(edge.to===file.filename)dependents.set(edge.from,edge.evidence[0]?.line ?? 1);
    }
    const fileCycles=cycles.filter(cycle=>cycle.paths.includes(file.filename)), complexityIncreased=complexity.changes.some(change=>change.delta!==null && change.delta>0), newCycle=fileCycles.some(cycle=>cycle.isNew);
    const score=complexity.total!==null && !complexity.limited && history.status==='ok' ? complexity.total*commits.length : null;
    const signals=Number(complexityIncreased)+Number(newCycle)+Number(commits.length>=5);
    files[file.filename]={path:file.filename,basePath,complexity,activity:{status:history.status,count:commits.length,authors:[...new Set(commits.map(c=>c.author))],commits:commits.slice(0,30),related},dependencies:{imports:[...imports].map(([path,line])=>({path,line})),dependents:[...dependents].map(([path,line])=>({path,line})),cycles:fileCycles},score,signals,complexityIncreased,newCycle};
  }
  const result:ReviewInsights={status:'ok',version:1,repo:request.repo,base:request.base,diffBase,head:request.head,provider,files,history,coverage:{totalFiles:capture.files.length,selectedFiles:selected.length,headParsed:goodHead.size,baseParsed:goodBase.size,measuredFiles:Object.values(files).filter(file=>file.complexity.status==='ok').length,dependencyScope:'changed-files',limitations:['Dependency evidence covers resolved relative imports among supported changed JS/TS files; it is not a repository-wide graph.','Cycles exclude type-only imports. A new cycle means new within the resolved comparison graphs.','History counts non-merge commits at base paths; earlier renames are not followed.','History and source analysis are bounded. Missing or truncated metrics do not become zero scores.']}};
  if(Buffer.byteLength(JSON.stringify(result))>8_000_000)throw new Error('Review insights exceeded the response size limit.');
  return result;
}

declare const self: Worker;
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') self.onmessage=({data})=>{try{self.postMessage(computeReviewInsights(data.checkout,data.request,data.patch));}catch(error){self.postMessage({error:error instanceof Error?error.message:'Review insights unavailable.'});}};
