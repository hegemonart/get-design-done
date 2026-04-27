<div align="center">

# GET DESIGN DONE

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Français** · [Italiano](README.it.md) · [Deutsch](README.de.md)

**Un pipeline de qualité design pour agents de code IA : brief → exploration → plan → implémentation → vérification.**

**Get Design Done garde l'UI générée par IA liée à votre brief, votre design system, vos références et vos quality gates. Fonctionne avec Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy et Cline.**

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

**Fonctionne sur macOS, Linux et Windows.**

<br>

*« Les agents de code IA livrent l'UI vite. Get Design Done s'assure qu'ils livrent du design. »*

<br>

[Pourquoi je l'ai construit](#pourquoi-je-lai-construit) · [Comment ça marche](#comment-ça-marche) · [Commandes](#commandes) · [Connexions](#connexions) · [Pourquoi ça marche](#pourquoi-ça-marche)

</div>

---

> [!IMPORTANT]
> ### Vous avez déjà un bundle Claude Design ?
>
> Si vous avez exporté un design depuis [claude.ai/design](https://claude.ai/design), vous pouvez sauter entièrement les étapes 1 à 3 :
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> Parse les propriétés CSS personnalisées du bundle en décisions de design D-XX, exécute la passe de vérification avec scoring Handoff Faithfulness et écrit éventuellement le statut d'implémentation dans Figma.

---

## Pourquoi je l'ai construit

Je suis un designer qui livre avec des agents de code IA. Le workflow côté code est mature : specs, tâches, tests, commits, boucles de review. Le workflow côté design ne l'était pas.

Ce que j'ai rencontré sans cesse : l'agent pouvait générer un écran qui semblait bon isolément, mais le travail restait *déconnecté*. Les tokens ne correspondaient pas au système existant. Les ratios de contraste glissaient sous WCAG. La hiérarchie était réinventée par écran. Les vieux anti-patterns entraient dans de nouveaux composants. Et comme rien ne vérifiait la sortie par rapport au brief original, les problèmes apparaissaient tard, en PR review ou après le handoff.

Alors j'ai construit Get Design Done : un pipeline de design qui donne aux agents de code IA la même structure que les développeurs attendent déjà des workflows d'ingénierie. Il capture le brief, cartographie le design system existant, ancre les décisions dans des références, décompose le travail en tâches atomiques, exécute ces tâches et vérifie le résultat avant l'expédition.

En coulisses : 37 agents spécialisés, un intel store interrogeable, du routage de modèle par tier, 12 connexions d'outils optionnelles, des commits atomiques et une couche adaptative no-regret qui apprend des résultats solidify-with-rollback. Au quotidien, vous utilisez quelques commandes `/gdd:*` qui gardent le travail design cohérent.

— **Hegemon**

---

Le design généré par IA a le même mode d'échec que le code généré par IA : vous décrivez ce que vous voulez, obtenez quelque chose de plausible, puis le tout s'effondre à l'échelle parce qu'aucun système ne reliait la sortie au brief.

Get Design Done est la couche d'ingénierie de contexte pour le travail de design. Il transforme « améliore cette UI » en cycle traçable : brief → inventaire → références → plan → implémentation → vérification.

---

## Ce que vous obtenez

- **Travail design ancré dans le brief** — chaque cycle commence par le problème, l'audience, les contraintes, les critères de réussite et les must-haves.
- **Extraction du design system** — GDD inventorie tokens, typographie, espacements, composants, motion, accessibilité, dark mode et dette design avant de planifier les changements.
- **Décisions appuyées par des références** — les agents utilisent des références design intégrées ainsi que les connexions optionnelles Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic et Magic Patterns.
- **Exécution atomique** — les tâches design sont décomposées par dépendance, exécutées en vagues sûres et commitées indépendamment.
- **Vérification avant livraison** — les audits vérifient l'adéquation au brief, l'intégration des tokens, le contraste WCAG, la conformité des composants, la cohérence de la motion, l'architecture dark-mode et les anti-patterns design.
- **Rollback en cas d'échec de validation** — solidify-with-rollback valide chaque tâche avant de la conserver ; le travail en échec est automatiquement revert.

---

## Pour qui est-ce

GDD est fait pour les ingénieurs, designers, design engineers, fondateurs et builders produit qui livrent de l'UI avec des agents de code IA et veulent un résultat qui tienne au-delà de la première capture d'écran.

Utilisez-le si vous voulez que les tokens correspondent, que le contraste passe WCAG, que la motion reste cohérente, que les composants suivent votre système et que l'implémentation finale corresponde encore à votre demande.

Vous n'avez pas besoin d'être designer. Le pipeline apporte la discipline design au workflow agentique : il extrait le contexte, ne pose que les questions manquantes, ancre le travail dans des références et attrape les problèmes que l'on découvre généralement trop tard.

### Points forts v1.24.0 — Installeur multi-runtime

- **Multi-sélection interactive `@clack/prompts`** — `npx @hegemonart/get-design-done` sans flag ouvre maintenant une UI de cases à cocher soignée pour les 14 runtimes supportés (Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline) plus une radio Global / Local.
- **Idempotent + sûr pour AGENTS.md externes** — relancer l'installeur ne duplique jamais d'entrées et n'écrase jamais les instructions spécifiques au runtime que vous avez ajoutées. Étape de confirmation avant toute écriture de fichier.
- **Surface CI scriptée préservée** — chaque flag existant (`--claude`, `--cursor`, `--all`, `--global`, `--local`, `--uninstall`, `--config-dir`) continue de fonctionner sans changement. Le mode interactif s'active uniquement si aucun flag de runtime n'est passé.
- **Désinstallation multi-sélection** — `--uninstall` sans flag de runtime entre aussi en multi-sélection interactive pour choisir de quels runtimes désinstaller.

### Versions précédentes

- **v1.23.5** — Couche adaptative No-Regret (bandit Thompson sampling + ensemble AdaNormalHedge + reranking MMR ; viable en mono-utilisateur via bootstrap par a priori informé, sans télémétrie partagée opt-in).
- **v1.23.0** — Primitives de domaine SDK (porte solidify-with-rollback, contrats de sortie JSON, auto-cristallisation des motifs `Touches:`).
- **v1.22.0** — Observabilité SDK (~24 types d'événements typés, trajectoire par tool-call, chaîne d'événements append-only, scrubber de secrets).
- **v1.21.0** — SDK headless (CLI `gdd-sdk` exécute le pipeline complet sans Claude Code, researchers parallèles, MCP cross-harness).
- **v1.20.0** — Fondation SDK (primitives de résilience, `STATE.md` sécurisé par lockfile, serveur MCP `gdd-state` avec 11 outils typés, fondation TypeScript).

Notes de version complètes dans [CHANGELOG.md](CHANGELOG.md).

---

<p align="center">
  <sub>Supported by</sub><br><br>
  <a href="https://www.humbleteam.com/" aria-label="Humbleteam">
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam" width="180">
  </a>
</p>

---

## Démarrage

```bash
npx @hegemonart/get-design-done@latest
```

L'installeur vous invite à choisir :
1. **Runtime** — Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline ou tous (multi-sélection interactive)
2. **Emplacement** — Global (tous les projets) ou Local (projet actuel uniquement)

Vérifier avec :

```
/gdd:help
```

> [!TIP]
> Lancez Claude Code avec `--dangerously-skip-permissions` pour une expérience automatisée sans friction. GDD est conçu pour une exécution multi-étapes autonome.

### Rester à jour

GDD livre souvent. Mettez à jour en relançant l'installeur (idempotent) :

```bash
npx @hegemonart/get-design-done@latest
```

Ou depuis Claude Code :

```
/gdd:update
```

`/gdd:update` prévisualise le changelog avant d'appliquer. Les modifications locales sous `reference/` sont préservées — si une mise à jour structurelle nécessite un re-stitching, exécutez `/gdd:reapply-patches`.

<details>
<summary><strong>Installation non-interactive (Docker, CI, scripts)</strong></summary>

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

# Tous les runtimes
npx @hegemonart/get-design-done --all --global

# Dry run
npx @hegemonart/get-design-done --dry-run

# Répertoire de config personnalisé
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>Alternative : Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

</details>


## Comment ça marche

> **Vous démarrez sur un codebase existant ?** Exécutez `/gdd:map` d'abord. Il dispatche 5 mappers spécialistes en parallèle (tokens, components, visual hierarchy, a11y, motion) et écrit du JSON structuré dans `.design/map/`.

### 1. Brief

```
/gdd:brief
```

Capture le problème de design avant tout scan ou exploration. Le skill interview via `AskUserQuestion`, une question à la fois — uniquement pour les sections sans réponse : problème, audience, contraintes, métriques de succès, scope.

**Crée :** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

Inventorie le design system du codebase actuel — couleurs, typographie, espacement, composants, motion, a11y, dark-mode. Cinq mappers parallèles + un entretien `design-discussant` produisent trois artefacts. Les sondes de connexion détectent la disponibilité de 12 outils externes.

**Crée :** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan

```
/gdd:plan
```

Décompose la sortie d'Explore en tâches de design atomiques, coordonnées par vagues, avec analyse des dépendances. Chaque tâche porte des chemins `Touches:` explicites, des tags de sécurité parallèle et des critères d'acceptation. `design-planner` (opus) rédige ; `design-plan-checker` (haiku) vérifie avant exécution.

**Crée :** `.design/DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

Exécute les tâches dans l'ordre des vagues. Chaque tâche obtient un agent `design-executor` dédié avec un nouveau contexte de 200k, un commit git atomique et une gestion automatique des déviations selon les règles de contexte. Les tâches sûres en parallèle s'exécutent dans des worktrees.

**Solidify-with-rollback** (v1.23.0) — chaque tâche valide (typecheck + build + test ciblé) avant de verrouiller. Échec de validation → revert via `git stash`.

**Crée :** un `.design/tasks/task-NN.md` par tâche, un commit git atomique par tâche

```
┌────────────────────────────────────────────────────────────────────┐
│  EXÉCUTION PAR VAGUES                                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallèle)         WAVE 2 (parallèle)        WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: chemins pilotent l'analyse de dépendances    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify

```
/gdd:verify
```

Vérifie par rapport au brief — must-haves, heuristiques NN/g, rubrique d'audit, intégration de tokens. Trois agents s'exécutent séquentiellement : `design-auditor` (score 6 piliers 1–4), `design-verifier` (rétro-objectif), `design-integration-checker` (greppe les décisions D-XX dans le code). Aux échecs, produit une liste de gaps structurée et entre dans une boucle verify→fix via `design-fixer`.

**Crée :** `.design/DESIGN-VERIFICATION.md`, commits de fix si problèmes trouvés

---

### 6. Ship → Reflect → Cycle suivant

```
/gdd:ship                    # Génère une PR branche propre (filtre les commits .design/)
/gdd:reflect                 # design-reflector lit télémétrie + apprentissages
/gdd:apply-reflections       # Examiner et appliquer sélectivement les propositions
/gdd:complete-cycle          # Archive les artefacts du cycle + écrit EXPERIENCE.md
/gdd:new-cycle               # Ouvre un nouveau cycle de design
```

Ou routage automatique :

```
/gdd:next                    # Auto-détecte l'état et exécute la prochaine étape
```

Chaque cycle obtient un brief, un scan, un plan, une exécution, une vérification et un `EXPERIENCE.md` par cycle (~100–200 lignes : Objectif / Décisions prises / Apprentissages gradués / Ce qui est mort / Passation au cycle suivant) qui devient la source la plus prioritaire pour le hook decision-injector.

---

### Mode Fast

```
/gdd:fast "<task>"
```

Pour les corrections triviales d'un seul fichier qui n'ont pas besoin du pipeline complet. Saute le routeur, le cache-manager et la télémétrie. Mêmes garanties de commit atomique.

```
/gdd:quick
```

Pour les tâches ad-hoc qui nécessitent les garanties GDD mais sautent les portes optionnelles (pas de phase-researcher, pas d'analyste d'hypothèses, pas d'integration-checker). Plus rapide que le pipeline complet ; plus sûr que `/gdd:fast`.

---

## Pourquoi ça marche

### Ingénierie de contexte

Les CLI de codage IA sont puissants **si** vous leur donnez du contexte. La plupart des gens ne le font pas.

GDD le gère pour vous :

| Fichier | Rôle |
|---------|------|
| `.design/BRIEF.md` | Le problème, l'audience, les métriques de succès du cycle |
| `.design/DESIGN.md` | Snapshot du design system actuel (tokens, composants, hiérarchie) |
| `.design/DESIGN-CONTEXT.md` | Décisions D-XX, réponses d'entretien, contraintes amont/aval |
| `.design/DESIGN-PLAN.md` | Tâches atomiques, chorégraphie de vagues, dépendances |
| `.design/DESIGN-VERIFICATION.md` | Résultat de vérification, liste de gaps, score Handoff Faithfulness |
| `.design/intel/` | Couche de connaissances interrogeable |
| `.design/archive/cycle-N/EXPERIENCE.md` | Rétrospective par cycle, mémoire inter-cycles |
| `.design/telemetry/events.jsonl` | Flux d'événements typés à travers les étapes |
| `.design/telemetry/posterior.json` | Postérieur du bandit (quand `adaptive_mode != static`) |

Limites de taille là où la qualité de Claude se dégrade. Restez dessous, obtenez de la cohérence.

### 37 agents spécialisés

Chaque étape est un orchestrateur léger qui spawn des agents spécialisés.

| Étape | Orchestrateur | Agents |
|-------|---------------|--------|
| Brief | entretien une question | (pas de sous-agents) |
| Explore | spawn 5 mappers + discussant | 5 mappers parallèles, design-discussant, research-synthesizer |
| Plan | spawn researcher + planner + checker | design-phase-researcher (optionnel), design-planner (opus), design-plan-checker (haiku) |
| Design | coordination de vagues + isolation worktree | design-executor par tâche, design-fixer en cas d'échec solidify |
| Verify | spawn auditor + verifier + checker | design-auditor, design-verifier, design-integration-checker |
| Reflect | lit télémétrie + apprentissages | design-reflector (opus), design-authority-watcher, design-update-checker |

### 12 connexions d'outils

Toutes optionnelles — le pipeline dégrade gracieusement quand une connexion est indisponible :

- **Figma** (lecture + écriture + Code Connect)
- **Refero** — recherche de références de design
- **Pinterest** — ancrage de références visuelles
- **Claude Design** — import de bundle de handoff
- **Storybook** — recherche de spécifications de composants
- **Chromatic** — diff de baseline de régression visuelle
- **Preview** — captures d'écran runtime Playwright + Claude Preview MCP
- **paper.design** — lecture/écriture canvas MCP
- **pencil.dev** — fichiers de spécification `.pen` suivis par git
- **Graphify** — export de graphe de connaissances
- **21st.dev Magic** — recherche de précédents avant builds greenfield
- **Magic Patterns** — génération de composants DS-aware

### Références de design intégrées

Le plugin livre **18+ fichiers de référence** — NN/g 10, design émotionnel de Don Norman, 10 principes de Dieter Rams, 12 principes de Disney (motion), lentille d'authoring de composants Sonner / Emil Kowalski, Peak-End, Loss Aversion, Cognitive Load, Aesthetic-Usability, Doherty, Flow, 35 spécifications de composants, gestalt, hiérarchie visuelle, brand voice, 161 palettes par industrie, 67 esthétiques d'UI, 12 easings de motion, 8 familles de transition, WCAG 2.1 AA, plateformes (iOS/Android/web/visionOS/watchOS), RTL/CJK, patterns de formulaire, catalogue d'anti-patterns.

### Commits git atomiques

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

Git bisect trouve la tâche défaillante exacte. Chaque tâche est revertable indépendamment. Solidify-with-rollback ajoute une porte de validation au niveau de la tâche, donc une tâche 3 cassée ne corrompt jamais les tâches 4–10 avant que verify ne s'exécute.

### Boucle d'auto-amélioration

Après chaque cycle, `design-reflector` (opus) lit `events.jsonl`, `agent-metrics.json`, `learnings/`, puis propose des diffs — surcharges de niveau, règles de parallélisation, ajouts de références, mises à jour de frontmatter. `/gdd:apply-reflections` montre le diff et demande avant d'appliquer.

La **couche adaptative No-Regret** (v1.23.5) ajoute par-dessus un bandit Thompson sampling + ensemble AdaNormalHedge + reranking MMR, viable en mono-utilisateur via bootstrap par a priori informé.

### Gouvernance des coûts

- **Skill `gdd-router`** — routage déterministe intent → fast / quick / full, sans appel de modèle.
- **`gdd-cache-manager`** — cache explicite Layer-B, hash d'entrée SHA-256, conscience TTL 5 min.
- **Hook PreToolUse `budget-enforcer`** — applique surcharges de niveau, plafonds durs, portes de spawn paresseuses depuis `.design/budget.json`.
- **Télémétrie de coût par spawn** — les lignes `.design/telemetry/costs.jsonl` alimentent les recommandations basées sur règles de `/gdd:optimize`.

Vise une réduction de coût de 50–70% par tâche sans régression de qualité.

---

## Commandes

### Pipeline principal

| Commande | Rôle |
|----------|------|
| `/gdd:brief` | Étape 1 — capturer le brief de design |
| `/gdd:explore` | Étape 2 — inventaire codebase + entretien |
| `/gdd:plan` | Étape 3 — produire DESIGN-PLAN.md |
| `/gdd:design` | Étape 4 — exécuter par vagues |
| `/gdd:verify` | Étape 5 — vérifier par rapport au brief |
| `/gdd:ship` | Générer une PR branche propre |
| `/gdd:next` | Routage auto vers la prochaine étape selon STATE.md |
| `/gdd:do <text>` | Routeur en langage naturel |
| `/gdd:fast <text>` | Correction triviale one-shot, sans pipeline |
| `/gdd:quick` | Tâche ad-hoc avec garanties GDD mais portes optionnelles sautées |

### Premier lancement + onboarding

| Commande | Rôle |
|----------|------|
| `/gdd:start` | Parcours de preuve premier-lancement — top 3 problèmes de design |
| `/gdd:new-project` | Initialiser un projet GDD |
| `/gdd:connections` | Assistant d'onboarding pour les 12 intégrations externes |

### Cycle de vie

| Commande | Rôle |
|----------|------|
| `/gdd:new-cycle` | Nouveau cycle de design |
| `/gdd:complete-cycle` | Archiver les artefacts du cycle + EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | Checkpoints numérotés |
| `/gdd:continue` | Alias pour `/gdd:resume` |
| `/gdd:timeline` | Rétrospective narrative à travers cycles + git log |

### Itération + décisions

| Commande | Rôle |
|----------|------|
| `/gdd:discuss [topic]` | Entretien de design adaptatif |
| `/gdd:list-assumptions` | Faire émerger les hypothèses cachées avant le plan |
| `/gdd:sketch [idea]` | Maquettes HTML multi-variantes |
| `/gdd:spike [idea]` | Expérience de faisabilité timeboxée |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | Empaqueter les findings en skill local |
| `/gdd:audit` | Wrapper verify + audit + reflector |
| `/gdd:reflect` | Lancer le reflector à la demande |
| `/gdd:apply-reflections` | Examiner et appliquer sélectivement les propositions |

### Mémoire + couche de connaissances

| Commande | Rôle |
|----------|------|
| `/gdd:recall <query>` | Recherche FTS5 |
| `/gdd:extract-learnings` | Extraire patterns/décisions/leçons |
| `/gdd:note <text>` | Capture d'idée sans friction |
| `/gdd:plant-seed <idea>` | Idée prospective avec condition de déclenchement |
| `/gdd:analyze-dependencies` | Token fan-out, call-graphs, traçabilité de décisions |
| `/gdd:skill-manifest` | Lister tous les skills et agents GDD |
| `/gdd:graphify` | Construire/interroger/diff le graphe de connaissances |
| `/gdd:watch-authorities` | Diff du whitelist de feeds d'autorité |

### Connexions

| Commande | Rôle |
|----------|------|
| `/gdd:figma-write` | Écrire les décisions de design dans Figma |
| `/gdd:handoff <bundle>` | Importer un bundle Claude Design |
| `/gdd:darkmode` | Auditer l'implémentation dark-mode |
| `/gdd:compare` | Calculer le delta DESIGN.md vs DESIGN-VERIFICATION.md |
| `/gdd:style <Component>` | Générer un doc de handoff de composant |

### Diagnostic + forensique

| Commande | Rôle |
|----------|------|
| `/gdd:scan` | Inventaire design system codebase |
| `/gdd:map` | 5 mappers codebase parallèles |
| `/gdd:debug [desc]` | Investigation design pilotée par symptômes |
| `/gdd:health` | Rapport de santé des artefacts `.design/` |
| `/gdd:progress` | Position dans le pipeline |
| `/gdd:stats` | Statistiques de cycle |
| `/gdd:optimize` | Analyse de coût basée sur règles |
| `/gdd:warm-cache` | Préchauffer le cache Anthropic |

### Distribution + mise à jour

| Commande | Rôle |
|----------|------|
| `/gdd:update` | Mettre à jour GDD avec preview du changelog |
| `/gdd:reapply-patches` | Re-stitcher les modifs locales `reference/` |
| `/gdd:check-update` | Vérification manuelle de mise à jour |
| `/gdd:settings` | Configurer `.design/config.json` |
| `/gdd:set-profile <profile>` | Basculer le profil de modèle |
| `/gdd:undo` | Revert sécurisé de changement de design |
| `/gdd:pr-branch` | PR branche propre |

### Backlog + notes

| Commande | Rôle |
|----------|------|
| `/gdd:todo` | Ajouter / lister / choisir des tâches de design |
| `/gdd:add-backlog <idea>` | Garer une idée pour un cycle futur |
| `/gdd:review-backlog` | Examiner les éléments garés |

### Aide

| Commande | Rôle |
|----------|------|
| `/gdd:help` | Liste complète des commandes et usage |
| `/gdd:bandit-reset` | Réinitialiser le postérieur de la couche adaptative à la sortie d'un nouveau modèle Anthropic |

---

## Connexions

GDD livre 12 connexions d'outils. Toutes optionnelles. Configurer avec `/gdd:connections`.

| Connexion | Objectif | Sonde |
|-----------|----------|-------|
| **Figma** | Lire tokens, composants, screenshots ; écrire annotations, Code Connect, statut d'implémentation | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | Recherche de références de design | `mcp__refero__search` |
| **Pinterest** | Référence visuelle pour brand voice + style | OAuth + MCP |
| **Claude Design** | Import de bundle de handoff | URL ou fichier local |
| **Storybook** | Recherche de spécifications composant au port 6006 | Sonde HTTP |
| **Chromatic** | Diff de baseline de régression visuelle | Clé API |
| **Preview** | Screenshots runtime Playwright + Claude Preview MCP | `mcp__Claude_Preview__preview_*` |
| **paper.design** | Lecture/écriture canvas MCP | `mcp__paper__use_paper` |
| **pencil.dev** | Spécifications `.pen` suivies par git | Fichiers `.pen` dans le repo |
| **Graphify** | Export de graphe de connaissances | `mcp__graphify__*` |
| **21st.dev Magic** | Recherche de précédents avant greenfield | `mcp__magic__search` |
| **Magic Patterns** | Génération de composants DS-aware | `mcp__magic-patterns__generate` |

Détails complets dans [`connections/connections.md`](connections/connections.md).

---

## Configuration

GDD stocke les paramètres projet dans `.design/config.json`. Configurer pendant `/gdd:new-project` ou mettre à jour avec `/gdd:settings`.

### Profils de modèle

| Profil | Planning | Exécution | Vérification |
|--------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (par défaut) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

```
/gdd:set-profile budget
```

### Mode adaptatif

Échelle `.design/budget.json#adaptive_mode` (v1.23.5) :

| Mode | Rôle |
|------|------|
| `static` (par défaut) | Comportement Phase 10.1 |
| `hedge` | Ensemble AdaNormalHedge + reranking MMR engagés. Introduction la plus sûre. |
| `full` | Routeur bandit + Hedge + MMR tous actifs |

### Parallélisme

| Paramètre | Défaut | Contrôle |
|-----------|--------|----------|
| `parallelism.enabled` | `true` | Exécuter les tâches indépendantes en worktrees |
| `parallelism.min_estimated_savings_seconds` | `30` | Sauter la parallélisation sous ce seuil |
| `parallelism.max_concurrent_workers` | `4` | Plafond dur sur les workers simultanés |

### Portes de qualité

| Paramètre | Défaut | Contrôle |
|-----------|--------|----------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` |
| `solidify.commands` | autodetect | Surcharger commandes typecheck / build / test |
| `verify.iterations_max` | `3` | Plafond de la boucle verify→fix |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` |

---

## Sécurité

### Durcissement intégré

GDD livre une défense en profondeur depuis la Phase 14.5 :

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash bloque ~50 motifs dangereux après normalisation Unicode NFKC + ANSI.
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash applique la liste glob `protected_paths`.
- **`hooks/gdd-read-injection-scanner.ts`** — scanne le contenu Read entrant pour Unicode invisible, commentaires HTML, motifs d'exfiltration de secrets.
- **`scripts/lib/blast-radius.cjs`** — préflight de `design-executor` refuse les tâches au-dessus de `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** — coupe les boucles de timeout consécutifs sur `use_figma` / `use_paper` / `use_pencil`.

### Protéger les fichiers sensibles

Ajoutez les chemins sensibles à la deny list de votre runtime :

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
> Comme GDD génère des fichiers markdown qui deviennent des prompts système LLM, tout texte contrôlé par l'utilisateur qui s'écoule dans les artefacts `.design/` est un vecteur potentiel d'injection de prompt indirecte. Le scanner d'injection attrape de tels vecteurs à plusieurs couches — mais la défense en profondeur reste la meilleure pratique.

---

## Dépannage

**Commandes introuvables après installation ?**
- Redémarrez votre runtime
- Vérifiez `~/.claude/skills/get-design-done/` (global) ou `./.claude/skills/get-design-done/` (local)
- Lancez `/gdd:help` pour confirmer l'enregistrement

**Pipeline bloqué en milieu d'étape ?**
- `/gdd:resume` — restaurer depuis le dernier checkpoint numéroté
- `/gdd:health` — diagnostiquer les problèmes d'artefacts `.design/`
- `/gdd:progress --forensic` — audit d'intégrité 6 vérifications

**Dépassement de coût ?**
- `/gdd:optimize` — recommandations basées sur règles
- `/gdd:set-profile budget` — basculer en niveau budget
- Définissez `adaptive_mode: "full"` dans `.design/budget.json` — le bandit apprendra

**Mise à jour vers la dernière version ?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / conteneurs ?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Désinstallation

```bash
# Désinstallation globale (par runtime)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... même pattern --<runtime> --global --uninstall pour les 14 runtimes

# Désinstallation interactive multi-sélection (sans flag de runtime)
npx @hegemonart/get-design-done --uninstall

# Désinstallation locale
npx @hegemonart/get-design-done --claude --local --uninstall
# ... avec flag --local
```

Supprime toutes les commandes, agents, hooks et paramètres GDD tout en préservant vos autres configurations.

---

## Licence

Licence MIT. Voir [LICENSE](LICENSE) pour les détails.

---

<div align="center">

**Claude Code livre du code. Get Design Done garantit qu'il livre aussi le design.**

</div>
