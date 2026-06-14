# GDD Sync — Figma plugin

`GDD Sync` is the Figma-side half of GDD's design-system extractor (Path C). It reads
your file's **local Figma variables** from inside Figma and POSTs them as JSON to a
GDD extract receiver listening on `localhost:5179`.

## Why this exists

GDD's extractor pulls a design system from the Figma REST API into a compact local
digest. The Variables REST API, however, is **Enterprise-only** — it returns `403` on
Free/Pro/Org plans. A Figma plugin has full `figma.variables` access on **any** plan, so
this plugin fills that gap: it reads what the API cannot and ships it to GDD locally.

## Security

The plugin can talk to **localhost only**. `manifest.json` declares
`networkAccess.allowedDomains` as exactly:

```json
["http://localhost:5179", "http://127.0.0.1:5179"]
```

No wildcard, no external host. This is the single hard security boundary of Path C
(decision D-06): the plugin has no exfiltration surface — it can reach the local GDD
receiver and nothing else.

## Development

This is a standalone TypeScript package (decision D-05). It is **not** part of the root
`hone` package.

### Build

```bash
cd figma-plugin
npm install
npm run build   # runs tsc → emits code.js next to code.ts
```

`code.ts` (sandbox entry) and `src/*.ts` compile under `tsconfig.json` against
`@figma/plugin-typings` into `code.js`, which `manifest.json` references via `main`.

### Dev-install (Figma desktop)

1. Build (`npm run build`) so `code.js` exists.
2. In the **Figma desktop app**: **Plugins → Development → Import plugin from manifest…**
3. Select `figma-plugin/manifest.json`.

### Usage

1. Start a GDD extract run so the receiver is listening on `localhost:5179`.
2. Open the Figma file whose variables you want to export.
3. Run **GDD Sync** (Plugins → Development → GDD Sync).
4. Click **Export to GDD**. The plugin reads the file's local variables and POSTs them
   to the receiver, which writes them into the extract cache.

## Distribution

Community submission is **deferred** (decision D-07). For v1.31.0 the supported path is
**dev-install** via the manifest, as documented above. Publishing to the Figma Community
is a follow-up that will not block the version cut.
