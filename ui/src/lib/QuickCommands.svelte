<script>
 import { createActor } from 'xstate';
 import { onDestroy, tick } from 'svelte';
 import { quickCommands, COMMANDS_EVENT, CLOSE_FINDERS_EVENT, FIND_FILE_EVENT, FIND_PR_EVENT } from './quickCommands.svelte.js';
 import { quickCommandMachine, matchingCommands } from './quickCommandMachine.js';
 import { PAGE_NAVIGATION } from './navigationShortcuts.js';
 import { isPromptDialogOpen } from './dom.js';
 import { isRecordingShortcut } from './shortcutCapture.js';
 let dialog, previousFocus;
 let input=$state(null);
 const actor=createActor(quickCommandMachine).start();
 let snapshot=$state(actor.getSnapshot());
 const subscription=actor.subscribe(next=>snapshot=next);
 onDestroy(()=>{subscription.unsubscribe();actor.stop();});
 let commands=$derived([...quickCommands.review,...PAGE_NAVIGATION.map(page=>({id:page.id,title:page.title,keywords:page.keywords,run:()=>location.hash=page.href}))]);
 $effect(()=>actor.send({type:'COMMANDS',commands:commands.map(({run,...command})=>command)}));
 let results=$derived(matchingCommands(snapshot.context.commands,snapshot.context.query));
 let selected=$derived(results[snapshot.context.selected]);
 function close(){actor.send({type:'CLOSE'});}
 function open(query=''){window.dispatchEvent(new Event(CLOSE_FINDERS_EVENT));if(!actor.getSnapshot().matches('open'))previousFocus=document.activeElement;actor.send({type:'OPEN',query});}
 function mountDialog(node){dialog=node;node.showModal();tick().then(()=>input?.focus());return{destroy(){node.close();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}};}
 function outsideClick(event){if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}
 function run(index=snapshot.context.selected){const item=results[index];const current=commands.find(command=>command.id===item?.id);if(!current || current.disabledReason)return;close();queueMicrotask(()=>current.run());}
 function switchFinder(event){close();queueMicrotask(()=>window.dispatchEvent(new Event(event)));}
 function keydown(event){
   const meta=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
   if(meta && !event.altKey && key==='p'){event.preventDefault();event.stopImmediatePropagation();if(event.shiftKey)actor.send({type:'OPEN',query:''});else switchFinder(FIND_FILE_EVENT);return;}
   if(meta && key==='k'){event.preventDefault();event.stopImmediatePropagation();switchFinder(FIND_PR_EVENT);return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();actor.send({type:'MOVE',delta:event.key==='ArrowDown'?1:-1});tick().then(()=>dialog?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'}));}
   else if(event.key==='Enter' && !event.isComposing){event.preventDefault();run();}
   else if(event.key==='Escape'){event.preventDefault();close();}
 }
 $effect(()=>{
   const requested=async event=>{const query=event.detail?.query ?? '';await tick();if(!isPromptDialogOpen() || snapshot.matches('open'))open(query);};
   const keys=event=>{if(event.defaultPrevented||isRecordingShortcut()||isPromptDialogOpen())return;if((event.metaKey||event.ctrlKey)&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopImmediatePropagation();open();}};
   window.addEventListener(COMMANDS_EVENT,requested);window.addEventListener('keydown',keys,true);window.addEventListener('hashchange',close);window.addEventListener('popstate',close);
   return()=>{window.removeEventListener(COMMANDS_EVENT,requested);window.removeEventListener('keydown',keys,true);window.removeEventListener('hashchange',close);window.removeEventListener('popstate',close);};
 });
</script>
{#if snapshot.matches('open')}
 <dialog use:mountDialog role="dialog" aria-label="Quick commands" data-prompt-dialog oncancel={event=>{event.preventDefault();close();}} onkeydown={keydown} onclick={outsideClick}>
  <div class="command-input"><span aria-hidden="true">&gt;</span><input bind:this={input} aria-label="Search commands" placeholder="Type a command…" value={snapshot.context.query} oninput={event=>actor.send({type:'QUERY',query:event.currentTarget.value})} role="combobox" aria-expanded="true" aria-controls="quick-command-results" aria-activedescendant={selected ? `quick-command-${selected.id}` : undefined} autocomplete="off"/><button onclick={close}>Esc</button></div>
  <nav aria-label="Quick switch modes">{#if quickCommands.review.length}<button onclick={()=>switchFinder(FIND_FILE_EVENT)}>Files <small>⌘P</small></button>{/if}<span>Commands <small>⌘⇧P</small></span><button onclick={()=>switchFinder(FIND_PR_EVENT)}>Pull requests <small>⌘K</small></button></nav>
  <div class="command-results" id="quick-command-results" role="listbox" aria-label="Commands">
   {#each results as command,index (command.id)}<button class="command-result" id={`quick-command-${command.id}`} role="option" aria-selected={snapshot.context.selected===index} aria-disabled={Boolean(command.disabledReason)} title={command.disabledReason || command.description || command.title} onpointermove={()=>actor.send({type:'SELECT',index})} onclick={()=>run(index)}><strong>{command.title}</strong><small>{command.disabledReason || command.description || 'Navigation'}</small></button>{:else}<p>No matching commands.</p>{/each}
  </div><footer>↑↓ select · Enter run · Escape close</footer>
 </dialog>
{/if}
<style>
 dialog{margin:14vh auto 0;padding:0;width:min(570px,calc(100vw - 28px));max-height:72vh;border:1px solid var(--border);border-radius:9px;background:var(--panel);color:var(--text);box-shadow:var(--shadow-dialog);font:13px var(--sans);}dialog::backdrop{background:var(--modal-scrim,#0007)}.command-input{display:flex;align-items:center;gap:12px;padding:15px;border-bottom:1px solid var(--border-soft);}.command-input input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:inherit;font:15px var(--sans);}.command-input button{background:transparent;border:1px solid var(--border-soft);border-radius:4px;color:var(--text-dim);font:10px var(--sans);padding:3px 5px;cursor:pointer;}nav{display:flex;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border-soft);align-items:center;}nav button,nav span{padding:5px 8px;border:0;border-radius:5px;background:transparent;color:var(--text-dim);font:11px var(--sans);}nav span{color:var(--text);background:var(--bg-hover);}nav button{cursor:pointer;}small{color:var(--text-dim);font-size:10px}.command-results{max-height:43vh;overflow:auto;padding:5px;}.command-result{display:block;width:100%;padding:11px;text-align:left;border:0;border-radius:5px;background:transparent;color:var(--text);font:12px var(--sans);cursor:pointer;}.command-result[aria-selected=true]{background:var(--link-bg);}.command-result[aria-disabled=true]{opacity:.55;cursor:default;}strong{display:block;font-weight:500;}.command-result small{display:block;margin-top:4px;}footer{border-top:1px solid var(--border-soft);padding:10px 15px;color:var(--text-dim);font-size:10px;}p{padding:15px;color:var(--text-dim);}button:focus-visible{outline:2px solid var(--link);outline-offset:-2px;}
</style>
