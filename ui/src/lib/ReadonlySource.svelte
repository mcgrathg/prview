<script>
  import {tick,untrack} from 'svelte';
  import {theme} from './theme.svelte.js';
  let {repo,revision,base,headRef,path,content,line=1,onInspect,onDefinition,onReferences,onSemantic,onNavigate,onCommand,onFallback}=$props();
  let container=$state(null),instance=$state.raw(null),error=$state(''),analysis=$state(null),readyMs=$state(null);
  let generation=0;
  $effect(()=>{
    const source={repo,revision,base,headRef,path,content};const target=container;if(!target)return;
    const current=++generation,started=performance.now();let active,disposed=false;
    error='';readyMs=null;analysis=null;
    void import('./monacoReadonly.js').then(async module=>{
      await tick();if(disposed || current!==generation)return;
      active=untrack(()=>module.createReadonlySource(target,{...source,line,onInspect,onDefinition,onReferences,onSemantic,onNavigate,onCommand,onAnalysis:value=>{if(!disposed)analysis=value;}}));
      active.setTheme(theme.name);instance=active;readyMs=performance.now()-started;
    }).catch(failure=>{if(!disposed)error=failure.message ?? 'Editor unavailable.';});
    return()=>{disposed=true;if(instance===active)instance=null;active?.dispose();};
  });
  $effect(()=>{const at=line;if(instance && at)instance.setLine(at);});
  $effect(()=>{instance?.setTheme(theme.name);});
  export function captureEvidence(){return instance?.captureEvidence() ?? null;}
  export function focus(){instance?.focus();}
</script>
<div class="readonly-source" data-editor-ready={readyMs!==null} data-editor-ms={readyMs} data-editor-uri={instance?.status().uri} data-editor-readonly={instance?.status().readOnly}>
  <div class="editor-surface" bind:this={container}></div>
  {#if readyMs===null && !error}<div class="loading-source"><small>Loading editor…</small><pre>{content.split('\n').slice(0,120).join('\n')}</pre></div>{/if}
  {#if error}<div class="editor-error" role="alert">{error}<button onclick={onFallback}>Use text viewer</button></div>{/if}
  {#if analysis?.status==='error' || analysis?.status==='unavailable' || analysis?.status==='unsupported'}<small class="analysis-note" title={analysis.reason}>{analysis.reason || 'Source analysis is unavailable.'}</small>{:else}<small class="analysis-note" title={analysis?.coverage?.reasons?.join(' ') || 'Analysis uses pinned repository source. Dependency packages are not installed.'}>{analysis?.status==='loading' ? 'Analyzing source…' : analysis?.coverage?.limited || analysis?.limited ? 'Partial source analysis' : 'Source analysis'}</small>{/if}
</div>
<style>
  .readonly-source{position:relative;flex:1;min-height:0;height:100%;min-width:0;overflow:hidden;}.editor-surface{height:100%;width:100%;}.loading-source{position:absolute;inset:0;overflow:auto;background:var(--bg);pointer-events:none;}pre{font:12px/1.7 monospace;margin:20px 8px;white-space:pre;}small{font:10px/1.4 system-ui;color:var(--text-dim);}.loading-source small{position:absolute;top:2px;left:8px;}.analysis-note{position:absolute;right:18px;bottom:1px;max-width:85%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--panel);padding:1px 4px;pointer-events:auto;}.editor-error{position:absolute;inset:0;background:var(--panel);padding:15px;font:12px system-ui;}.editor-error button{display:block;margin-top:10px;}
</style>
