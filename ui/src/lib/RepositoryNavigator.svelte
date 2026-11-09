<script>
 import {createActor} from 'xstate';
 import {untrack} from 'svelte';
 import {reviewLookupMachine} from './reviewLookupMachine.js';
 import {createSearchContextLoader,searchResultCommand} from './searchResults.js';
 import SearchMatch from './SearchMatch.svelte';
 let {repo,headRef,browser,research,changedPaths=[],onSet,onFilter,onClose,onInspect,onOpen,onBeside,onRetry,onExplore,onSave}= $props();
 let queryInput,root;
 const changed=$derived(new Set(changedPaths));
 const result=$derived(research?.context.result);
 const request=$derived(research?.context.request);
 const matchingEntries=$derived((result?.entries ?? []).filter(entry=>(browser.scope==='all' || (browser.scope==='changed')===changed.has(entry.path)) && (!browser.filter || `${entry.path} ${entry.line} ${entry.text} ${entry.reason ?? ""} ${entry.category ?? ""}`.toLowerCase().includes(browser.filter.toLowerCase()))));
 const entries=$derived(matchingEntries.slice(0,200));
 const groups=$derived.by(()=>{const map=new Map();for(const entry of entries){const key=browser.kind==='neighborhood' ? entry.category : browser.kind==='files' ? entry.path.split('/').slice(0,-1).join('/') || 'Repository root' : entry.path;if(!map.has(key))map.set(key,[]);map.get(key).push(entry);}return [...map];});
 const semantic=$derived(['references','type','implementation'].includes(browser.kind));
 const label=$derived(({files:'Repository files',text:'Repository text',symbols:'File symbols',references:'Semantic references',type:'Type definitions',implementation:'Implementations',neighborhood:'Patterns / neighborhood'})[browser.kind]);
 export function focus(){queryInput?.focus();queryInput?.select();}
 const entryKey=entry=>JSON.stringify([entry.path,entry.line]);
 let selectedKey=$state(null);
 const selected=$derived(entries.find(entry=>entryKey(entry)===selectedKey) ?? entries[0]);
 const contextActor=createActor(reviewLookupMachine,{input:{lookup:createSearchContextLoader()}}).start();
 let context=$state(contextActor.getSnapshot());
 const contextSubscription=contextActor.subscribe(next=>context=next);
 $effect(()=>()=>{contextSubscription.unsubscribe();contextActor.stop();});
 const contextKey=$derived(JSON.stringify([repo,headRef,request,selected?.path,selected?.line,browser.kind]));
 $effect(()=>{contextKey;untrack(()=>{
  if(browser.kind==='text' && request && selected)contextActor.send({type:'QUERY',request:{repo,headRef,rev:request.rev,...selected}});
  else contextActor.send({type:'CANCEL'});
 });});
 function keydown(event){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.isComposing || event.target.closest('select'))return;
  const input=Boolean(event.target.closest('input'));
  const button=event.target.closest('[data-result]');
  if(!input && !button)return;
  if(['ArrowDown','ArrowUp'].includes(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey){
   const buttons=[...root.querySelectorAll('[data-result]')];if(!buttons.length)return;
   const index=buttons.indexOf(button);event.preventDefault();event.stopPropagation();
   const next=index<0 ? event.key==='ArrowDown' ? 0 : buttons.length-1 : (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
   buttons[next].focus();return;
  }
  const action=searchResultCommand(event,input);if(!action || !selected || !request)return;
  event.preventDefault();event.stopPropagation();
  (action==='beside'?onBeside:action==='open'?onOpen:onInspect)(selected,request);
 }

</script>
<aside bind:this={root} class="repository-navigator" aria-label="Repository browser" data-code-overlay onkeydown={keydown}>
 <header><strong>{label}</strong><button aria-label="Close repository browser" onclick={onClose}>×</button></header>
 <nav aria-label="Repository search modes">{#each ['files','text','symbols','neighborhood'] as kind}<button aria-pressed={browser.kind===kind} onclick={()=>onSet({kind,query:'',filter:''},true)}>{({files:'Files',text:'Text',symbols:'Symbols',neighborhood:'Patterns'})[kind]}</button>{/each}</nav>
 {#if semantic}<p class="symbol">{browser.symbol}</p>{/if}
 <input bind:this={queryInput} type="search" aria-label={semantic?'Filter investigation results':label} placeholder={semantic?'Filter these results…':browser.kind==='text'?'Search repository (2+ characters)…':browser.kind==='symbols'?'Filter symbols in this file…':'Find any file…'} value={semantic?browser.filter:browser.query} oninput={event=>semantic ? onFilter(event.currentTarget.value,browser.scope) : onSet({query:event.currentTarget.value},false)} />
 <div class="filters"><select aria-label="Result scope" value={browser.scope} onchange={event=>onFilter(browser.filter,event.currentTarget.value)}><option value="all">All repository files</option><option value="changed">Changed in this PR</option><option value="other">Outside this PR</option></select>{#if !semantic}<input type="search" aria-label="Filter result paths" placeholder="Filter results…" value={browser.filter} oninput={event=>onFilter(event.currentTarget.value,browser.scope)} />{/if}</div>
 <small title={browser.origin.rev}>{browser.origin.rev.slice(0,8)}{browser.kind==='symbols' ? ` · ${browser.origin.file}` : ' · pinned repository'}{result?.coverage?.sourceOnly?' · Tracked source only':''}</small>
 {#if matchingEntries.length>200}<p class="notice">Showing 200 of {matchingEntries.length} matching results; refine the query or filters.</p>{/if}
 {#if result?.coverage?.limited}<p class="notice">Partial: {result.coverage.reasons?.join(' ')}</p>{/if}
 <div class="results">
 {#if research?.matches('loading') || research?.matches('retrying') || research?.matches('debouncing')}<p role="status">Searching…</p>
 {:else if research?.matches('error') || research?.matches('unavailable')}<p role="status">{research.context.error || result?.reason || result?.error || `Search unavailable (${result?.status ?? 'unknown'}).`} <button onclick={onRetry}>Retry</button></p>
 {:else if !entries.length}<p role="status">{browser.kind==='text' && browser.query.trim().length<2 ? 'Enter at least two characters to search.' : 'No matching results.'}</p>
 {:else}<p class="keyboard-hints">↑↓ select · Space preview · Enter open · ⌘/Ctrl+Enter beside</p><p class="count">{entries.length}{result?.total>entries.length?` of ${result.total}`:''} results · click to inspect</p>{#each groups as [path,items]}<details open><summary title={path}>{path}<span>{items.length}</span></summary>{#each items as entry}<div class="result"><button data-result data-path={entry.path} data-line={entry.line} class="inspect" class:selected={selected===entry} onfocus={()=>selectedKey=entryKey(entry)} title={`${entry.path}:${entry.line} · Inspect preview`} onclick={()=>onInspect(entry,request)}>{#if browser.kind!=='text'}<strong>{browser.kind==='files'?entry.text:browser.kind==='neighborhood'?`${entry.path}:${entry.line}`:`Line ${entry.line}`}{changed.has(entry.path)?' · changed':''}</strong>{/if}{#if browser.kind==='text'}<SearchMatch {entry} query={request?.query ?? ''} rows={selected===entry && context.matches('ready') && context.context.request?.path===entry.path && context.context.request?.line===entry.line && context.context.request?.rev===request?.rev ? context.context.result.entries : null} />{#if selected===entry && context.matches('loading')}<small>Loading surrounding code…</small>{/if}{:else if browser.kind!=='files'}<SearchMatch {entry} query={semantic ? browser.symbol : browser.query} />{/if}</button>{#if entry.reason}<p class="reason">{entry.reason}</p>{/if}<div class="actions"><button title="Open as working file" onclick={()=>onOpen(entry,request)}>Open</button><button title="Keep this result beside the working file · Cmd/Ctrl+Enter" onclick={()=>onBeside(entry,request)}>Beside</button>{#if browser.kind==='neighborhood'}<button onclick={()=>onExplore(entry,request)}>Explore</button><button onclick={()=>onSave(entry,request)}>Save evidence</button>{/if}</div></div>{/each}</details>{/each}{/if}
 </div>
</aside>
<style>
 .keyboard-hints{font-size:9px;color:var(--muted);}.inspect.selected{box-shadow:inset 2px 0 var(--link);}
 .repository-navigator{width:310px;min-width:240px;max-width:60vw;resize:horizontal;overflow:auto;display:flex;flex-direction:column;border-left:1px solid var(--border);background:var(--bg);font-size:11px;}header{display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border-bottom:1px solid var(--border);}button,input,select{color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:4px;padding:4px 6px;font:inherit;}button{cursor:pointer;}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--link);outline-offset:-2px;}nav{display:flex;gap:5px;padding:7px 9px;}nav button[aria-pressed=true]{border-color:var(--link);color:var(--link);}aside>input{margin:0 9px 6px;}.filters{display:flex;flex-wrap:wrap;gap:5px;padding:0 9px 6px;}.filters input{min-width:70px;width:100%;}small{color:var(--muted);padding:0 9px 6px;overflow-wrap:anywhere;}.notice{color:var(--warning,#e9b766);}.symbol{padding:0 9px 6px;font-family:monospace;}.results{overflow:auto;min-height:0;flex:1;}p{margin:0;padding:8px 9px;}summary{padding:7px 9px;cursor:pointer;overflow-wrap:anywhere;background:var(--panel);}summary span{float:right;color:var(--muted);margin-left:8px;}.result{border-bottom:1px solid var(--border);}.inspect{display:block;border:0;border-radius:0;text-align:left;width:100%;padding:7px 9px;background:transparent;}.inspect:hover{background:var(--hover);}strong{font-size:11px;}code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text-dim);margin-top:5px;font-size:10px;}.actions{display:flex;flex-wrap:wrap;gap:5px;padding:0 9px 6px;}.actions button{padding:2px 5px;font-size:10px;}.reason{padding:0 9px 6px;font-size:10px;color:var(--muted);}.count{color:var(--muted);font-size:10px;}
</style>
