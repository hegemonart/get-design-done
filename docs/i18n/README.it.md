<div align="center">

# Hone

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · **Italiano** · [Deutsch](README.de.md)

> Nota: questa traduzione può essere in ritardo rispetto alla versione inglese. La versione di riferimento è [README.md](../../README.md) (translation may lag behind English; see README.md for the canonical version).

**Una pipeline di qualità del design per agenti di coding IA: brief -> esplorazione -> piano -> implementazione -> verifica.**

**Hone mantiene l'UI generata dall'IA allineata al tuo brief, al tuo design system, alla tua conoscenza di design locale e ai tuoi quality gate. Costruito per Claude Code, e si installa su Codex, Cursor, Gemini, OpenCode, Copilot, Windsurf e altro.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/hone/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/hone/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/hone?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/hone)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx hone
```

> **Rinominato da get-design-done (gdd).** Le installazioni esistenti continuano a funzionare: l'alias deprecato `/gdd:` resta per 1-2 versioni. `npx hone` è la nuova installazione; `@hegemonart/get-design-done` è deprecato su npm a favore di `@hegemonart/hone`. _(La traduzione potrebbe essere in ritardo rispetto al README inglese.)_

**Funziona su macOS, Linux e Windows.**

[Installazione](#installazione) · [Per iniziare](#per-iniziare) · [Casi d'uso](#casi-duso) · [Come funziona](#come-funziona) · [Comandi](#comandi) · [Connessioni](#connessioni) · [Sicurezza](#sicurezza-e-privacy)

</div>

---

## Cos'è

Hone aiuta gli agenti di coding IA a rilasciare UI che appartiene al tuo prodotto.

Trasforma richieste vaghe come "migliora questa schermata" in un workflow di design tracciabile: brief, esplorazione, piano, implementazione, verifica.

Invece di chiedere a un agente di improvvisare basandosi solo sul gusto, Hone gli fornisce un processo strutturato, conoscenza di design locale, memoria specifica del progetto, connessioni opzionali agli strumenti di design e una verifica prima che il lavoro venga rilasciato.

## Perché esiste

Gli agenti IA sono rapidi nel produrre UI. La parte difficile è rendere quella UI coerente.

Senza un workflow di design, le interfacce generate vanno alla deriva:

- colori e spaziature smettono di corrispondere al sistema
- i componenti vengono reinventati
- contrasto e accessibilità regrediscono
- la gerarchia cambia da schermata a schermata
- l'implementazione non corrisponde più al brief originale

Hone aggiunge la disciplina di design mancante attorno ai workflow di coding IA. Cattura il problema, mappa il design system corrente, pianifica modifiche circoscritte, le esegue in step atomici e verifica il risultato rispetto al brief, ai token, all'accessibilità e alle rubriche di qualità del design.

Dietro le quinte: 64 agenti specializzati, un intel store interrogabile, routing dei modelli per tier e 39 connessioni opzionali agli strumenti. Quello che usi giorno per giorno è una manciata di comandi `/hone:*`.

## Installazione

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

Sfoglia e installa Hone dal registro di skill [agentskills.io](https://agentskills.io).

### Installer diretto per runtime

```bash
# Claude Code
npx @hegemonart/hone --claude --global
npx @hegemonart/hone --claude --local

# Altri runtime
npx @hegemonart/hone --codex --global
npx @hegemonart/hone --cursor --global
npx @hegemonart/hone --gemini --global

# Installazione multi-runtime
npx @hegemonart/hone --all --global

# Anteprima senza scrivere
npx @hegemonart/hone --dry-run
```

## Per iniziare

Esegui un primo passaggio leggero:

```bash
/hone:start
```

Oppure esegui il ciclo di design completo:

```bash
/hone:brief
/hone:explore
/hone:plan
/hone:design
/hone:verify
```

Per il routing in linguaggio naturale:

```bash
/hone:do improve the checkout page hierarchy, spacing, and empty states
```

## Casi d'uso

### Migliorare una schermata esistente

Usa Hone quando una schermata funziona tecnicamente ma risulta visivamente incoerente, poco chiara o poco curata nel design.

```bash
/hone:do improve the settings page layout and component hierarchy
```

### Riportare l'output dell'IA dentro il design system

Usalo quando un agente ha generato UI che sembra plausibile ma non corrisponde ai tuoi token, spaziature, stati o componenti.

```bash
/hone:verify
```

### Audit prima del rilascio

Esegui la verifica prima di una PR, di un rilascio o di un handoff di design.

```bash
/hone:audit
```

### Sistemare la dark mode

```bash
/hone:darkmode
```

### Importare un handoff di design

```bash
/hone:handoff ./my-design.html
```

Questo analizza un bundle Claude Design, estrae le proprietà CSS personalizzate in decisioni di design ed esegue i controlli di fedeltà dell'handoff.

### Fare un piccolo fix mirato

```bash
/hone:fast "fix contrast in pricing cards"
```

## Cosa lo rende diverso

### Conoscenza di design locale

Hone include un'estesa libreria di riferimenti locale per il lavoro di design. Gli agenti possono usarla senza affidarsi alla ricerca web in tempo reale per i giudizi di design di base.

Copre accessibilità, WCAG, tipografia, spaziatura, griglie, colore, contrasto, superfici, motion, UX writing, form, stati vuoti, gerarchia visuale, dark mode, comportamento responsive, i18n, metodi di ricerca, scoring di audit e anti-pattern di design.

L'agente non parte da un prompt vuoto. Ha un vocabolario di design condiviso e standard concreti da applicare durante pianificazione, implementazione e verifica.

Mappa completa: [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### Memoria specifica del progetto

Hone crea un workspace `.design/` che mantiene ogni ciclo ben ancorato:

| Artefatto | Scopo |
| --- | --- |
| `.design/BRIEF.md` | Problema, audience, scope, metriche di successo |
| `.design/DESIGN.md` | Snapshot corrente del design system |
| `.design/DESIGN-CONTEXT.md` | Decisioni, vincoli, riferimenti |
| `.design/DESIGN-PLAN.md` | Piano di implementazione atomico |
| `.design/DESIGN-VERIFICATION.md` | Audit finale e report dei gap |
| `.design/intel/` | Conoscenza di progetto interrogabile: token, componenti, relazioni, decisioni |
| `.design/archive/` | Storico dei cicli completati e apprendimenti |

Più a lungo lo usi, meno l'agente deve riscoprire.

### Verifica prima del rilascio

Hone non si ferma quando l'UI "sembra finita".

La fase di verifica controlla se il risultato corrisponde ancora a:

- il brief originale
- i token del design system
- le soglie di accessibilità
- le convenzioni dei componenti
- la gerarchia visuale
- le regole di motion e interazione
- le decisioni di design registrate

Quando emergono dei gap, Hone produce una lista di fix strutturata invece di lasciare la review al puro istinto.

### Test di comportamento degli skill

Gli skill stessi di Hone vengono messi alla prova sotto scenari di pressione avversaria (pressione temporale, sunk-cost, autorità, minimizzazione dello scope) per confermare che mantengono la propria disciplina invece di cedere. Vedi [CONTRIBUTING.md](CONTRIBUTING.md) per come aggiungere uno scenario di pressione.

## Come funziona

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| Fase | Comando | Output |
| --- | --- | --- |
| Brief | `/hone:brief` | Cattura il problema di design |
| Explore | `/hone:explore` | Mappa il sistema UI, il debito, i token, i componenti |
| Plan | `/hone:plan` | Crea task di design atomici |
| Design | `/hone:design` | Esegue i task con validazione |
| Verify | `/hone:verify` | Audita il risultato finale |

### Output principali

| File | Cosa fa |
| --- | --- |
| `.design/BRIEF.md` | Problema, audience e metriche di successo del ciclo |
| `.design/DESIGN.md` | Snapshot corrente del design system |
| `.design/DESIGN-CONTEXT.md` | Decisioni e vincoli di design |
| `.design/DESIGN-PLAN.md` | Task atomici, onde, dipendenze |
| `.design/DESIGN-VERIFICATION.md` | Risultato della verifica e lista dei gap |
| `.design/intel/` | Layer di conoscenza interrogabile per questo progetto |

## Comandi

Hone include 96 skill. Questi sono quelli di cui la maggior parte degli utenti ha bisogno giorno per giorno. Per il riferimento completo vedi [SKILL.md](SKILL.md).

### Pipeline principale

| Comando | Scopo |
| --- | --- |
| `/hone:brief` | Cattura il brief di design |
| `/hone:explore` | Inventaria il sistema UI corrente |
| `/hone:plan` | Produce il piano di design |
| `/hone:design` | Esegue il piano |
| `/hone:verify` | Verifica il risultato |
| `/hone:ship` | Prepara un branch PR pulito |
| `/hone:next` | Auto-routing alla fase successiva |

### Uso quotidiano

| Comando | Scopo |
| --- | --- |
| `/hone:do <task>` | Router in linguaggio naturale |
| `/hone:fast <task>` | Piccolo fix mirato |
| `/hone:quick` | Flusso di task leggero |
| `/hone:audit` | Audit di qualità del design |
| `/hone:darkmode` | Audit della dark mode |
| `/hone:style <component>` | Handoff di stile di un componente |
| `/hone:health` | Diagnostica lo stato della pipeline |
| `/hone:progress` | Mostra l'avanzamento del ciclo corrente |
| `/hone:resume` | Riprende dal checkpoint |

### Strumenti di design e handoff

| Comando | Scopo |
| --- | --- |
| `/hone:connections` | Configura le integrazioni opzionali |
| `/hone:figma-extract` | Estrae il contesto del design system da Figma |
| `/hone:figma-write` | Riscrive decisioni e stato su Figma |
| `/hone:handoff <bundle>` | Importa un bundle Claude Design |
| `/hone:sketch <idea>` | Genera mockup HTML multi-variante |
| `/hone:spike <idea>` | Passaggio di fattibilità timeboxed |

Riferimento completo dei comandi: [SKILL.md](SKILL.md)

## Connessioni

Hone funziona senza strumenti esterni, ma può connettersi a 39 integrazioni opzionali. Sono tutte opzionali; la pipeline degrada in modo grazioso verso i fallback quando una connessione non è disponibile.

Il layer di connessione copre queste categorie:

- **Superfici di design** - Figma (lettura + scrittura + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **Riferimento e ricerca** - Refero, Pinterest, Lazyweb, Mobbin, handoff Claude Design
- **Generazione di componenti** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **Specifica di componenti e QA visuale** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **Knowledge graph** - Graphify
- **Output nativo e non-web** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, renderer di stampa
- **Verifica della motion** - Lottie, Rive
- **Superfici di team** - Slack, Discord, Linear, Jira, Notion, GitHub PR

Configura le integrazioni con:

```bash
/hone:connections
```

Per la lista completa delle connessioni con i pattern di sonda, vedi [connections/connections.md](connections/connections.md).

## Requisiti

- Node.js 22 o 24
- Git
- Un runtime di coding IA supportato

## Supporto multi-runtime

Hone si installa su 14 runtime di coding IA: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Kilo, Copilot, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy e Cline. Gli stessi skill e agenti sorgente vengono compilati nel layout nativo di ciascun runtime (`skills/`, `command/`, `agents/` o `.clinerules`) da convertitori specifici per runtime, così la pipeline ti segue tra gli editor.

Claude Code è il flagship. L'esperienza completa gira lì da capo a coda: ogni agente, gli hook defense-in-depth e le connessioni supportate da MCP. Sugli altri runtime ottieni gli stessi skill e agenti nella loro forma nativa, le connessioni supportate da MCP si attivano sugli host con capacità MCP e il layer degli hook è specifico di Claude Code.

## Sicurezza e privacy

Hone è local-first per impostazione predefinita. Scrive gli artefatti di progetto sotto `.design/`, usa le integrazioni opzionali solo quando configurate e mantiene la segnalazione di issue subordinata al consenso.

Il plugin include hook defense-in-depth per percorsi protetti, blocco dei comandi pericolosi, scansione di injection, circuit breaking per MCP e applicazione del budget. Hone espone inoltre 13 tool MCP in sola lettura per un'introspezione sicura del progetto.

Aggiungi i percorsi sensibili alla deny list del tuo runtime:

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

Leggi: [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## Aggiornamento

```bash
npx hone
```

Oppure da dentro Claude Code:

```bash
/hone:update
```

Per lo storico completo dei rilasci, vedi [CHANGELOG.md](CHANGELOG.md).

## Risoluzione problemi

### I comandi non compaiono

Riavvia il tuo runtime ed esegui:

```bash
/hone:help
```

### La pipeline è bloccata

```bash
/hone:health
/hone:resume
```

### Il costo è troppo alto

```bash
/hone:optimize
```

## Contribuire

```bash
npm install
npm test
npm run typecheck
```

Leggi: [CONTRIBUTING.md](CONTRIBUTING.md)

## Licenza

Licenza MIT. Vedi [LICENSE](LICENSE) per i dettagli. Le attribuzioni di terze parti sono elencate in [NOTICE](NOTICE).

---

<div align="center">

**Claude Code rilascia codice. Hone si assicura che rilasci design.**

</div>
