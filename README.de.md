<div align="center">

# GET DESIGN DONE

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · **Deutsch**

**Eine Design-Quality-Pipeline für AI-Coding-Agenten: Brief → Explore → Plan → Implementierung → Verifikation.**

**Get Design Done hält AI-generierte UI an deinen Brief, dein Design-System, deine Referenzen und deine Quality Gates gebunden. Funktioniert mit Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy und Cline.**

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

**Funktioniert auf macOS, Linux und Windows.**

<br>

*„AI-Coding-Agenten liefern UI schnell. Get Design Done sorgt dafür, dass sie Design liefern."*

<br>

[Warum ich es gebaut habe](#warum-ich-es-gebaut-habe) · [Wie es funktioniert](#wie-es-funktioniert) · [Befehle](#befehle) · [Verbindungen](#verbindungen) · [Warum es funktioniert](#warum-es-funktioniert)

</div>

---

> [!IMPORTANT]
> ### Schon ein Claude-Design-Bundle?
>
> Wenn du ein Design aus [claude.ai/design](https://claude.ai/design) exportiert hast, kannst du die Stufen 1–3 vollständig überspringen:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> Parst die CSS-Custom-Properties des Bundles in D-XX-Designentscheidungen, führt den Verifikationslauf mit Handoff-Faithfulness-Scoring aus und schreibt optional den Implementierungsstatus zurück nach Figma.

---

## Warum ich es gebaut habe

Ich bin Designer und liefere mit AI-Coding-Agenten aus. Der Code-Workflow ist reif: Specs, Tasks, Tests, Commits, Review-Loops. Der Design-Workflow war es nicht.

Worauf ich immer wieder gestoßen bin: Der Agent konnte einen Screen erzeugen, der isoliert gut aussah, aber die Arbeit blieb *zusammenhanglos*. Tokens passten nicht zum bestehenden System. Kontrastverhältnisse rutschten unter WCAG. Hierarchie wurde pro Bildschirm neu erfunden. Alte Anti-Patterns landeten in neuen Komponenten. Und weil nichts den Output gegen den ursprünglichen Brief verifizierte, tauchten die Probleme spät auf: im PR-Review oder nach dem Handoff.

Also habe ich Get Design Done gebaut: eine Design-Pipeline, die AI-Coding-Agenten dieselbe Struktur gibt, die Entwickler aus Engineering-Workflows bereits erwarten. Sie erfasst den Brief, kartiert das aktuelle Design-System, verankert Entscheidungen in Referenzen, zerlegt Arbeit in atomare Tasks, führt diese Tasks aus und verifiziert das Ergebnis vor dem Shipping.

Hinter den Kulissen: 37 spezialisierte Agenten, ein abfragbarer Intel-Store, Tier-bewusstes Modell-Routing, 12 optionale Tool-Verbindungen, atomare Commits und eine No-Regret-Adaptiv-Schicht, die aus Solidify-with-Rollback-Ergebnissen lernt. Im Alltag nutzt du ein paar `/gdd:*`-Befehle, die Designarbeit kohärent halten.

— **Hegemon**

---

AI-generiertes Design hat denselben Fehlermodus wie AI-generierter Code: Du beschreibst, was du willst, bekommst etwas Plausibles, und bei Skalierung bricht es auseinander, weil kein System den Output zurück an den Brief bindet.

Get Design Done ist die Context-Engineering-Schicht für Designarbeit. Es verwandelt „mach diese UI besser" in einen nachvollziehbaren Zyklus: Brief → Inventar → Referenzen → Plan → Implementierung → Verifikation.

---

## Was du bekommst

- **Brief-gebundene Designarbeit** — jeder Zyklus beginnt mit Problem, Zielgruppe, Constraints, Erfolgskriterien und Must-haves.
- **Design-System-Extraktion** — GDD inventarisiert Tokens, Typografie, Spacing, Komponenten, Motion, Accessibility, Dark Mode und Design Debt, bevor Änderungen geplant werden.
- **Referenzgestützte Entscheidungen** — Agenten nutzen eingebettete Design-Referenzen plus optionale Verbindungen zu Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic und Magic Patterns.
- **Atomare Ausführung** — Design-Tasks werden nach Abhängigkeiten zerlegt, in sicheren Waves ausgeführt und unabhängig committet.
- **Verifikation vor dem Shipping** — Audits prüfen Brief-Fit, Token-Integration, WCAG-Kontrast, Komponenten-Konformität, Motion-Konsistenz, Dark-Mode-Architektur und Design-Anti-Patterns.
- **Rollback bei fehlgeschlagener Validierung** — solidify-with-rollback validiert jeden Task, bevor er bestehen bleibt; fehlgeschlagene Arbeit wird automatisch revertet.

---

## Für wen ist das

GDD ist für Engineers, Designer, Design Engineers, Founders und Product Builder, die UI mit AI-Coding-Agenten ausliefern und wollen, dass das Ergebnis über den ersten Screenshot hinaus trägt.

Nutze es, wenn dir wichtig ist, dass Tokens passen, Kontrast WCAG besteht, Motion kohärent bleibt, Komponenten deinem System folgen und die finale Implementierung noch immer deiner Anfrage entspricht.

Du musst kein Designer sein. Die Pipeline bringt Design-Disziplin in den Agenten-Workflow: Sie extrahiert Kontext, fragt nur nach fehlenden Entscheidungen, verankert Arbeit in Referenzen und fängt Probleme ab, die man sonst zu spät findet.

### v1.24.0 Highlights — Multi-Runtime-Installer

- **`@clack/prompts` interaktive Mehrfachauswahl** — `npx @hegemonart/get-design-done` ohne Flags öffnet jetzt eine polierte Checkbox-UI für alle 14 unterstützten Runtimes (Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline) plus ein Global-/Local-Radio.
- **Idempotent + sicher gegen fremde AGENTS.md** — den Installer erneut auszuführen dupliziert nie Einträge und überschreibt nie runtime-spezifische Anweisungsdateien, die du hinzugefügt hast. Bestätigungsschritt vor jedem Schreibvorgang.
- **Skriptfähige CI-Schnittstelle erhalten** — alle bestehenden Flags (`--claude`, `--cursor`, `--all`, `--global`, `--local`, `--uninstall`, `--config-dir`) funktionieren unverändert weiter. Der interaktive Modus aktiviert sich nur, wenn kein Runtime-Flag übergeben wurde.
- **Mehrfachauswahl-Deinstallation** — `--uninstall` ohne Runtime-Flag wechselt ebenfalls in die interaktive Mehrfachauswahl, um die Runtimes zu wählen, aus denen entfernt werden soll.

### Frühere Releases

- **v1.23.5** — No-Regret-Adaptiv-Schicht (Thompson-Sampling-Bandit + AdaNormalHedge-Ensemble + MMR-Reranking; single-user-tauglich durch Informed-Prior-Bootstrap, ohne Opt-in-Shared-Telemetrie).
- **v1.23.0** — SDK-Domain-Primitive (Solidify-with-Rollback-Gate, JSON-Output-Verträge, Auto-Kristallisation von `Touches:`-Mustern).
- **v1.22.0** — SDK-Observability (~24 typisierte Event-Typen, Per-Tool-Call-Trajectory, append-only Event-Chain, Secret-Scrubber).
- **v1.21.0** — Headless-SDK (`gdd-sdk`-CLI führt die volle Pipeline ohne Claude Code aus, parallele Researcher, Cross-Harness-MCP).
- **v1.20.0** — SDK-Foundation (Resilienz-Primitive, lockfile-sichere `STATE.md`, `gdd-state` MCP-Server mit 11 typisierten Tools, TypeScript-Foundation).

Vollständige Release-Notes in [CHANGELOG.md](CHANGELOG.md).

---

<p align="center">
  <sub>Supported by</sub><br>
  <a href="https://www.humbleteam.com/" aria-label="Humbleteam">
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam" width="180">
  </a>
</p>

---

## Erste Schritte

```bash
npx @hegemonart/get-design-done@latest
```

Der Installer fragt dich:
1. **Runtime** — Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline oder alle (interaktive Mehrfachauswahl)
2. **Speicherort** — Global (alle Projekte) oder Local (nur aktuelles Projekt)

Verifizieren mit:

```
/gdd:help
```

> [!TIP]
> Starte Claude Code mit `--dangerously-skip-permissions` für eine reibungslose Automatisierungserfahrung. GDD ist für autonome mehrstufige Ausführung konzipiert.

### Aktuell bleiben

GDD veröffentlicht häufig. Aktualisiere durch erneutes Ausführen des Installers (idempotent):

```bash
npx @hegemonart/get-design-done@latest
```

Oder in Claude Code:

```
/gdd:update
```

`/gdd:update` zeigt das Changelog vor dem Anwenden in einer Vorschau. Lokale Modifikationen unter `reference/` bleiben erhalten — wenn ein strukturelles Update ein Re-Stitching erfordert, führe `/gdd:reapply-patches` aus.

<details>
<summary><strong>Nicht-interaktive Installation (Docker, CI, Skripte)</strong></summary>

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

# Alle Runtimes
npx @hegemonart/get-design-done --all --global

# Dry-Run
npx @hegemonart/get-design-done --dry-run

# Eigenes Config-Verzeichnis
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>Alternative: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

</details>


## Wie es funktioniert

> **Du startest in einer bestehenden Codebase?** Führe zuerst `/gdd:map` aus. Es dispatcht 5 Spezial-Mapper parallel (Tokens, Components, Visual Hierarchy, A11y, Motion) und schreibt strukturiertes JSON nach `.design/map/`.

### 1. Brief

```
/gdd:brief
```

Erfasst das Designproblem vor jedem Scan oder jeder Exploration. Der Skill interviewt via `AskUserQuestion`, eine Frage nach der anderen — nur für unbeantwortete Abschnitte: Problem, Zielgruppe, Constraints, Erfolgsmetriken, Scope.

**Erstellt:** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

Inventarisiert das Design-System der aktuellen Codebase — Farben, Typografie, Abstände, Komponenten, Motion, A11y, Dark-Mode. Fünf parallele Mapper + ein `design-discussant`-Interview produzieren drei Artefakte. Verbindungs-Probes erkennen die Verfügbarkeit von 12 externen Tools.

**Erstellt:** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan

```
/gdd:plan
```

Zerlegt die Explore-Ausgabe in atomare, wave-koordinierte, dependency-analysierte Design-Tasks. Jeder Task trägt explizite `Touches:`-Pfade, Parallel-Safe-Tags und Akzeptanzkriterien. `design-planner` (opus) verfasst; `design-plan-checker` (haiku) gate-checkt vor der Ausführung.

**Erstellt:** `.design/DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

Führt Tasks in Wave-Reihenfolge aus. Jeder Task erhält einen dedizierten `design-executor`-Agent mit frischem 200k-Kontext, atomarem Git-Commit und automatischer Abweichungsbehandlung gemäß In-Context-Regeln. Parallel-sichere Tasks laufen in Worktrees.

**Solidify-with-Rollback** (v1.23.0) — jeder Task validiert (Typecheck + Build + gezielter Test) vor dem Fixieren. Validierung scheitert → Revert via `git stash`.

**Erstellt:** ein `.design/tasks/task-NN.md` pro Task, einen atomaren Git-Commit pro Task

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE-AUSFÜHRUNG                                                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallel)          WAVE 2 (parallel)         WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches:-Pfade steuern die Dependency-Analyse         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify

```
/gdd:verify
```

Verifiziert gegen den Brief — Must-Haves, NN/g-Heuristiken, Audit-Rubrik, Token-Integration. Drei Agenten laufen sequenziell: `design-auditor` (6-Säulen-Score 1–4), `design-verifier` (ziel-rückwärts), `design-integration-checker` (greppt D-XX-Entscheidungen zurück in den Code). Bei Fehlschlägen produziert er eine strukturierte Gap-Liste und tritt in eine Verify→Fix-Schleife via `design-fixer` ein.

**Erstellt:** `.design/DESIGN-VERIFICATION.md`, Fix-Commits bei Problemen

---

### 6. Ship → Reflect → Nächster Zyklus

```
/gdd:ship                    # Sauberen PR-Branch erzeugen (filtert .design/-Commits)
/gdd:reflect                 # design-reflector liest Telemetrie + Lernergebnisse
/gdd:apply-reflections       # Vorschläge prüfen und selektiv anwenden
/gdd:complete-cycle          # Zyklus-Artefakte archivieren + EXPERIENCE.md schreiben
/gdd:new-cycle               # Neuen Design-Zyklus eröffnen
```

Oder Auto-Routing:

```
/gdd:next                    # State automatisch erkennen und nächsten Schritt ausführen
```

Jeder Zyklus erhält Brief, Scan, Plan, Ausführung, Verifikation und ein zyklusspezifisches `EXPERIENCE.md` (~100–200 Zeilen: Ziel / getroffene Entscheidungen / Graduierte Lernergebnisse / Was gestorben ist / Übergabe an den nächsten Zyklus), das zur höchstpriorisierten Quelle für den Decision-Injector-Hook wird.

---

### Fast-Modus

```
/gdd:fast "<task>"
```

Für triviale Single-File-Fixes, die keine vollständige Pipeline brauchen. Überspringt Router, Cache-Manager und Telemetrie. Gleiche Atomic-Commit-Garantien.

```
/gdd:quick
```

Für Ad-hoc-Tasks, die GDD-Garantien brauchen, aber optionale Gates überspringen (kein Phase-Researcher, kein Assumptions-Analyzer, kein Integration-Checker). Schneller als die volle Pipeline; sicherer als `/gdd:fast`.

---

## Warum es funktioniert

### Context-Engineering

AI-Coding-CLIs sind mächtig, **wenn** du sie mit Kontext fütterst. Die meisten tun das nicht.

GDD erledigt das für dich:

| Datei | Zweck |
|-------|-------|
| `.design/BRIEF.md` | Problem, Zielgruppe, Erfolgsmetriken des Zyklus |
| `.design/DESIGN.md` | Aktuelle Design-System-Snapshot (Tokens, Komponenten, Hierarchie) |
| `.design/DESIGN-CONTEXT.md` | D-XX-Entscheidungen, Interview-Antworten, Upstream-/Downstream-Constraints |
| `.design/DESIGN-PLAN.md` | Atomare Tasks, Wave-Choreografie, Dependencies |
| `.design/DESIGN-VERIFICATION.md` | Verifikationsergebnis, Gap-Liste, Handoff-Faithfulness-Score |
| `.design/intel/` | Abfragbarer Knowledge-Layer |
| `.design/archive/cycle-N/EXPERIENCE.md` | Zyklus-Retrospektive, zyklusübergreifender Speicher |
| `.design/telemetry/events.jsonl` | Typisierter Event-Stream über Stufen hinweg |
| `.design/telemetry/posterior.json` | Bandit-Posterior (wenn `adaptive_mode != static`) |

Größenlimits dort, wo Claudes Qualität abfällt. Bleib darunter, hol dir Konsistenz.

### 37 spezialisierte Agenten

Jede Stufe ist ein leichtgewichtiger Orchestrator, der spezialisierte Agenten spawnt.

| Stufe | Orchestrator | Agenten |
|-------|--------------|---------|
| Brief | Eine-Frage-Interview | (keine Sub-Agenten) |
| Explore | spawnt 5 Mapper + Discussant | 5 parallele Mapper, design-discussant, research-synthesizer |
| Plan | spawnt Researcher + Planner + Checker | design-phase-researcher (optional), design-planner (opus), design-plan-checker (haiku) |
| Design | Wave-Koordination + Worktree-Isolation | design-executor pro Task, design-fixer bei Solidify-Fehlschlag |
| Verify | spawnt Auditor + Verifier + Checker | design-auditor, design-verifier, design-integration-checker |
| Reflect | liest Telemetrie + Lernergebnisse | design-reflector (opus), design-authority-watcher, design-update-checker |

### 12 Tool-Verbindungen

Alle optional — die Pipeline degradiert sauber, wenn eine Verbindung nicht verfügbar ist:

- **Figma** (Lesen + Schreiben + Code Connect)
- **Refero** — Design-Referenzsuche
- **Pinterest** — visuelle Referenzverankerung
- **Claude Design** — Handoff-Bundle-Import
- **Storybook** — Komponenten-Spezifikations-Lookup
- **Chromatic** — Visual-Regression-Baseline-Diff
- **Preview** — Playwright + Claude Preview MCP Runtime-Screenshots
- **paper.design** — MCP-Canvas-Read/Write
- **pencil.dev** — Git-getrackte `.pen`-Spec-Dateien
- **Graphify** — Knowledge-Graph-Export
- **21st.dev Magic** — Vorbild-Suche vor Greenfield-Builds
- **Magic Patterns** — DS-aware Komponenten-Generierung

### Eingebettete Design-Referenzen

Das Plugin liefert **18+ Referenzdateien** — NN/g 10, Don Normans emotionales Design, Dieter Rams' 10 Prinzipien, Disneys 12 (Motion), Sonner / Emil Kowalski Component-Authoring-Linse, Peak-End, Loss Aversion, Cognitive Load, Aesthetic-Usability, Doherty, Flow, 35 Komponenten-Spezifikationen, Gestalt, visuelle Hierarchie, Brand Voice, 161 Branchen-Paletten, 67 UI-Ästhetiken, 12 Motion-Easings, 8 Transition-Familien, WCAG 2.1 AA, Plattformen (iOS/Android/web/visionOS/watchOS), RTL/CJK, Form-Patterns, Anti-Pattern-Katalog.

### Atomare Git-Commits

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

Git-Bisect findet exakt den fehlgeschlagenen Task. Jeder Task ist unabhängig revertierbar. Solidify-with-Rollback fügt ein Validierungsgate auf Task-Ebene hinzu, sodass ein kaputter Task 3 die Tasks 4–10 nie korrumpiert, bevor Verify läuft.

### Selbstverbesserungs-Loop

Nach jedem Zyklus liest `design-reflector` (opus) `events.jsonl`, `agent-metrics.json`, `learnings/` und schlägt Diffs vor — Tier-Overrides, Parallelisierungsregeln, Referenz-Ergänzungen, Frontmatter-Updates. `/gdd:apply-reflections` zeigt das Diff und fragt vor dem Anwenden.

Die **No-Regret-Adaptiv-Schicht** (v1.23.5) legt darauf einen Thompson-Sampling-Bandit + AdaNormalHedge-Ensemble + MMR-Reranking, single-user-tauglich durch Informed-Prior-Bootstrap.

### Kosten-Governance

- **`gdd-router`-Skill** — deterministisches Intent → fast / quick / full Routing, ohne Modell-Aufruf.
- **`gdd-cache-manager`** — expliziter Layer-B-Cache, SHA-256-Input-Hash, 5-Min-TTL-Awareness.
- **`budget-enforcer` PreToolUse-Hook** — erzwingt Tier-Overrides, harte Caps und Lazy-Spawn-Gates aus `.design/budget.json`.
- **Spawn-genaue Kosten-Telemetrie** — `.design/telemetry/costs.jsonl`-Zeilen speisen die regelbasierten Empfehlungen von `/gdd:optimize`.

Zielt auf 50–70% Token-Kostenreduktion pro Task ohne Qualitätsregression.

---

## Befehle

### Kernpipeline

| Befehl | Was er tut |
|--------|------------|
| `/gdd:brief` | Stufe 1 — Design-Brief erfassen |
| `/gdd:explore` | Stufe 2 — Codebase-Inventar + Interview |
| `/gdd:plan` | Stufe 3 — DESIGN-PLAN.md erzeugen |
| `/gdd:design` | Stufe 4 — in Wellen ausführen |
| `/gdd:verify` | Stufe 5 — gegen den Brief verifizieren |
| `/gdd:ship` | Sauberen PR-Branch erzeugen |
| `/gdd:next` | Auto-Routing zur nächsten Stufe gemäß STATE.md |
| `/gdd:do <text>` | Natursprachlicher Router |
| `/gdd:fast <text>` | One-Shot-triviale Korrektur, ohne Pipeline |
| `/gdd:quick` | Ad-hoc-Task mit GDD-Garantien, aber übersprungenen optionalen Gates |

### Erstlauf + Onboarding

| Befehl | Was er tut |
|--------|------------|
| `/gdd:start` | Erstlauf-Beweispfad — Top-3-Designprobleme im Repo |
| `/gdd:new-project` | GDD-Projekt initialisieren |
| `/gdd:connections` | Onboarding-Wizard für die 12 externen Integrationen |

### Zyklus-Lifecycle

| Befehl | Was er tut |
|--------|------------|
| `/gdd:new-cycle` | Neuen Design-Zyklus eröffnen |
| `/gdd:complete-cycle` | Zyklus-Artefakte archivieren + EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | Nummerierte Checkpoints |
| `/gdd:continue` | Alias für `/gdd:resume` |
| `/gdd:timeline` | Narrative Retrospektive über Zyklen + Git-Log |

### Iteration + Entscheidungen

| Befehl | Was er tut |
|--------|------------|
| `/gdd:discuss [topic]` | Adaptives Design-Interview |
| `/gdd:list-assumptions` | Versteckte Designannahmen vor dem Plan offenlegen |
| `/gdd:sketch [idea]` | HTML-Mockups in mehreren Varianten |
| `/gdd:spike [idea]` | Zeitlich begrenztes Machbarkeitsexperiment |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | Findings als projektlokalen Skill bündeln |
| `/gdd:audit` | Wrapper Verify + Audit + Reflector |
| `/gdd:reflect` | Reflector on-demand starten |
| `/gdd:apply-reflections` | Vorschläge prüfen und selektiv anwenden |

### Speicher + Knowledge-Layer

| Befehl | Was er tut |
|--------|------------|
| `/gdd:recall <query>` | FTS5-Suche |
| `/gdd:extract-learnings` | Muster/Entscheidungen/Lehren extrahieren |
| `/gdd:note <text>` | Reibungsfreie Ideenerfassung |
| `/gdd:plant-seed <idea>` | Vorausschauende Idee mit Trigger-Bedingung |
| `/gdd:analyze-dependencies` | Token-Fanout, Call-Graph, Entscheidungsverfolgung |
| `/gdd:skill-manifest` | Alle GDD-Skills und Agenten auflisten |
| `/gdd:graphify` | Projekt-Knowledge-Graph bauen/abfragen/diffen |
| `/gdd:watch-authorities` | Diff der Design-Autoritäts-Feed-Whitelist |

### Verbindungen

| Befehl | Was er tut |
|--------|------------|
| `/gdd:figma-write` | Designentscheidungen zurück nach Figma schreiben |
| `/gdd:handoff <bundle>` | Claude-Design-Bundle importieren |
| `/gdd:darkmode` | Dark-Mode-Implementierung auditieren |
| `/gdd:compare` | Delta DESIGN.md vs DESIGN-VERIFICATION.md berechnen |
| `/gdd:style <Component>` | Komponenten-Handoff-Dokument generieren |

### Diagnose + Forensik

| Befehl | Was er tut |
|--------|------------|
| `/gdd:scan` | Codebase-Design-System-Inventar |
| `/gdd:map` | 5 parallele Codebase-Mapper |
| `/gdd:debug [desc]` | Symptomgetriebene Designuntersuchung |
| `/gdd:health` | Gesundheitsbericht für `.design/`-Artefakte |
| `/gdd:progress` | Position in der Pipeline |
| `/gdd:stats` | Zyklusstatistiken |
| `/gdd:optimize` | Regelbasierte Kostenanalyse |
| `/gdd:warm-cache` | Anthropic-Cache vorwärmen |

### Distribution + Update

| Befehl | Was er tut |
|--------|------------|
| `/gdd:update` | GDD aktualisieren mit Changelog-Vorschau |
| `/gdd:reapply-patches` | Lokale `reference/`-Modifikationen re-stitchen |
| `/gdd:check-update` | Manueller Update-Check |
| `/gdd:settings` | `.design/config.json` konfigurieren |
| `/gdd:set-profile <profile>` | Modellprofil wechseln |
| `/gdd:undo` | Sicherer Designänderungs-Revert |
| `/gdd:pr-branch` | Sauberer PR-Branch |

### Backlog + Notizen

| Befehl | Was er tut |
|--------|------------|
| `/gdd:todo` | Design-Tasks hinzufügen / auflisten / wählen |
| `/gdd:add-backlog <idea>` | Idee für zukünftigen Zyklus parken |
| `/gdd:review-backlog` | Geparkte Einträge prüfen |

### Hilfe

| Befehl | Was er tut |
|--------|------------|
| `/gdd:help` | Vollständige Befehlsliste und Verwendung |
| `/gdd:bandit-reset` | Adaptiv-Schicht-Posterior bei Anthropic-Modell-Release zurücksetzen |

---

## Verbindungen

GDD liefert 12 Tool-Verbindungen. Alle optional. Konfigurieren mit `/gdd:connections`.

| Verbindung | Zweck | Probe |
|------------|-------|-------|
| **Figma** | Tokens, Komponenten, Screenshots lesen; Annotationen, Code Connect, Implementierungsstatus schreiben | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | Design-Referenzsuche | `mcp__refero__search` |
| **Pinterest** | Visuelle Referenz für Brand Voice + Stil | OAuth + MCP |
| **Claude Design** | Handoff-Bundle-Import | URL oder lokale Datei |
| **Storybook** | Komponenten-Spec-Lookup an Port 6006 | HTTP-Probe |
| **Chromatic** | Visual-Regression-Baseline-Diff | API-Key |
| **Preview** | Playwright + Claude Preview MCP Runtime-Screenshots | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP-Canvas-Read/Write | `mcp__paper__use_paper` |
| **pencil.dev** | Git-getrackte `.pen`-Specs | `.pen`-Dateien im Repo |
| **Graphify** | Knowledge-Graph-Export | `mcp__graphify__*` |
| **21st.dev Magic** | Vorbildsuche vor Greenfield | `mcp__magic__search` |
| **Magic Patterns** | DS-aware Komponenten-Generierung | `mcp__magic-patterns__generate` |

Vollständige Details in [`connections/connections.md`](connections/connections.md).

---

## Konfiguration

GDD speichert Projekteinstellungen in `.design/config.json`. Konfiguriere während `/gdd:new-project` oder aktualisiere mit `/gdd:settings`.

### Modellprofile

| Profil | Planung | Ausführung | Verifikation |
|--------|---------|------------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (Standard) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

```
/gdd:set-profile budget
```

### Adaptiv-Modus

`.design/budget.json#adaptive_mode`-Leiter (v1.23.5):

| Modus | Was er tut |
|-------|------------|
| `static` (Standard) | Phase-10.1-Verhalten |
| `hedge` | AdaNormalHedge-Ensemble + MMR-Reranking aktiviert. Sicherste Einführung. |
| `full` | Bandit-Router + Hedge + MMR alle aktiv |

### Parallelität

| Einstellung | Standard | Steuert |
|-------------|----------|---------|
| `parallelism.enabled` | `true` | Unabhängige Tasks in Worktrees ausführen |
| `parallelism.min_estimated_savings_seconds` | `30` | Unter dieser Schwelle Parallelisierung überspringen |
| `parallelism.max_concurrent_workers` | `4` | Hartes Cap auf gleichzeitige Worker |

### Quality Gates

| Einstellung | Standard | Steuert |
|-------------|----------|---------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` |
| `solidify.commands` | autodetect | Typecheck-/Build-/Test-Befehle überschreiben |
| `verify.iterations_max` | `3` | Cap auf Verify→Fix-Loop |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` |

---

## Sicherheit

### Eingebaute Härtung

GDD liefert seit Phase 14.5 Defense-in-Depth:

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash blockiert ~50 gefährliche Muster nach Unicode-NFKC- + ANSI-Normalisierung.
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash erzwingt die `protected_paths`-Glob-Liste.
- **`hooks/gdd-read-injection-scanner.ts`** — scannt eingehenden Read-Inhalt nach unsichtbarem Unicode, HTML-Kommentaren, Secret-Exfiltrations-Mustern.
- **`scripts/lib/blast-radius.cjs`** — `design-executor`-Preflight verweigert Tasks über `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** — bricht aufeinanderfolgende Timeout-Schleifen auf `use_figma` / `use_paper` / `use_pencil`.

### Sensible Dateien schützen

Füge sensible Pfade der Deny-List deines Runtimes hinzu:

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
> Da GDD Markdown-Dateien generiert, die zu LLM-Systemprompts werden, ist jeder benutzergesteuerte Text, der in `.design/`-Artefakte fließt, ein potenzieller indirekter Prompt-Injection-Vektor. Der Injection-Scanner fängt solche Vektoren auf mehreren Ebenen — aber Defense-in-Depth bleibt Best Practice.

---

## Fehlersuche

**Befehle nach Installation nicht gefunden?**
- Runtime neu starten
- `~/.claude/skills/get-design-done/` (global) oder `./.claude/skills/get-design-done/` (lokal) prüfen
- `/gdd:help` zur Bestätigung der Registrierung

**Pipeline mitten in einer Stufe blockiert?**
- `/gdd:resume` — vom letzten nummerierten Checkpoint wiederherstellen
- `/gdd:health` — `.design/`-Artefaktprobleme diagnostizieren
- `/gdd:progress --forensic` — 6-Punkte-Integritätsaudit

**Kostenüberschreitung?**
- `/gdd:optimize` — regelbasierte Empfehlungen
- `/gdd:set-profile budget` — auf Budget-Tier umstellen
- `adaptive_mode: "full"` in `.design/budget.json` setzen — der Bandit lernt

**Auf die neueste Version aktualisieren?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / Container?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Deinstallieren

```bash
# Globale Deinstallation (pro Runtime)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... gleiches Muster --<runtime> --global --uninstall für die 14 Runtimes

# Interaktive Mehrfachauswahl-Deinstallation (ohne Runtime-Flag)
npx @hegemonart/get-design-done --uninstall

# Lokale Deinstallation
npx @hegemonart/get-design-done --claude --local --uninstall
# ... mit --local-Flag
```

Entfernt alle GDD-Befehle, Agenten, Hooks und Einstellungen, ohne deine anderen Konfigurationen zu beeinflussen.

---

## Lizenz

MIT-Lizenz. Siehe [LICENSE](LICENSE) für Details.

---

<div align="center">

**Claude Code liefert Code aus. Get Design Done sorgt dafür, dass auch Design ausgeliefert wird.**

</div>
