<div align="center">

# Hone

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · **Deutsch**

> Hinweis: Diese Übersetzung kann hinter der englischen Version zurückliegen. Die maßgebliche Version ist [README.md](../../README.md) (translation may lag behind English; see README.md for the canonical version).

**Eine Design-Quality-Pipeline für AI-Coding-Agenten: Brief -> Explore -> Plan -> Design -> Verify.**

**Hone hält AI-generierte UI an deinen Brief, dein Design-System, dein lokales Design-Wissen und deine Quality Gates gebunden. Gebaut für Claude Code und installierbar über Codex, Cursor, Gemini, OpenCode, Copilot, Windsurf und mehr.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/hone/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/hone/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/hone?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/hone)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx hone
```

> **Umbenannt von get-design-done (gdd).** Bestehende Installationen funktionieren weiter: der veraltete `/gdd:`-Alias bleibt 1-2 Versionen erhalten. `npx hone` ist die neue Installation; `@hegemonart/get-design-done` ist auf npm zugunsten von `@hegemonart/hone` veraltet. _(Übersetzung kann dem englischen README hinterherhinken.)_

**Funktioniert auf macOS, Linux und Windows.**

[Installation](#installation) · [Erste Schritte](#erste-schritte) · [Anwendungsfälle](#anwendungsfälle) · [Wie es funktioniert](#wie-es-funktioniert) · [Befehle](#befehle) · [Verbindungen](#verbindungen) · [Sicherheit](#sicherheit-und-datenschutz)

</div>

---

## Was es ist

Hone hilft AI-Coding-Agenten dabei, UI auszuliefern, die wirklich in dein Produkt gehört.

Es verwandelt vage Anfragen wie „mach diesen Screen besser" in einen nachvollziehbaren Design-Workflow: Brief, Explore, Plan, Design, Verify.

Anstatt einen Agenten allein aus seinem Geschmack heraus improvisieren zu lassen, gibt Hone ihm einen strukturierten Prozess, lokales Design-Wissen, projektspezifischen Speicher, optionale Design-Tool-Verbindungen und eine Verifikation, bevor die Arbeit ausgeliefert wird.

## Warum es existiert

AI-Agenten sind schnell darin, UI zu produzieren. Der schwierige Teil ist, diese UI kohärent zu machen.

Ohne einen Design-Workflow driften generierte Oberflächen auseinander:

- Farben und Abstände passen nicht mehr zum System
- Komponenten werden neu erfunden
- Kontrast und Barrierefreiheit verschlechtern sich
- die Hierarchie ändert sich von Screen zu Screen
- die Implementierung entspricht nicht mehr dem ursprünglichen Brief

Hone ergänzt die fehlende Design-Disziplin rund um AI-Coding-Workflows. Es erfasst das Problem, kartiert das aktuelle Design-System, plant abgegrenzte Änderungen, führt sie in atomaren Schritten aus und verifiziert das Ergebnis gegen den Brief, die Tokens, die Barrierefreiheit und Design-Quality-Rubriken.

Hinter den Kulissen: 64 spezialisierte Agenten, ein abfragbarer Intel-Store, Tier-bewusstes Modell-Routing und 39 optionale Tool-Verbindungen. Im Alltag nutzt du eine Handvoll `/hone:*`-Befehle.

## Installation

### npm

```bash
npx hone
```

### Claude Code

```bash
/plugin marketplace add hegemonart/hone
/plugin install hone@hone
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add hegemonart/hone
```

### agentskills.io

Durchsuche und installiere Hone über die Skill-Registry [agentskills.io](https://agentskills.io).

### Direkter Runtime-Installer

```bash
# Claude Code
npx @hegemonart/hone --claude --global
npx @hegemonart/hone --claude --local

# Andere Runtimes
npx @hegemonart/hone --codex --global
npx @hegemonart/hone --cursor --global
npx @hegemonart/hone --gemini --global

# Multi-Runtime-Installation
npx @hegemonart/hone --all --global

# Vorschau ohne Schreibvorgang
npx @hegemonart/hone --dry-run
```

## Erste Schritte

Führe einen schlanken ersten Durchlauf aus:

```bash
/hone:start
```

Oder durchlaufe den vollständigen Design-Zyklus:

```bash
/hone:brief
/hone:explore
/hone:plan
/hone:design
/hone:verify
```

Für natursprachliches Routing:

```bash
/hone:do improve the checkout page hierarchy, spacing, and empty states
```

## Anwendungsfälle

### Einen bestehenden Screen verbessern

Nutze Hone, wenn ein Screen technisch funktioniert, sich aber visuell inkonsistent, unklar oder unterdesignt anfühlt.

```bash
/hone:do improve the settings page layout and component hierarchy
```

### AI-Output zurück ins Design-System bringen

Nutze es, wenn ein Agent UI generiert hat, die plausibel aussieht, aber nicht zu deinen Tokens, Abständen, Zuständen oder Komponenten passt.

```bash
/hone:verify
```

### Audit vor dem Shipping

Führe die Verifikation vor einem PR, Release oder Design-Handoff aus.

```bash
/hone:audit
```

### Dark Mode reparieren

```bash
/hone:darkmode
```

### Einen Design-Handoff importieren

```bash
/hone:handoff ./my-design.html
```

Dies parst ein Claude-Design-Bundle, extrahiert CSS-Custom-Properties in Designentscheidungen und führt Handoff-Faithfulness-Checks aus.

### Eine kleine, gezielte Korrektur vornehmen

```bash
/hone:fast "fix contrast in pricing cards"
```

## Was es anders macht

### Lokales Design-Wissen

Hone bringt eine umfangreiche lokale Referenzbibliothek für Designarbeit mit. Agenten können sie nutzen, ohne für grundlegende Design-Entscheidungen auf eine Live-Websuche angewiesen zu sein.

Sie deckt Barrierefreiheit, WCAG, Typografie, Abstände, Raster, Farbe, Kontrast, Surfaces, Motion, UX-Writing, Formulare, Empty States, visuelle Hierarchie, Dark Mode, responsives Verhalten, i18n, Forschungsmethoden, Audit-Scoring und Design-Anti-Patterns ab.

Der Agent startet nicht von einem leeren Prompt. Er verfügt über ein gemeinsames Design-Vokabular und konkrete Standards, die er bei Planung, Implementierung und Verifikation anwenden kann.

Vollständige Übersicht: [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### Projektspezifischer Speicher

Hone erstellt einen `.design/`-Arbeitsbereich, der jeden Zyklus geerdet hält:

| Artefakt | Zweck |
| --- | --- |
| `.design/BRIEF.md` | Problem, Zielgruppe, Scope, Erfolgsmetriken |
| `.design/DESIGN.md` | Aktuelle Design-System-Snapshot |
| `.design/DESIGN-CONTEXT.md` | Entscheidungen, Constraints, Referenzen |
| `.design/DESIGN-PLAN.md` | Atomarer Implementierungsplan |
| `.design/DESIGN-VERIFICATION.md` | Finales Audit und Gap-Report |
| `.design/intel/` | Abfragbares Projektwissen: Tokens, Komponenten, Beziehungen, Entscheidungen |
| `.design/archive/` | Verlauf abgeschlossener Zyklen und Lernergebnisse |

Je länger du es nutzt, desto weniger muss der Agent neu entdecken.

### Verifikation vor dem Shipping

Hone hört nicht auf, sobald die UI „fertig aussieht".

Die Verify-Stufe prüft, ob das Ergebnis noch übereinstimmt mit:

- dem ursprünglichen Brief
- den Design-System-Tokens
- den Barrierefreiheits-Schwellenwerten
- den Komponenten-Konventionen
- der visuellen Hierarchie
- den Motion- und Interaktionsregeln
- den festgehaltenen Designentscheidungen

Wenn Lücken auftauchen, erstellt Hone eine strukturierte Fix-Liste, anstatt das Review dem Bauchgefühl zu überlassen.

### Skill-Behavior-Tests

GDDs eigene Skills werden unter adversarialen Drucksituationen getestet (Zeitdruck, Sunk-Cost, Autorität, Scope-Minimierung), um zu bestätigen, dass sie ihre Disziplin wahren, statt einzuknicken. Siehe [CONTRIBUTING.md](CONTRIBUTING.md) dazu, wie man ein Drucksituations-Szenario hinzufügt.

## Wie es funktioniert

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| Stufe | Befehl | Output |
| --- | --- | --- |
| Brief | `/hone:brief` | Erfasst das Designproblem |
| Explore | `/hone:explore` | Kartiert UI-System, Debt, Tokens, Komponenten |
| Plan | `/hone:plan` | Erstellt atomare Design-Tasks |
| Design | `/hone:design` | Führt Tasks mit Validierung aus |
| Verify | `/hone:verify` | Auditiert das finale Ergebnis |

### Kern-Outputs

| Datei | Was sie macht |
| --- | --- |
| `.design/BRIEF.md` | Problem, Zielgruppe und Erfolgsmetriken des Zyklus |
| `.design/DESIGN.md` | Aktuelle Design-System-Snapshot |
| `.design/DESIGN-CONTEXT.md` | Designentscheidungen und Constraints |
| `.design/DESIGN-PLAN.md` | Atomare Tasks, Waves, Dependencies |
| `.design/DESIGN-VERIFICATION.md` | Verifikationsergebnis und Gap-Liste |
| `.design/intel/` | Abfragbarer Knowledge-Layer für dieses Projekt |

## Befehle

Hone liefert 96 Skills. Dies sind die, die die meisten Nutzer im Alltag brauchen. Die vollständige Referenz findest du in [SKILL.md](SKILL.md).

### Kernpipeline

| Befehl | Zweck |
| --- | --- |
| `/hone:brief` | Den Design-Brief erfassen |
| `/hone:explore` | Das aktuelle UI-System inventarisieren |
| `/hone:plan` | Den Design-Plan erstellen |
| `/hone:design` | Den Plan ausführen |
| `/hone:verify` | Das Ergebnis verifizieren |
| `/hone:ship` | Einen sauberen PR-Branch vorbereiten |
| `/hone:next` | Automatisch zur nächsten Stufe routen |

### Tägliche Nutzung

| Befehl | Zweck |
| --- | --- |
| `/hone:do <task>` | Natursprachlicher Router |
| `/hone:fast <task>` | Kleine, gezielte Korrektur |
| `/hone:quick` | Schlanker Task-Flow |
| `/hone:audit` | Design-Quality-Audit |
| `/hone:darkmode` | Dark-Mode-Audit |
| `/hone:style <component>` | Komponenten-Style-Handoff |
| `/hone:health` | Pipeline-Zustand diagnostizieren |
| `/hone:progress` | Aktuellen Zyklus-Fortschritt anzeigen |
| `/hone:resume` | Vom Checkpoint fortsetzen |

### Design-Tools und Handoff

| Befehl | Zweck |
| --- | --- |
| `/hone:connections` | Optionale Integrationen konfigurieren |
| `/hone:figma-extract` | Figma-Design-System-Kontext extrahieren |
| `/hone:figma-write` | Entscheidungen und Status zurück nach Figma schreiben |
| `/hone:handoff <bundle>` | Ein Claude-Design-Bundle importieren |
| `/hone:sketch <idea>` | HTML-Mockups in mehreren Varianten generieren |
| `/hone:spike <idea>` | Zeitlich begrenzter Machbarkeitsdurchlauf |

Vollständige Befehlsreferenz: [SKILL.md](SKILL.md)

## Verbindungen

Hone funktioniert ohne externe Tools, kann sich aber mit 39 optionalen Integrationen verbinden. Alle sind optional; die Pipeline degradiert sauber auf Fallbacks, wenn eine Verbindung nicht verfügbar ist.

Die Verbindungsschicht umfasst diese Kategorien:

- **Design-Surfaces** - Figma (Lesen + Schreiben + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **Referenz und Research** - Refero, Pinterest, Lazyweb, Mobbin, Claude-Design-Handoff
- **Komponenten-Generierung** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **Komponenten-Spec und visuelle QA** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **Knowledge-Graph** - Graphify
- **Native und Nicht-Web-Output** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, Print-Renderer
- **Motion-Verifikation** - Lottie, Rive
- **Team-Surfaces** - Slack, Discord, Linear, Jira, Notion, GitHub PR

Konfiguriere Integrationen mit:

```bash
/hone:connections
```

Die vollständige Verbindungsliste mit Probe-Mustern findest du in [connections/connections.md](connections/connections.md).

## Voraussetzungen

- Node.js 22 oder 24
- Git
- Eine unterstützte AI-Coding-Runtime

## Multi-Runtime-Support

Hone installiert über 14 AI-Coding-Runtimes: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Kilo, Copilot, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy und Cline. Dieselben Quell-Skills und -Agenten werden durch Per-Runtime-Konverter in das native Layout jeder Runtime kompiliert (`skills/`, `command/`, `agents/` oder `.clinerules`), sodass die Pipeline mit dir über Editoren hinweg mitreist.

Claude Code ist das Flaggschiff. Die volle Erfahrung läuft dort von Anfang bis Ende: jeder Agent, die Defense-in-Depth-Hooks und die MCP-gestützten Verbindungen. Auf den anderen Runtimes erhältst du dieselben Skills und Agenten in ihrer nativen Form, MCP-gestützte Verbindungen leuchten auf den MCP-fähigen Hosts auf, und die Hook-Schicht ist spezifisch für Claude Code.

## Sicherheit und Datenschutz

Hone ist standardmäßig Local-First. Es schreibt Projektartefakte unter `.design/`, nutzt optionale Integrationen nur, wenn sie konfiguriert sind, und hält das Issue-Reporting einwilligungsbasiert.

Das Plugin enthält Defense-in-Depth-Hooks für geschützte Pfade, das Blockieren gefährlicher Befehle, Injection-Scanning, MCP-Circuit-Breaking und Budget-Enforcement. Hone stellt außerdem 13 schreibgeschützte MCP-Tools für eine sichere Projekt-Introspektion bereit.

Füge sensible Pfade der Deny-List deiner Runtime hinzu:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

Lies: [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## Aktualisieren

```bash
npx hone
```

Oder aus Claude Code heraus:

```bash
/hone:update
```

Die vollständige Release-Historie findest du in [CHANGELOG.md](CHANGELOG.md).

## Fehlersuche

### Befehle erscheinen nicht

Starte deine Runtime neu und führe aus:

```bash
/hone:help
```

### Pipeline hängt fest

```bash
/hone:health
/hone:resume
```

### Kosten sind zu hoch

```bash
/hone:optimize
```

## Mitwirken

```bash
npm install
npm test
npm run typecheck
```

Lies: [CONTRIBUTING.md](CONTRIBUTING.md)

## Lizenz

MIT-Lizenz. Siehe [LICENSE](LICENSE) für Details. Drittanbieter-Attributionen sind in [NOTICE](NOTICE) aufgeführt.

---

<div align="center">

**Claude Code liefert Code aus. Hone sorgt dafür, dass auch Design ausgeliefert wird.**

</div>
