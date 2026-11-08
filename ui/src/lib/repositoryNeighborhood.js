import {sourceEvidence} from './sourceEvidence.js';
const extensions=['','.ts','.tsx','.js','.jsx','.mts','.cts','.mjs','.cjs','.svelte','/index.ts','/index.tsx','/index.js'];
const stem=path=>path.split('/').at(-1).replace(/\.(?:test|spec)\.[^.]+$|\.[^.]+$/,'');
const words=value=>value.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>2);
export function relativeImportTargets(from,specifier,paths){
 if(!/^\.\.?\//.test(specifier) || /[?#\\\x00-\x1f]/.test(specifier))return [];
 const parts=from.split('/').slice(0,-1);for(const part of specifier.split('/')){if(part==='.' || !part)continue;if(part==='..'){if(!parts.length)return [];parts.pop();}else parts.push(part);}
 const base=parts.join('/'),stems=[base];if(/\.[cm]?js$/.test(base))stems.push(base.replace(/\.[cm]?js$/,'.ts'),base.replace(/\.[cm]?js$/,'.tsx'));
 const set=new Set(paths);return [...new Set(stems.flatMap(base=>extensions.map(extension=>base+extension)).filter(path=>set.has(path)))];
}
export function catalogCandidates(path,paths,query=''){
 const name=stem(path),tokens=words(query || name),directory=path.split('/').slice(0,-1).join('/');
 const result=[];
 for(const target of paths){if(target===path)continue;const targetName=stem(target),test=/(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|\.(?:test|spec)\./i.test(target);
  const shared=words(targetName).filter(word=>tokens.includes(word));
  if(test && (targetName===name || shared.length))result.push({path:target,line:1,text:targetName,category:'Tests',reason:`Test filename shares ${shared.join(', ') || name}; coverage is not inferred.`});
  else if(/(?:^|\/)(?:readme[^/]*\.md|contributing[^/]*\.md|agents\.md|architecture[^/]*\.md|adr[^/]*\.md)$|(?:^|\/)(?:adrs?|decisions)\/[^/]+\.md$/i.test(target))result.push({path:target,line:1,text:targetName,category:'Conventions / ADRs',reason:'Repository guidance candidate; inspect its contents before applying it.'});
  else if(shared.length && /\.(?:[cm]?[jt]sx?|svelte)$/.test(target))result.push({path:target,line:1,text:targetName,category:'Comparable filenames',reason:`Filename shares ${shared.join(', ')}; similarity is a discovery hint.`});
  else if(target.startsWith(directory+'/') && target.split('/').length===path.split('/').length && /\.(?:[cm]?[jt]sx?|svelte)$/.test(target))result.push({path:target,line:1,text:targetName,category:'Nearby files',reason:'Same directory; architectural relevance needs inspection.'});
 }
 return result.sort((a,b)=>a.path.length-b.path.length);
}
export async function discoverNeighborhood({request,repo,headRef,api,signal}){
 const {path,rev,query=''}=request;
 const [catalog,imports]=await Promise.all([api.repoFiles(repo,rev,headRef,signal),api.repoInsight({repo,sha:rev,headRef,path,kind:'imports'},signal)]);signal.throwIfAborted();
 if(catalog.status!=='ok')return catalog;
 const entries=[],reasons=['Candidates combine parsed static imports, filename proximity and literal mentions; this is not a complete call graph or a canonical-pattern verdict.'];
 let missing=0;for(const item of imports.imports ?? []){const targets=relativeImportTargets(path,item.specifier,catalog.paths);if(!targets.length)missing++;for(const target of targets)entries.push({path:target,line:1,text:item.text,category:'Dependencies',reason:`Static import/re-export at ${path}:${item.line}${targets.length>1?' · multiple source candidates':''}.`,originEvidence:{file:path,line:item.line}});}
 if(imports.status!=='ok')reasons.push(imports.reason || 'Static import analysis unavailable.');if(missing)reasons.push(`${missing} imports require package/alias resolution or have no tracked target.`);
 const groups=new Map();for(const item of catalogCandidates(path,catalog.paths,query)){const count=groups.get(item.category) ?? 0;if(count<40)entries.push(item);groups.set(item.category,count+1);}if([...groups.values()].some(count=>count>40))reasons.push('Filename and guidance candidates are capped at40 per category.');
 const term=query.trim() || stem(path);if(term.length>=2){const mentions=await api.repoSearch(repo,rev,headRef,term,signal);signal.throwIfAborted();for(const match of (mentions.matches ?? []).filter(item=>item.path!==path).slice(0,60))entries.push({...match,category:'Possible callers / mentions',reason:`Literal text match for “${term}”; not a semantic usage claim.`});if(mentions.status!=='ok')reasons.push('Literal mention search unavailable.');if(mentions.matches?.length>60)reasons.push('Literal mention candidates capped at60.');}
 if(imports.limited)reasons.push('Static import facts were truncated.');
 return {status:'ok',entries,coverage:{sourceOnly:true,limited:true,reasons}};
}

export async function discoveryEvidence({repo,entry,request,readFile,signal}){
 const locations=[{file:entry.path,line:entry.line},...(entry.originEvidence?[{...entry.originEvidence}]:[])],revision={rev:request.rev,base:request.base};
 const evidence=await Promise.all(locations.map(async location=>{const result=await readFile(location.file,revision.rev,signal);signal?.throwIfAborted();if(result.status!=='ok')throw new Error('Source evidence is unavailable at this revision.');const lines=result.content.split('\n');const item=sourceEvidence({repo,...location,...revision,lines,startLine:location.line,endLine:Math.min(lines.length,location.line+7)});if(!item)throw new Error('The selected evidence range is unavailable at this revision.');return item;}));
 signal?.throwIfAborted();return evidence;
}
