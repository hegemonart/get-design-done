<div align="center">

# GET DESIGN DONE

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · **Italiano** · [Deutsch](README.de.md)

**Una pipeline di qualità del design per agenti di coding IA: brief → esplorazione → piano → implementazione → verifica.**

**Get Design Done mantiene l'UI generata dall'IA allineata al tuo brief, al tuo design system, ai tuoi riferimenti e ai tuoi quality gate. Funziona con Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy e Cline.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @hegemonart/get-design-done@latest
```

**Funziona su macOS, Linux e Windows.**

<br>

*«Gli agenti di coding IA rilasciano UI in fretta. Get Design Done si assicura che rilascino design.»*

<br>

[Perché l'ho costruito](#perché-lho-costruito) · [Come funziona](#come-funziona) · [Comandi](#comandi) · [Connessioni](#connessioni) · [Perché funziona](#perché-funziona)

</div>

---

> [!IMPORTANT]
> ### Hai già un bundle Claude Design?
>
> Se hai esportato un design da [claude.ai/design](https://claude.ai/design), puoi saltare interamente le fasi 1–3:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> Analizza le proprietà CSS personalizzate del bundle in decisioni di design D-XX, esegue il pass di verifica con scoring Handoff Faithfulness e opzionalmente scrive lo stato di implementazione su Figma.

---

## Perché l'ho costruito

Sono un designer che rilascia con agenti di coding IA. Il workflow lato codice è maturo: specifiche, task, test, commit, cicli di review. Quello lato design non lo era.

Quello in cui mi sono imbattuto continuamente: l'agente poteva generare una schermata che sembrava buona da sola, ma il lavoro era *scollegato*. I token non corrispondevano al sistema esistente. I rapporti di contrasto scendevano sotto WCAG. La gerarchia veniva reinventata per ogni schermata. Vecchi anti-pattern finivano in nuovi componenti. E poiché nulla verificava l'output rispetto al brief originale, i problemi emergevano tardi, in PR review o dopo l'handoff.

Così ho costruito Get Design Done: una pipeline di design che dà agli agenti di coding IA la stessa struttura che gli sviluppatori si aspettano già dai workflow di engineering. Cattura il brief, mappa il design system corrente, ancora le decisioni ai riferimenti, scompone il lavoro in task atomici, esegue quei task e verifica il risultato prima del rilascio.

Dietro le quinte: 37 agenti specializzati, un intel store interrogabile, routing dei modelli per tier, 12 connessioni opzionali, commit atomici e un layer adattivo no-regret che impara dagli esiti solidify-with-rollback. Nell'uso quotidiano vedi pochi comandi `/gdd:*` che mantengono coerente il lavoro di design.

— **Hegemon**

---

Il design generato dall'IA ha la stessa modalità di fallimento del codice generato dall'IA: descrivi cosa vuoi, ottieni qualcosa di plausibile, poi crolla a scala perché nessun sistema lega l'output al brief.

Get Design Done è il layer di context engineering per il lavoro di design. Trasforma "migliora questa UI" in un ciclo tracciabile: brief → inventario → riferimenti → piano → implementazione → verifica.

---

## Cosa ottieni

- **Lavoro di design ancorato al brief** — ogni ciclo parte da problema, pubblico, vincoli, metriche di successo e must-have.
- **Estrazione del design system** — GDD inventaria token, tipografia, spaziature, componenti, motion, accessibilità, dark mode e debito di design prima di pianificare modifiche.
- **Decisioni supportate da riferimenti** — gli agenti usano riferimenti di design integrati e connessioni opzionali a Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic e Magic Patterns.
- **Esecuzione atomica** — i task di design sono scomposti per dipendenza, eseguiti in wave sicure e committati indipendentemente.
- **Verifica prima del rilascio** — gli audit controllano aderenza al brief, integrazione dei token, contrasto WCAG, conformità dei componenti, coerenza della motion, architettura dark-mode e anti-pattern di design.
- **Rollback su validazione fallita** — solidify-with-rollback valida ogni task prima che resti; il lavoro fallito viene revertito automaticamente.

---

## A chi è rivolto

GDD è per ingegneri, designer, design engineer, founder e product builder che rilasciano UI con agenti di coding IA e vogliono che il risultato regga oltre il primo screenshot.

Usalo quando ti importa che i token coincidano, che il contrasto passi WCAG, che la motion resti coerente, che i componenti seguano il tuo sistema e che l'implementazione finale corrisponda ancora alla richiesta.

Non devi essere un designer. La pipeline porta disciplina di design dentro il workflow degli agenti: estrae contesto, chiede solo le decisioni mancanti, ancora il lavoro ai riferimenti e intercetta i problemi che di solito emergono troppo tardi.

## Sponsorizzato da

<div align="center">

<a href="https://www.humbleteam.com/" aria-label="Humbleteam">
  <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam" width="360">
</a>

</div>

### Highlights v1.24.0 — Installer multi-runtime

- **Multi-select interattivo `@clack/prompts`** — `npx @hegemonart/get-design-done` senza flag apre ora una UI di checkbox curata per i 14 runtime supportati (Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline) più una radio Global / Local.
- **Idempotente + safe per AGENTS.md esterni** — rieseguire l'installer non duplica mai voci e non sovrascrive le istruzioni specifiche del runtime che hai aggiunto. Step di conferma prima di qualsiasi scrittura.
- **Superficie CI scriptata preservata** — ogni flag esistente (`--claude`, `--cursor`, `--all`, `--global`, `--local`, `--uninstall`, `--config-dir`) continua a funzionare invariato. La modalità interattiva si attiva solo quando non viene passato alcun flag di runtime.
- **Disinstallazione multi-select** — `--uninstall` senza flag di runtime entra anch'esso in multi-select interattivo per scegliere da quali runtime rimuovere.

### Release precedenti

- **v1.23.5** — Layer adattivo No-Regret (bandit Thompson sampling + ensemble AdaNormalHedge + reranking MMR; utilizzabile single-user via bootstrap con prior informato, senza telemetria condivisa opt-in).
- **v1.23.0** — Primitive di dominio SDK (gate solidify-with-rollback, contratti di output JSON, auto-cristallizzazione di pattern `Touches:`).
- **v1.22.0** — Osservabilità SDK (~24 tipi di evento tipizzati, trajectory per tool-call, chain di eventi append-only, scrubber dei segreti).
- **v1.21.0** — SDK headless (CLI `gdd-sdk` esegue la pipeline completa senza Claude Code, researcher paralleli, MCP cross-harness).
- **v1.20.0** — Fondamenta SDK (primitive di resilienza, `STATE.md` lockfile-safe, server MCP `gdd-state` con 11 tool tipizzati, fondamenta TypeScript).

Note di rilascio complete in [CHANGELOG.md](CHANGELOG.md).

---

## Per iniziare

```bash
npx @hegemonart/get-design-done@latest
```

L'installer ti chiede di scegliere:
1. **Runtime** — Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline o tutti (multi-select interattivo)
2. **Posizione** — Global (tutti i progetti) o Local (solo progetto corrente)

Verifica con:

```
/gdd:help
```

> [!TIP]
> Lancia Claude Code con `--dangerously-skip-permissions` per un'esperienza automatizzata senza attriti. GDD è progettato per esecuzione autonoma multi-stage.

### Restare aggiornati

GDD rilascia spesso. Aggiorna rieseguendo l'installer (idempotente):

```bash
npx @hegemonart/get-design-done@latest
```

O da Claude Code:

```
/gdd:update
```

`/gdd:update` mostra un'anteprima del changelog prima di applicare. Le modifiche locali sotto `reference/` sono preservate — se un update strutturale richiede ri-stitching, esegui `/gdd:reapply-patches`.

<details>
<summary><strong>Installazione non interattiva (Docker, CI, script)</strong></summary>

```bash
npx @hegemonart/get-design-done --claude --global
npx @hegemonart/get-design-done --claude --local
npx @hegemonart/get-design-done --opencode --global
npx @hegemonart/get-design-done --gemini --global
npx @hegemonart/get-design-done --kilo --global
npx @hegemonart/get-design-done --codex --global
npx @hegemonart/get-design-done --copilot --global
npx @hegemonart/get-design-done --cursor --global
npx @hegemonart/get-design-done --windsurf --global
npx @hegemonart/get-design-done --antigravity --global
npx @hegemonart/get-design-done --augment --global
npx @hegemonart/get-design-done --trae --global
npx @hegemonart/get-design-done --qwen --global
npx @hegemonart/get-design-done --codebuddy --global
npx @hegemonart/get-design-done --cline --global

# Tutti i runtime
npx @hegemonart/get-design-done --all --global

# Dry run
npx @hegemonart/get-design-done --dry-run

# Directory di config personalizzata
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>Alternativa: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

</details>

---

## Come funziona

> **Parti da un codebase esistente?** Esegui prima `/gdd:map`. Dispatcha 5 mapper specialisti in parallelo (tokens, components, visual hierarchy, a11y, motion) e scrive JSON strutturato in `.design/map/`.

### 1. Brief

```
/gdd:brief
```

Cattura il problema di design prima di qualsiasi scan o esplorazione. Lo skill intervista via `AskUserQuestion`, una domanda alla volta — solo per le sezioni senza risposta: problema, audience, vincoli, metriche di successo, scope.

**Crea:** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

Inventaria il design system del codebase corrente — colori, tipografia, spaziatura, componenti, motion, a11y, dark-mode. Cinque mapper paralleli + intervista `design-discussant` producono tre artefatti. Le sonde di connessione rilevano la disponibilità di 12 strumenti esterni.

**Crea:** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan

```
/gdd:plan
```

Scompone l'output di Explore in task atomici, coordinati per onde, con analisi delle dipendenze. Ogni task porta percorsi `Touches:` espliciti, tag di sicurezza parallela e criteri di accettazione. `design-planner` (opus) redige; `design-plan-checker` (haiku) gate-checka prima dell'esecuzione.

**Crea:** `.design/DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

Esegue i task in ordine di onda. Ogni task ottiene un agente `design-executor` dedicato con un nuovo contesto da 200k, commit git atomico e gestione automatica delle deviazioni secondo regole in-context. I task parallel-safe girano in worktree.

**Solidify-with-rollback** (v1.23.0) — ogni task valida (typecheck + build + test mirato) prima di consolidarsi. Validazione fallita → revert via `git stash`.

**Crea:** un `.design/tasks/task-NN.md` per task, un commit git atomico per task

```
┌────────────────────────────────────────────────────────────────────┐
│  ESECUZIONE A ONDE                                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallelo)         WAVE 2 (parallelo)        WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              I percorsi Touches: guidano l'analisi delle dipendenze│
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify

```
/gdd:verify
```

Verifica rispetto al brief — must-have, euristiche NN/g, rubrica di audit, integrazione di token. Tre agenti girano in sequenza: `design-auditor` (score 6 pilastri 1–4), `design-verifier` (goal-backward), `design-integration-checker` (greppa le decisioni D-XX nel codice). Ai fallimenti produce una lista di gap strutturata e entra in un loop verify→fix via `design-fixer`.

**Crea:** `.design/DESIGN-VERIFICATION.md`, commit di fix se trovati problemi

---

### 6. Ship → Reflect → Ciclo successivo

```
/gdd:ship                    # Genera un branch PR pulito (filtra commit .design/)
/gdd:reflect                 # design-reflector legge telemetria + apprendimenti
/gdd:apply-reflections       # Rivedi e applica selettivamente le proposte
/gdd:complete-cycle          # Archivia gli artefatti del ciclo + scrive EXPERIENCE.md
/gdd:new-cycle               # Apre un nuovo ciclo di design
```

O auto-routing:

```
/gdd:next                    # Auto-rileva lo stato e lancia il prossimo step
```

Ogni ciclo ottiene brief, scan, plan, esecuzione, verifica e un `EXPERIENCE.md` di ciclo (~100–200 righe: Goal / Decisioni / Apprendimenti graduati / Cosa è morto / Handoff al ciclo successivo) che diventa la fonte a priorità più alta per l'hook decision-injector.

---

### Modalità Fast

```
/gdd:fast "<task>"
```

Per fix banali su singolo file che non hanno bisogno della pipeline completa. Salta router, cache-manager e telemetria. Stesse garanzie di commit atomico.

```
/gdd:quick
```

Per task ad-hoc che hanno bisogno delle garanzie GDD ma saltano i gate opzionali (no phase-researcher, no assumptions analyzer, no integration-checker). Più veloce della pipeline completa; più sicuro di `/gdd:fast`.

---

## Perché funziona

### Context engineering

Le CLI di coding IA sono potenti **se** le nutri di contesto. La maggior parte delle persone non lo fa.

GDD lo gestisce per te:

| File | A cosa serve |
|------|--------------|
| `.design/BRIEF.md` | Problema, audience, metriche di successo del ciclo |
| `.design/DESIGN.md` | Snapshot del design system attuale (token, componenti, gerarchia) |
| `.design/DESIGN-CONTEXT.md` | Decisioni D-XX, risposte d'intervista, vincoli a monte/valle |
| `.design/DESIGN-PLAN.md` | Task atomici, coreografia di onde, dipendenze |
| `.design/DESIGN-VERIFICATION.md` | Risultato di verifica, lista gap, score Handoff Faithfulness |
| `.design/intel/` | Knowledge layer interrogabile |
| `.design/archive/cycle-N/EXPERIENCE.md` | Retrospettiva di ciclo, memoria tra cicli |
| `.design/telemetry/events.jsonl` | Stream eventi tipizzato tra fasi |
| `.design/telemetry/posterior.json` | Posterior del bandit (quando `adaptive_mode != static`) |

Limiti di dimensione dove la qualità di Claude degrada. Resta sotto, ottieni coerenza.

### 37 agenti specializzati

Ogni fase è un orchestratore leggero che spawna agenti specializzati.

| Fase | Orchestratore | Agenti |
|------|---------------|--------|
| Brief | intervista a una domanda | (no sub-agenti) |
| Explore | spawna 5 mapper + discussant | 5 mapper paralleli, design-discussant, research-synthesizer |
| Plan | spawna researcher + planner + checker | design-phase-researcher (opzionale), design-planner (opus), design-plan-checker (haiku) |
| Design | coordinazione di onde + isolamento worktree | design-executor per task, design-fixer al fallimento solidify |
| Verify | spawna auditor + verifier + checker | design-auditor, design-verifier, design-integration-checker |
| Reflect | legge telemetria + apprendimenti | design-reflector (opus), design-authority-watcher, design-update-checker |

### 12 connessioni di strumenti

Tutte opzionali — la pipeline degrada in modo grazioso quando una connessione non è disponibile:

- **Figma** (lettura + scrittura + Code Connect)
- **Refero** — ricerca riferimenti di design
- **Pinterest** — ancoraggio di riferimenti visuali
- **Claude Design** — import di bundle di handoff
- **Storybook** — lookup di specifiche di componenti
- **Chromatic** — diff di baseline di regressione visuale
- **Preview** — screenshot runtime Playwright + Claude Preview MCP
- **paper.design** — lettura/scrittura canvas MCP
- **pencil.dev** — file di specifica `.pen` tracciati da git
- **Graphify** — export di knowledge graph
- **21st.dev Magic** — ricerca di precedenti prima di build greenfield
- **Magic Patterns** — generazione di componenti DS-aware

### Riferimenti di design integrati

Il plugin spedisce **18+ file di riferimento** — NN/g 10, design emozionale di Don Norman, 10 principi di Dieter Rams, 12 principi di Disney (motion), lente di authoring di componenti Sonner / Emil Kowalski, Peak-End, Loss Aversion, Cognitive Load, Aesthetic-Usability, Doherty, Flow, 35 specifiche di componenti, gestalt, gerarchia visuale, brand voice, 161 palette per industria, 67 estetiche UI, 12 easing motion, 8 famiglie di transizione, WCAG 2.1 AA, piattaforme (iOS/Android/web/visionOS/watchOS), RTL/CJK, pattern di form, catalogo anti-pattern.

### Commit git atomici

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

git bisect trova il task fallito esatto. Ogni task è revertabile indipendentemente. Solidify-with-rollback aggiunge un gate di validazione a livello task, quindi un task 3 rotto non corrompe i task 4–10 prima che giri verify.

### Loop di auto-miglioramento

Dopo ogni ciclo, `design-reflector` (opus) legge `events.jsonl`, `agent-metrics.json`, `learnings/` e propone diff — override di tier, regole di parallelizzazione, aggiunte di reference, aggiornamenti di frontmatter. `/gdd:apply-reflections` mostra il diff e chiede prima di applicare.

Il **layer adattivo No-Regret** (v1.23.5) sovrappone un bandit Thompson sampling + ensemble AdaNormalHedge + reranking MMR, utilizzabile single-user via bootstrap con prior informato.

### Governance dei costi

- **Skill `gdd-router`** — routing deterministico intent → fast / quick / full, senza chiamate al modello.
- **`gdd-cache-manager`** — cache esplicita Layer-B, hash di input SHA-256, awareness TTL 5 minuti.
- **Hook PreToolUse `budget-enforcer`** — applica override di tier, cap duri, gate di spawn lazy da `.design/budget.json`.
- **Telemetria di costo per spawn** — le righe `.design/telemetry/costs.jsonl` alimentano i suggerimenti rule-based di `/gdd:optimize`.

Punta a riduzione 50–70% del costo per task senza regressione di qualità.

---

## Comandi

### Pipeline principale

| Comando | Cosa fa |
|---------|---------|
| `/gdd:brief` | Fase 1 — cattura il brief di design |
| `/gdd:explore` | Fase 2 — inventario codebase + intervista |
| `/gdd:plan` | Fase 3 — produce DESIGN-PLAN.md |
| `/gdd:design` | Fase 4 — esegue per onde |
| `/gdd:verify` | Fase 5 — verifica rispetto al brief |
| `/gdd:ship` | Genera un branch PR pulito |
| `/gdd:next` | Auto-routing alla prossima fase secondo STATE.md |
| `/gdd:do <text>` | Router in linguaggio naturale |
| `/gdd:fast <text>` | Fix banale one-shot, senza pipeline |
| `/gdd:quick` | Task ad-hoc con garanzie GDD ma gate opzionali saltati |

### Primo lancio + onboarding

| Comando | Cosa fa |
|---------|---------|
| `/gdd:start` | Percorso prova primo-lancio — top 3 problemi di design nel repo |
| `/gdd:new-project` | Inizializza un progetto GDD |
| `/gdd:connections` | Wizard di onboarding per le 12 integrazioni esterne |

### Ciclo di vita

| Comando | Cosa fa |
|---------|---------|
| `/gdd:new-cycle` | Nuovo ciclo di design |
| `/gdd:complete-cycle` | Archivia artefatti del ciclo + EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | Checkpoint numerati |
| `/gdd:continue` | Alias per `/gdd:resume` |
| `/gdd:timeline` | Retrospettiva narrativa tra cicli + git log |

### Iterazione + decisioni

| Comando | Cosa fa |
|---------|---------|
| `/gdd:discuss [topic]` | Intervista di design adattiva |
| `/gdd:list-assumptions` | Far emergere assunzioni nascoste prima del piano |
| `/gdd:sketch [idea]` | Mockup HTML multi-variante |
| `/gdd:spike [idea]` | Esperimento di fattibilità timeboxed |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | Impacchettare i findings in skill locale |
| `/gdd:audit` | Wrapper verify + audit + reflector |
| `/gdd:reflect` | Lancia il reflector on-demand |
| `/gdd:apply-reflections` | Rivedi e applica selettivamente le proposte |

### Memoria + knowledge layer

| Comando | Cosa fa |
|---------|---------|
| `/gdd:recall <query>` | Ricerca FTS5 |
| `/gdd:extract-learnings` | Estrai pattern/decisioni/lezioni |
| `/gdd:note <text>` | Cattura idee senza attriti |
| `/gdd:plant-seed <idea>` | Idea forward-looking con condizione di trigger |
| `/gdd:analyze-dependencies` | Token fan-out, call-graph, tracciabilità delle decisioni |
| `/gdd:skill-manifest` | Lista tutti gli skill e agenti GDD |
| `/gdd:graphify` | Costruisci/interroga/diff il knowledge graph |
| `/gdd:watch-authorities` | Diff della whitelist dei feed di autorità |

### Connessioni

| Comando | Cosa fa |
|---------|---------|
| `/gdd:figma-write` | Riscrive le decisioni di design su Figma |
| `/gdd:handoff <bundle>` | Importa un bundle Claude Design |
| `/gdd:darkmode` | Audita l'implementazione dark-mode |
| `/gdd:compare` | Calcola il delta DESIGN.md vs DESIGN-VERIFICATION.md |
| `/gdd:style <Component>` | Genera doc di handoff di componente |

### Diagnostica + forensica

| Comando | Cosa fa |
|---------|---------|
| `/gdd:scan` | Inventario design system del codebase |
| `/gdd:map` | 5 mapper paralleli del codebase |
| `/gdd:debug [desc]` | Indagine di design symptom-driven |
| `/gdd:health` | Report di salute degli artefatti `.design/` |
| `/gdd:progress` | Posizione nella pipeline |
| `/gdd:stats` | Statistiche di ciclo |
| `/gdd:optimize` | Analisi costi rule-based |
| `/gdd:warm-cache` | Pre-riscalda la cache Anthropic |

### Distribuzione + update

| Comando | Cosa fa |
|---------|---------|
| `/gdd:update` | Aggiorna GDD con preview del changelog |
| `/gdd:reapply-patches` | Ri-stitch delle modifiche locali `reference/` |
| `/gdd:check-update` | Check manuale degli update |
| `/gdd:settings` | Configura `.design/config.json` |
| `/gdd:set-profile <profile>` | Cambia profilo del modello |
| `/gdd:undo` | Revert sicuro di cambiamento di design |
| `/gdd:pr-branch` | Branch PR pulito |

### Backlog + note

| Comando | Cosa fa |
|---------|---------|
| `/gdd:todo` | Aggiungi / lista / scegli task di design |
| `/gdd:add-backlog <idea>` | Parcheggia idea per ciclo futuro |
| `/gdd:review-backlog` | Rivedi gli elementi parcheggiati |

### Aiuto

| Comando | Cosa fa |
|---------|---------|
| `/gdd:help` | Lista completa dei comandi e uso |
| `/gdd:bandit-reset` | Resetta il posterior del layer adattivo al rilascio di un nuovo modello Anthropic |

---

## Connessioni

GDD spedisce 12 connessioni di strumenti. Tutte opzionali. Configurate con `/gdd:connections`.

| Connessione | Scopo | Sonda |
|-------------|-------|-------|
| **Figma** | Leggi token, componenti, screenshot; scrivi annotazioni, Code Connect, stato di implementazione | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | Ricerca riferimenti di design | `mcp__refero__search` |
| **Pinterest** | Riferimento visuale per brand voice + stile | OAuth + MCP |
| **Claude Design** | Import di bundle di handoff | URL o file locale |
| **Storybook** | Lookup specifiche di componenti su porta 6006 | Sonda HTTP |
| **Chromatic** | Diff di baseline di regressione visuale | API key |
| **Preview** | Screenshot runtime Playwright + Claude Preview MCP | `mcp__Claude_Preview__preview_*` |
| **paper.design** | Lettura/scrittura canvas MCP | `mcp__paper__use_paper` |
| **pencil.dev** | Specifiche `.pen` tracciate da git | File `.pen` nel repo |
| **Graphify** | Export di knowledge graph | `mcp__graphify__*` |
| **21st.dev Magic** | Ricerca di precedenti prima di greenfield | `mcp__magic__search` |
| **Magic Patterns** | Generazione di componenti DS-aware | `mcp__magic-patterns__generate` |

Dettagli completi in [`connections/connections.md`](connections/connections.md).

---

## Configurazione

GDD memorizza le impostazioni di progetto in `.design/config.json`. Configura durante `/gdd:new-project` o aggiorna con `/gdd:settings`.

### Profili di modello

| Profilo | Planning | Esecuzione | Verifica |
|---------|----------|------------|----------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

```
/gdd:set-profile budget
```

### Modalità adattiva

Scala `.design/budget.json#adaptive_mode` (v1.23.5):

| Modalità | Cosa fa |
|----------|---------|
| `static` (default) | Comportamento Phase 10.1 |
| `hedge` | Ensemble AdaNormalHedge + reranking MMR attivati. Introduzione più sicura. |
| `full` | Bandit router + Hedge + MMR tutti attivi |

### Parallelismo

| Impostazione | Default | Cosa controlla |
|--------------|---------|----------------|
| `parallelism.enabled` | `true` | Eseguire task indipendenti in worktree |
| `parallelism.min_estimated_savings_seconds` | `30` | Sotto questa soglia salta la parallelizzazione |
| `parallelism.max_concurrent_workers` | `4` | Cap duro su worker simultanei |

### Quality gate

| Impostazione | Default | Cosa controlla |
|--------------|---------|----------------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` |
| `solidify.commands` | autodetect | Override comandi typecheck / build / test |
| `verify.iterations_max` | `3` | Cap del loop verify→fix |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` |

---

## Sicurezza

### Hardening integrato

GDD spedisce defense-in-depth dalla Phase 14.5:

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash blocca circa 50 pattern pericolosi dopo normalizzazione Unicode NFKC + ANSI.
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash impone la lista glob `protected_paths`.
- **`hooks/gdd-read-injection-scanner.ts`** — scansiona il contenuto Read in ingresso per Unicode invisibile, commenti HTML, pattern di esfiltrazione di segreti.
- **`scripts/lib/blast-radius.cjs`** — preflight di `design-executor` rifiuta task sopra `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** — interrompe loop di timeout consecutivi su `use_figma` / `use_paper` / `use_pencil`.

### Proteggere file sensibili

Aggiungi i percorsi sensibili alla deny list del runtime:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

> [!IMPORTANT]
> Poiché GDD genera file markdown che diventano prompt di sistema LLM, qualsiasi testo controllato dall'utente che fluisce negli artefatti `.design/` è un potenziale vettore di prompt injection indiretta. Lo scanner di injection cattura tali vettori a più livelli — ma il defense-in-depth resta best practice.

---

## Risoluzione problemi

**Comandi non trovati dopo l'installazione?**
- Riavvia il runtime
- Verifica `~/.claude/skills/get-design-done/` (globale) o `./.claude/skills/get-design-done/` (locale)
- `/gdd:help` per confermare la registrazione

**Pipeline bloccata a metà fase?**
- `/gdd:resume` — ripristina dal checkpoint numerato più recente
- `/gdd:health` — diagnostica problemi di artefatti `.design/`
- `/gdd:progress --forensic` — audit di integrità a 6 check

**Sforamento di costi?**
- `/gdd:optimize` — raccomandazioni rule-based
- `/gdd:set-profile budget` — passa a tier budget
- Imposta `adaptive_mode: "full"` in `.design/budget.json` — il bandit imparerà

**Aggiornamento all'ultima versione?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / container?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Disinstallazione

```bash
# Disinstallazione globale (per runtime)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... stesso pattern --<runtime> --global --uninstall per i 14 runtime

# Disinstallazione interattiva multi-select (senza flag di runtime)
npx @hegemonart/get-design-done --uninstall

# Disinstallazione locale
npx @hegemonart/get-design-done --claude --local --uninstall
# ... con flag --local
```

Rimuove tutti i comandi, agenti, hook e impostazioni GDD preservando le altre configurazioni.

---

## Licenza

Licenza MIT. Vedi [LICENSE](LICENSE) per i dettagli.

---

<div align="center">

**Claude Code rilascia codice. Get Design Done si assicura che rilasci anche design.**

</div>
