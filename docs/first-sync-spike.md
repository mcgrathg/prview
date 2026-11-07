# First-PR mirror scope spike

A revision-pinned, blob-filtered fetch served both Storybook benchmark diffs with complete inventories and exact source bytes after downloading 5.87 MB and 2.85 MB, respectively. These are measured Git-operation results from 2026-11-07, not application load times. The prototype supports a smaller initial diff cache; it cannot replace every capability of the full mirror unchanged.

The strongest counterexample is real: depth 32 gives the correct #36948 diff but only 38 of its 40 PR commits. Repository search also has separate readiness: thousands of head blobs remain absent after the diff is ready.

## Scope and evidence

This spike targets `prv-e09` against downstream checkpoint `17b820f4c9bab649bed9353809c5818ce502ac43`. Production source, package files, UI, Beads and the live mirror were left unchanged. Every generated repository and experiment artifact is under `.scratch/mirror-scope-spike/`. Public repository contents were read as Git objects; fixture repository code was never executed.

The full-mirror oracle is `../.working/cockpit-live-data/mirrors/storybookjs__storybook`. It held 1,775,416,212 logical object bytes; `du -sk` reported 1,813,488 KiB allocated for the entire bare repository. Its original cold-clone duration and transferred bytes were unavailable. A second full clone would repeat the large download without recovering that historical measurement, so none was run. No full-clone speedup ratio is claimed.

Final measurements live in `.scratch/mirror-scope-spike/results-v3.json`, with exact commands, elapsed times, exit codes, object sizes and output filenames for each step. `local/results-v3.json` records the rewrite fixture. `spike.py`, `tunnel.py`, `local_fixture.py`, `verify_supplement.py`, `verify_ranges.py` and `history_probe.py` reproduce the investigation. Earlier `results.json` and `results-v2.json` are exploratory records, excluded from the final table: their HTTP trace counters did not measure response bodies. An ordinary explicit blob-ID fetch also failed its connectivity check; the final run uses Git's successful promisor lazy fetch instead.

## Public PR results

| Pinned input | Storybook #36948 | Storybook #36212 |
| --- | --- | --- |
| Base | `3df9f38353b4c6add739cdf7640abbaeca54c595` | `689357da10260f9620d5871b3c155f0de091e923` |
| Head | `59c927082239afee5a702036c62c8b61c192c865` | `301d93ce7db832ba8e424db332203e2382dfa2e1` |
| Depth 1 merge-base lookup | Exit 1; unavailable | Exit 1; unavailable |
| First successful depth | 32 | 32 |
| Graph ready, cumulative seconds | 2.2666 | 1.6262 |
| Complete diff ready, cumulative seconds | 3.2037 | 2.5416 |
| Source parity verification complete, cumulative seconds | 4.0831 | 3.5175 |
| Downloaded TLS bytes through verification | 5,868,571 | 2,853,092 |
| Logical object bytes retained through verification | 7,261,708 | 3,553,309 |
| Compressed pack bytes retained | 6,052,048 | 3,011,861 |
| Rename-aware changed-file entries | 38 | 113 |
| No-renames changed-path entries | 39 | 113 |
| Unique changed blobs compared byte for byte | 71 | 104 |
| Head blobs still missing after diff/source verification | 8,045 | 7,075 |
| PR commits available at depth 32 / full mirror | 38 / 40 | 7 / 7 |

Each column is one final sample with an empty local object database, on Apple Git 2.50.1. The host and upstream caches had been exercised during earlier trials. These samples establish feasibility, not a latency distribution. Elapsed time starts before scratch initialization; polling at 50 ms and oracle checks add overhead. Source verification time includes the comparison work itself. Neither GitHub PR-detail loading, HTTP retries, the browser nor rendering is included.

`tunnel.py` forwards HTTPS through a localhost CONNECT tunnel to `github.com:443` and counts server-to-client TLS bytes. TLS remains end to end, with normal certificate checks. Counts include TLS handshakes and encrypted Git HTTP traffic; they exclude DNS, TCP/IP headers and retransmissions. This is a measured transfer counter, distinct from compressed pack sizes: Git may expand a thin pack using existing local objects. Both GitHub reads were anonymous, with credential helpers and global/system Git configuration disabled.

The phase downloads were 369,530 then 5,206,854 bytes for #36948's depth 1 and depth 32 fetches, followed by 286,438 bytes during diff hydration. The corresponding #36212 phases were 332,307, 2,044,693 and 470,368 bytes. The remaining transfer loaded `package.json` at the pinned source revisions.

## What matched the full mirror

Both public merge bases exactly equal the supplied base SHA. `git diff --raw -z --no-renames --abbrev=40` inventories match the oracle byte for byte, including every old/new object ID and path. The rename-aware `--name-status -z` inventories also match. #36948's single rename explains 39 raw paths versus 38 file entries; no file was discarded to obtain the smaller count.

Both two-dot and three-dot patches match byte for byte with `--full-index`. The production-style default `git diff` output differs only in abbreviated object IDs on `index` lines: Git chooses shorter abbreviations in the smaller object database. Removing only those abbreviations gives exact patch parity. Any future requirement for identical serialized patches should choose an explicit index format in both backends.

For each PR, the prototype reads every unique old/new changed blob through `git cat-file --batch` and compares the complete bytes with the full mirror. It additionally compares `package.json` at both exact pinned base/head SHAs. Source verification uses commit/object IDs rather than moving branch names.

Canonical three-dot patch SHA-256 values are:

- #36948: `a6c67a13b699c5e71f928d7feb4bd44cb49efcb398234546c1a70ec0fc4249ea`.
- #36212: `8d540a3531d6bad265d13bda24775ad94f21f2f8580d25282d693b825094beb1`.

## Rewritten branches and search hydration

The local fixture builds a diverged base and feature branch, then moves the feature ref twice. Its first depth 1 fetch has both commit objects but no merge base. Depth 32 finds the full repository's common ancestor and reproduces the complete patch, including a binary change, deletion and 100% rename.

After the first rewrite, a distinct local pin preserves the old head. Reading that SHA still returns `old pinned head`; reading the new SHA returns `rewritten current head`. The base-only file appears in the two-dot comparison and remains absent from the three-dot comparison. Canonical two-dot patches for the original, rewritten and unrelated heads all match the full fixture repository. Three-dot patches for the original and related rewritten heads also match.

The second rewrite introduces an unrelated root. With the small fixture's complete histories present, merge-base lookup correctly exits 1. Production must distinguish that result from a shallow graph that merely lacks enough history. This fixture proves local retention and range behavior, not GitHub retention of unreachable historical commits after a force push. A SHA never fetched before the rewrite may become unavailable upstream; fetching the moving PR ref cannot reconstruct it.

A no-match, whole-tree `git grep` on the related rewritten head hydrates all 24 remaining missing head blobs. Object storage grows from 10,968 to 40,358 bytes despite producing no matches. This directly demonstrates that a match-count limit cannot bound download work. Full-tree grep was deliberately not run against the public PR caches; their 8,045 and 7,075 missing head blobs remain measurable deferred work.

## Unavailable history has a measurable cost

At depth 32, `git log --reverse --topo-order --format=%H base..head` omits these #36948 commits:

- `200a89735c37b156869e5dff0a8ee68eeaf9dfdd`.
- `d6afdbe53a352a89dc1346a4a7f61f1977fc26c2`.

The #36212 commit list already matches all seven oracle commits. A separate copy of the #36948 bootstrap cache was fetched to depth 128. That additional fetch took 17.9488 seconds, downloaded 57,297,300 TLS bytes and grew logical object storage to 78,231,645 bytes. It restored exact 40-commit list parity. These costs are additional to the initial diff bootstrap and are excluded from its table.

A depth cap can therefore bound initial work while leaving blame, commit timelines/stats, ancestors beyond the fetched boundary, tags, other branches and other PRs unavailable. Finding a merge base alone does not prove those histories complete. For more complex graphs, production must also avoid treating a shallow merge-base candidate as an authoritative complete-history result. The public diff assertions here rely on direct oracle comparison; they do not prove a universal shallow-history algorithm.

## Readiness and the next implementation

The existing `server/mirror.ts` cold path performs a bare clone and then fetches all heads and all PR-head refs. `server/http.ts` returns `503` with `building: true` and `Retry-After: 5` when the mirror is absent; incremental callers wait at most 15 seconds while the underlying fetch continues. `server/repoSearch.ts` uses commit presence as its local-readiness check. Those contracts assume the full mirror. No HTTP behavior was changed or timed in this spike.

The next implementation should be an opt-in, separately identified PR bootstrap cache, preserving the full mirror as the existing fallback. Fetch pinned base/head commits and their trees with `blob:none`; increase depth only within an explicit work budget. Retain distinct pins across head changes. Hydrate the complete diff and requested source paths before reporting those capabilities ready. Keep the exact input SHAs and comparison mode in cache keys.

Report capabilities independently:

| Capability | Evidence required | Incomplete outcome |
| --- | --- | --- |
| Diff/inventory | Pinned commits, a trustworthy merge base for three-dot, complete changed-path inventory and required blobs | Loading, retryable failure or history budget exhausted |
| Requested source | Exact commit/tree/path and successfully loaded blob | Loading or fetch failure; missing promised data is not file absence |
| Repository search | Explicitly chosen tree scope and required blobs, or controlled hydration progress | Search data loading, with cancellation and byte/work limits |
| Commit history | Verified complete relevant ancestry | Partial history; never silently return it as complete |

Use phases and measured downloaded bytes for progress rather than a guessed percentage. Distinguish network/credential failures, history budget exhaustion, unrelated histories and unavailable historical SHAs. Preserve process cancellation and operation locking; Git lazy fetch can run inside commands previously treated as local reads. Production authentication must reach those internal promisor fetches without depending on an ambient credential helper. Existing definitive `not-found` classifications need review because a promised blob can fail to download.

This spike justifies implementing the diff bootstrap behind an opt-in flag, followed by contract tests for shallow ancestry, rewritten pins, rename/binary/deletion inventory, source-fetch failures and explicit search/history readiness. It does not justify replacing the full-mirror backend or reporting the entire repository ready after the first diff.

## Reproduce and limits

From the Cockpit root, use a fresh child directory for each run:

```sh
MIRROR_SPIKE_OUTPUT="$PWD/.scratch/mirror-scope-spike/repeat-1" \
  python3 .scratch/mirror-scope-spike/spike.py
MIRROR_SPIKE_OUTPUT="$PWD/.scratch/mirror-scope-spike/repeat-1" \
  python3 .scratch/mirror-scope-spike/verify_supplement.py
MIRROR_SPIKE_OUTPUT="$PWD/.scratch/mirror-scope-spike/repeat-1" \
  python3 .scratch/mirror-scope-spike/local_fixture.py
MIRROR_SPIKE_OUTPUT="$PWD/.scratch/mirror-scope-spike/repeat-1" \
  python3 .scratch/mirror-scope-spike/verify_ranges.py
```

The optional larger history experiment is `history_probe.py` with the same output setting. Scripts refuse to reuse a measured repository. They require Python 3, local Git, the existing oracle path and public GitHub connectivity. No downloaded package or fixture script is executed. The essential fetch is:

```sh
git --git-dir "$scratch_repo" fetch --no-tags --no-auto-maintenance \
  --filter=blob:none --depth=32 origin \
  "+$base_sha:refs/pins/base" "+$head_sha:refs/pins/head"
```

Configured limits are 90 seconds per Git command, a 20-second low-speed timeout below one byte/second, candidate depths 1/32/128 and a watchdog that terminates a scratch command after observed object storage exceeds 256 MiB. That object-size watchdog is a soft local-storage limit, not a hard network-byte ceiling. All reported runs completed without triggering it. Every command checkpoints output, so a failed public fetch still leaves evidence and the independent local fixture remains runnable.

Git documents [filtered objects and on-demand fetching](https://git-scm.com/docs/partial-clone), [depth and filter options](https://git-scm.com/docs/git-fetch), and [two-dot/three-dot comparisons and full-index output](https://git-scm.com/docs/git-diff). The byte counts, timings, parity checks and readiness limits above come from the isolated artifacts, not from those manuals.
