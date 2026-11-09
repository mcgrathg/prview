<script>
 import {tick} from 'svelte';
 import {editorRoots,loadEditorRoot,saveEditorRoot,vscodeFileHref} from './vscodeLinks.js';
 let {repo,path,line=1,column=1}=$props();
 let configuredLink,dialog,folderInput,folder=$state(''),error=$state(''),configOpen=$state(false),returnFocus;
 const titleId=$props.id();
 $effect(()=>{loadEditorRoot(repo);});
 const root=$derived($editorRoots.get(repo) ?? '');
 const href=$derived(vscodeFileHref(root,path,line,column));
 export function open(){if(href)configuredLink?.click();else void configure();}
 async function configure(){returnFocus=document.activeElement;folder=root;error='';configOpen=true;dialog.showModal();await tick();folderInput?.focus();}
 function close(){configOpen=false;dialog.close();returnFocus?.isConnected && returnFocus.focus({preventScroll:true});}
 function save(event){event.preventDefault();try{saveEditorRoot(repo,folder);close();}catch(failure){error=failure.message;}}
 function dismiss(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}}
</script>
<span class="vscode-control">
 {#if href}<a bind:this={configuredLink} {href} title={`Open local checkout in VS Code · ${path}:${line}. Local code may differ from this PR.`} aria-label={`Open ${path} in VS Code`}>VS Code ↗</a><button class="configure" aria-label={`Change VS Code checkout folder for ${repo}`} title="Change local checkout folder" onclick={configure}>⋯</button>
 {:else}<button title="Set a local checkout folder to open this file in VS Code" aria-label={`Open ${path} in VS Code`} onclick={configure}>VS Code ↗</button>{/if}
</span>
<dialog bind:this={dialog} aria-labelledby={titleId} role="dialog" data-prompt-dialog={configOpen ? '' : undefined} onkeydown={dismiss} oncancel={event=>{event.preventDefault();close();}}>
 <form onsubmit={save}><h2 id={titleId}>Open in VS Code</h2><p>Local checkout folder for <strong>{repo}</strong></p><label>Folder<input bind:this={folderInput} bind:value={folder} placeholder="/Users/you/code/project" autocomplete="off" spellcheck="false" /></label><small>Remembered in this browser. Opens local working-tree files; code and line numbers may differ from this PR.</small>{#if error}<p role="alert">{error}</p>{/if}<footer><button type="button" onclick={close}>Close</button><button type="submit">Use folder</button></footer></form>
</dialog>
<style>
 .vscode-control{display:inline-flex;align-items:center;white-space:nowrap;font:10px/1.5 system-ui;color:var(--text-dim);}.vscode-control a,.vscode-control button{color:inherit;background:transparent;border:0;padding:3px 4px;font:inherit;text-decoration:none;cursor:pointer;}.vscode-control a:hover,.vscode-control button:hover{color:var(--text);background:var(--bg-hover);border-radius:4px;}.configure{opacity:.55;}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--link);outline-offset:1px;}
 dialog{color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:8px;width:min(360px,calc(100vw - 40px));padding:18px;box-shadow:var(--shadow-dialog);font:12px/1.5 system-ui;}dialog::backdrop{background:#0008;}h2{font-size:16px;margin:0 0 10px;}p{margin:10px 0;overflow-wrap:anywhere;}label{display:block;}input{display:block;box-sizing:border-box;width:100%;margin:5px 0 9px;padding:7px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font:12px monospace;}small{color:var(--text-dim);font-size:11px;}footer{display:flex;justify-content:flex-end;gap:6px;margin-top:14px;}footer button{padding:5px 9px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;}
</style>
