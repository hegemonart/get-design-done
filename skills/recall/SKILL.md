---
name: gdd-recall
description: "Search cross-cycle memory: decisions, learnings, experience archives. Returns ranked matches."
argument-hint: "<query> [--reindex]"
tools: Read, Write, Bash
---

@reference/retrieval-contract.md

# /gdd:recall

Searches `.design/archive/`, `.design/learnings/LEARNINGS.md`, `.design/CYCLES.md`, and `STATE.md` decision blocks for the given query and returns ranked matches. Uses FTS5 when `better-sqlite3` is available, ripgrep next, Node fs scan as universal fallback.

## Steps

1. **Parse argument**: extract `<query>` and optional `--reindex` flag.
   - If no query and no `--reindex`: print usage and exit.
   - If `--reindex` only: rebuild the index (see step 3), then exit.

2. **Check backend**: run
   ```bash
   node -e "const {backendName}=require('./scripts/lib/design-search.cjs');console.log(backendName())"
   ```
   Print a one-line notice: `Search backend: fts5 | ripgrep | node-grep`.

3. **Reindex if requested**: run
   ```bash
   node -e "require('./scripts/lib/design-search.cjs').reindex(process.cwd())"
   ```
   Print: "Index rebuilt."

4. **Search**: run
   ```bash
   node -e "
   const s=require('./scripts/lib/design-search.cjs');
   const r=s.search(process.argv[1], process.cwd(), {limit:20});
   console.log(JSON.stringify(r));
   " -- "<query>"
   ```
   Parse the JSON array of `{file, line, text}` objects.

5. **Format results**: print in this shape:
   ```
   ## Recall: "<query>"  (N matches, backend: fts5)

   ### 1. .design/archive/cycle-2/EXPERIENCE.md:42
   > Decided to skip dark-mode token layer in cycle 2 — cost–benefit did not clear threshold

   ### 2. .design/learnings/LEARNINGS.md:18
   > L-03 · color · cited:4 · Color contrast failures cluster around interactive states, not surfaces
   ```
   Group by file. Truncate text at 120 chars. Cap at 20 results.

6. **Signal relevance**: for every result whose text contains an `L-NN` learning ID, record a `surfaced` signal:
   ```bash
   node -e "
   const rc=require('./scripts/lib/relevance-counter.cjs');
   rc.record('L-NN','surfaced','.design');
   "
   ```

7. **Empty result**: if no matches, print:
   ```
   No matches for "<query>" in cross-cycle memory.
   Tip: run /gdd:recall --reindex if the archive has been updated since last index build.
   ```

## Do Not

- Do not modify any source file.
- Do not run git commands.
- Do not write `.design/STATE.md`.

## RECALL COMPLETE
