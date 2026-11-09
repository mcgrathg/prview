<script>
 import {matchRuns,queryRanges} from './matchRuns.js';
 import {searchResultLines} from './searchResults.js';
 let {entry,query='',rows=null}=$props();
 const displayed=$derived(rows?.length ? rows : searchResultLines(entry));
</script>
<span class="search-excerpt" aria-label={`Code around line ${entry.line}`}>
 {#each displayed as row}<span class="excerpt-row" class:match={row.match}><span class="excerpt-line">{row.line}</span><code>{#each matchRuns([{content:row.text}],queryRanges(row.text,query)) as run}{#if run.hit}<mark>{run.content}</mark>{:else}{run.content}{/if}{/each}</code></span>{/each}
</span>
<style>
 .search-excerpt{display:block;min-width:0;font:10px/1.65 var(--font-mono,monospace);margin-top:4px;}.excerpt-row{display:flex;gap:7px;color:var(--muted);}.excerpt-row.match{color:var(--text);background:var(--hover,#ffffff08);}.excerpt-line{width:3.5ch;flex-shrink:0;text-align:right;user-select:none;opacity:.7;}code{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;}mark{color:var(--text);background:var(--search-match-bg,#9e6a0370);box-shadow:inset 0 -1px var(--link);border-radius:2px;font-weight:700;}
</style>
