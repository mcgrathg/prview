<script>
  import { tick, onMount } from 'svelte';
  import WorkspaceSource from './WorkspaceSource.svelte';
  const repo = 'storybookjs/storybook';
  const headRef = 'kasper/csf-core-consumers';
  const path = 'code/core/src/csf-tools/estree/ast.ts';
  const head = '59c927082239afee5a702036c62c8b61c192c865';
  const base = '3df9f38353b4c6add739cdf7640abbaeca54c595';
  let revision = $state(head), host, editor, controller;
  let loading = $state(false), error = $state(''), ready = $state(false), samples = $state([]), info = $state(null), outline = $state([]), hover = $state('');
  let baselineRows = $state(0), baselineMs = $state(null), analysisMs = $state(null);
  let baselineObserver;
  onMount(() => {
    const start = performance.now();
    baselineObserver = new MutationObserver(() => { const rows = document.querySelectorAll('.source-row').length; if (rows && baselineMs === null) { baselineRows = rows; baselineMs = performance.now() - start; } });
    baselineObserver.observe(document.querySelector('.baseline'), { childList: true, subtree: true });
    return () => { baselineObserver.disconnect(); controller?.abort(); editor?.dispose(); };
  });
  async function start(next = revision) {
    controller?.abort(); controller = new AbortController(); const signal = controller.signal;
    const before = editor?.dispose(); editor = null; ready = false; loading = true; error = ''; outline = []; hover = ''; revision = next;
    const started = performance.now();
    try {
      const [module, response] = await Promise.all([import('./monacoReadonlySpike.js'), fetch(`/api/repo-file?${new URLSearchParams({ repo, sha: next, headRef, path })}`, { signal })]);
      const result = await response.json();
      if (!response.ok || result.status !== 'ok') throw new Error(result.error ?? `Source ${result.status}`);
      if (signal.aborted) return;
      await tick();
      editor = module.createReadonlyEditor(host, { repo, revision: next, path, content: result.content, line: 595 }, value => info = value);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (signal.aborted) return;
      info = editor.status(); ready = true;
      samples = [...samples, { revision: next.slice(0,8), readyMs: Math.round((performance.now()-started)*100)/100, bytes: new TextEncoder().encode(result.content).length, disposedBefore: before?.models ?? null }];
    } catch (e) { if (!signal.aborted) error = e.message; }
    finally { if (!signal.aborted) loading = false; }
  }
  async function getOutline() { try { const start = performance.now(); const tree = await editor.outline(); analysisMs = Math.round((performance.now() - start)*100)/100; outline = tree?.childItems?.map(node => node.text) ?? []; } catch(e) { error = e.message; } }
  async function getHover() { try { const data = await editor.hover(); hover = data?.displayParts?.map(part => part.text).join('') ?? 'No signature at current cursor'; } catch(e) { error = e.message; } }
  function dispose() { controller?.abort(); info = editor?.dispose(); editor = null; ready = false; }
</script>
<main>
  <h1>Read-only source evaluation</h1>
  <p>Isolated Svelte spike · immutable Storybook source · native PR diff and review controls are untouched</p>
  <div class="toolbar"><button disabled={loading} onclick={() => start()}>Load / recreate Monaco</button><button disabled={loading} onclick={() => start(revision === head ? base : head)}>Switch pinned revision</button><button disabled={!ready} onclick={getOutline}>Read outline</button><button disabled={!ready} onclick={getHover}>Signature at cursor</button><button disabled={!ready} onclick={() => editor.symbols()}>Go to symbol</button><button disabled={!ready} onclick={() => editor.find()}>Find</button><button disabled={!ready} onclick={dispose}>Dispose editor and model</button></div>
  {#if loading}<p role="status">Loading editor and pinned source…</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
  <div class="comparison"><section><h2>Current source viewer</h2><small>{baselineRows} rows · first rows {baselineMs?.toFixed(2) ?? '…'} ms</small><div class="workspace-scroll baseline"><WorkspaceSource {repo} {headRef} pane={{ file:path,rev:revision,side:'right',line:595 }} /></div></section><section><h2>Monaco · {revision.slice(0,8)}</h2><small>Read-only; built-in analysis sees loaded models, not the whole repository</small><div class="editor" bind:this={host}></div></section></div>
  <div class="evidence"><section><h2>Readiness samples</h2><pre>{JSON.stringify(samples,null,2)}</pre><h2>Selection/model status</h2><pre aria-label="Model status">{JSON.stringify(info,null,2)}</pre><p>{hover}</p></section><section><h2>Outline ({outline.length}) · analysis {analysisMs ?? '…'} ms</h2><div class="outline">{#each outline as name}<span>{name}</span>{/each}</div></section></div>
</main>
<style>
  :global(body) { overflow:auto; } main { padding:20px; color:var(--text); font:13px system-ui; } h1 {font-size:20px;} p,small {color:var(--muted);} h2 {font-size:14px;margin:10px 0;} .toolbar {display:flex;gap:8px;flex-wrap:wrap;} button {border:1px solid var(--border);border-radius:5px;background:var(--panel);color:var(--text);padding:7px 10px;} button:disabled{opacity:.4;} .comparison,.evidence {display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;}.workspace-scroll,.editor {height:440px;overflow:auto;border:1px solid var(--border);margin-top:8px;}.editor{overflow:hidden;} .outline{display:flex;flex-wrap:wrap;gap:8px;} pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;}
</style>
