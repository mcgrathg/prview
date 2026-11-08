<script>
  import { onMount } from 'svelte';
  import { RELEASES,CURRENT_RELEASE,unseenReleases,readSeenRelease,acknowledgeRelease } from './releases.js';
  let { enabled = true } = $props();
  const titleId=$props.id();
  let mode=$state('closed'), seen=$state(0), ready=$state(false), storage;
  const updates=$derived(unseenReleases(seen));
  const visible=$derived(mode==='all' ? [...RELEASES].reverse() : updates);
  const date=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  onMount(()=>{
    try { storage=window.localStorage; } catch { storage=null; }
    seen=readSeenRelease(storage);ready=true;
  });
  $effect(()=>{if(ready && enabled && mode==='closed' && updates.length)mode='new';});
  export function showAll(){mode='all';}
  function dismiss(){acknowledgeRelease(storage);seen=Math.max(seen,CURRENT_RELEASE.version);mode='closed';}
  function handleKey(event){
    event.stopPropagation();
    if(event.key!=='Tab')return;
    const buttons=[...event.currentTarget.querySelectorAll('button')];
    const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
  function openDialog(node){
    const previous=document.activeElement;
    node.showModal();
    node.querySelector('[data-primary]')?.focus({preventScroll:true});
    return {destroy(){if(node.open)node.close();if(previous?.isConnected)previous.focus({preventScroll:true});}};
  }
</script>
{#if mode!=='closed'}
<dialog use:openDialog role="dialog" data-prompt-dialog aria-labelledby={titleId} oncancel={event=>{event.preventDefault();dismiss();}} onkeydown={handleKey}>
  <header><div><h2 id={titleId}>{mode==='new' ? 'What’s new in prview' : 'Changelog'}</h2><p>prview v{CURRENT_RELEASE.version}{mode==='new' && seen>0 ? ` · Updates since v${seen}` : ''}</p></div><button class="close" aria-label="Close changelog" onclick={dismiss}>×</button></header>
  <div class="release-list">{#each visible as release}<article><div class="release-meta"><span>v{release.version}</span><time datetime={release.date}>{date(release.date)}</time></div><h3>{release.title}</h3>{#if release.summary}<p>{release.summary}</p>{/if}<ul>{#each release.changes as change}<li><strong>{change.title}</strong><p>{change.body}</p></li>{/each}</ul></article>{/each}</div>
  <footer>{#if mode==='new'}<button class="history" onclick={()=>mode='all'}>View full changelog</button>{:else}<span>Release history · newest first</span>{/if}<button class="primary" data-primary onclick={dismiss}>Got it</button></footer>
</dialog>
{/if}
<style>
  dialog{width:min(580px,calc(100vw - 32px));max-height:calc(100dvh - 48px);margin:auto;padding:0;display:flex;flex-direction:column;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-dialog);font:13px/1.5 var(--sans,system-ui);}
  dialog::backdrop{background:#0009;backdrop-filter:blur(3px);}header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;}header{border-bottom:1px solid var(--border);}h2{font-size:21px;line-height:1.25;margin:0;}header p{margin:5px 0 0;color:var(--text-dim);}button{cursor:pointer;border:1px solid var(--border);border-radius:7px;padding:7px 12px;color:var(--text);background:var(--surface);}button:focus-visible{outline:2px solid var(--link);outline-offset:3px;}.close{padding:0 7px;font-size:24px;border:0;background:transparent;color:var(--text-dim);}.release-list{overflow:auto;min-height:0;padding:0 22px;}article{padding:20px 0;}article+article{border-top:1px solid var(--border);}.release-meta{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-dim);}.release-meta span{padding:2px 7px;border-radius:5px;background:var(--link-bg);color:var(--link);font-weight:600;}h3{font-size:17px;margin:10px 0 6px;}article>p{color:var(--text-dim);margin:0 0 16px;}ul{padding-left:18px;margin:0;}li+li{margin-top:13px;}li p{margin:3px 0 0;color:var(--text-dim);}strong{font-weight:600;}footer{border-top:1px solid var(--border);}footer span{font-size:11px;color:var(--text-dim);}.history{border:0;background:transparent;color:var(--link);padding-left:0;}.primary{background:var(--link);border-color:var(--link);color:var(--on-brand);font-weight:600;}
</style>
