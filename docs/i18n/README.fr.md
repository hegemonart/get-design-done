<div align="center">

# Hone

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Français** · [Italiano](README.it.md) · [Deutsch](README.de.md)

> Remarque : cette traduction peut être en retard sur la version anglaise. La version de référence est [README.md](../../README.md) (translation may lag behind English; see README.md for the canonical version).

**Un pipeline de qualité design pour agents de code IA : brief -> exploration -> plan -> design -> vérification.**

**Hone garde l'UI générée par IA liée à votre brief, votre design system, votre connaissance design locale et vos quality gates. Conçu pour Claude Code, et s'installe sur Codex, Cursor, Gemini, OpenCode, Copilot, Windsurf, et plus encore.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/hone/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/hone/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/hone?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/hone)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx hone
```

> **Renommé depuis get-design-done (gdd).** Les installations existantes continuent de fonctionner : l'alias déprécié `/gdd:` reste disponible 1 à 2 versions. `npx hone` est la nouvelle installation ; `@hegemonart/get-design-done` est déprécié sur npm au profit de `@hegemonart/hone`. _(La traduction peut être en retard sur le README anglais.)_

**Fonctionne sur macOS, Linux et Windows.**

[Installation](#installation) · [Démarrage rapide](#démarrage-rapide) · [Cas d'usage](#cas-dusage) · [Comment ça marche](#comment-ça-marche) · [Commandes](#commandes) · [Connexions](#connexions) · [Sécurité](#sécurité-et-confidentialité)

</div>

---

## Ce que c'est

Hone aide les agents de code IA à livrer une UI qui a sa place dans votre produit.

Il transforme des demandes vagues comme « améliore cet écran » en un workflow design traçable : brief, exploration, plan, design, vérification.

Au lieu de demander à un agent d'improviser sur le seul bon goût, Hone lui donne un processus structuré, une connaissance design locale, une mémoire spécifique au projet, des connexions optionnelles aux outils de design, et une vérification avant que le travail ne soit livré.

## Pourquoi ça existe

Les agents IA sont rapides pour produire de l'UI. Le difficile, c'est de rendre cette UI cohérente.

Sans workflow design, les interfaces générées dérivent :

- les couleurs et les espacements cessent de correspondre au système
- les composants sont réinventés
- le contraste et l'accessibilité régressent
- la hiérarchie change d'un écran à l'autre
- l'implémentation ne correspond plus au brief initial

Hone ajoute la discipline design manquante autour des workflows de code IA. Il capture le problème, cartographie le design system actuel, planifie des changements cadrés, les exécute par étapes atomiques, et vérifie le résultat par rapport au brief, aux tokens, à l'accessibilité et aux rubriques de qualité design.

En coulisses : 64 agents spécialisés, un intel store interrogeable, du routage de modèle par tier, et 39 connexions d'outils optionnelles. Au quotidien, vous utilisez une poignée de commandes `/hone:*`.

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

Parcourez et installez Hone depuis le registre de skills [agentskills.io](https://agentskills.io).

### Installeur de runtime direct

```bash
# Claude Code
npx @hegemonart/hone --claude --global
npx @hegemonart/hone --claude --local

# Autres runtimes
npx @hegemonart/hone --codex --global
npx @hegemonart/hone --cursor --global
npx @hegemonart/hone --gemini --global

# Installation multi-runtime
npx @hegemonart/hone --all --global

# Aperçu sans écriture
npx @hegemonart/hone --dry-run
```

## Démarrage rapide

Lancez une première passe légère :

```bash
/hone:start
```

Ou exécutez le cycle de design complet :

```bash
/hone:brief
/hone:explore
/hone:plan
/hone:design
/hone:verify
```

Pour un routage en langage naturel :

```bash
/hone:do improve the checkout page hierarchy, spacing, and empty states
```

## Cas d'usage

### Améliorer un écran existant

Utilisez Hone quand un écran fonctionne techniquement mais semble visuellement incohérent, peu clair ou sous-conçu.

```bash
/hone:do improve the settings page layout and component hierarchy
```

### Ramener la sortie IA vers le design system

Utilisez-le quand un agent a généré une UI qui paraît plausible mais ne correspond pas à vos tokens, espacements, états ou composants.

```bash
/hone:verify
```

### Auditer avant l'expédition

Lancez la vérification avant une PR, une release ou un handoff design.

```bash
/hone:audit
```

### Corriger le dark mode

```bash
/hone:darkmode
```

### Importer un handoff design

```bash
/hone:handoff ./my-design.html
```

Ceci parse un bundle Claude Design, extrait les propriétés CSS personnalisées en décisions de design, et exécute les vérifications de fidélité du handoff.

### Faire une petite correction ciblée

```bash
/hone:fast "fix contrast in pricing cards"
```

## Ce qui le rend différent

### Connaissance design locale

Hone est livré avec une bibliothèque de référence locale étendue pour le travail de design. Les agents peuvent l'utiliser sans dépendre d'une recherche web en direct pour le jugement design de base.

Elle couvre l'accessibilité, WCAG, la typographie, les espacements, les grilles, la couleur, le contraste, les surfaces, la motion, l'UX writing, les formulaires, les états vides, la hiérarchie visuelle, le dark mode, le comportement responsive, l'i18n, les méthodes de recherche, le scoring d'audit et les anti-patterns design.

L'agent ne part pas d'un prompt vierge. Il dispose d'un vocabulaire design partagé et de standards concrets qu'il peut appliquer pendant le planning, l'implémentation et la vérification.

Carte complète : [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### Mémoire spécifique au projet

Hone crée un espace de travail `.design/` qui ancre chaque cycle :

| Artefact | Rôle |
| --- | --- |
| `.design/BRIEF.md` | Problème, audience, scope, métriques de succès |
| `.design/DESIGN.md` | Snapshot du design system actuel |
| `.design/DESIGN-CONTEXT.md` | Décisions, contraintes, références |
| `.design/DESIGN-PLAN.md` | Plan d'implémentation atomique |
| `.design/DESIGN-VERIFICATION.md` | Audit final et rapport de gaps |
| `.design/intel/` | Connaissance projet interrogeable : tokens, composants, relations, décisions |
| `.design/archive/` | Historique des cycles terminés et apprentissages |

Plus vous l'utilisez longtemps, moins l'agent a à redécouvrir.

### Vérification avant l'expédition

Hone ne s'arrête pas quand l'UI « a l'air finie ».

L'étape de vérification contrôle si le résultat correspond toujours :

- au brief initial
- aux tokens du design system
- aux seuils d'accessibilité
- aux conventions de composants
- à la hiérarchie visuelle
- aux règles de motion et d'interaction
- aux décisions de design enregistrées

Quand des gaps apparaissent, Hone produit une liste de corrections structurée au lieu de laisser la review au feeling.

### Tests de comportement des skills

Les propres skills de Hone sont éprouvés sous des scénarios de pression adverse (pression temporelle, coût irrécupérable, autorité, minimisation du scope) pour confirmer qu'ils tiennent leur discipline plutôt que de céder. Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour savoir comment ajouter un scénario de pression.

## Comment ça marche

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| Étape | Commande | Sortie |
| --- | --- | --- |
| Brief | `/hone:brief` | Capture le problème de design |
| Explore | `/hone:explore` | Cartographie le système UI, la dette, les tokens, les composants |
| Plan | `/hone:plan` | Crée des tâches design atomiques |
| Design | `/hone:design` | Exécute les tâches avec validation |
| Verify | `/hone:verify` | Audite le résultat final |

### Sorties principales

| Fichier | Ce qu'il fait |
| --- | --- |
| `.design/BRIEF.md` | Le problème, l'audience, les métriques de succès du cycle |
| `.design/DESIGN.md` | Snapshot du design system actuel |
| `.design/DESIGN-CONTEXT.md` | Décisions et contraintes de design |
| `.design/DESIGN-PLAN.md` | Tâches atomiques, vagues, dépendances |
| `.design/DESIGN-VERIFICATION.md` | Résultat de vérification et liste de gaps |
| `.design/intel/` | Couche de connaissances interrogeable pour ce projet |

## Commandes

Hone livre 96 skills. Voici ceux dont la plupart des utilisateurs ont besoin au quotidien. Pour la référence complète, voir [SKILL.md](SKILL.md).

### Pipeline principal

| Commande | Rôle |
| --- | --- |
| `/hone:brief` | Capturer le brief de design |
| `/hone:explore` | Inventorier le système UI actuel |
| `/hone:plan` | Produire le plan de design |
| `/hone:design` | Exécuter le plan |
| `/hone:verify` | Vérifier le résultat |
| `/hone:ship` | Préparer une branche PR propre |
| `/hone:next` | Router automatiquement vers l'étape suivante |

### Usage quotidien

| Commande | Rôle |
| --- | --- |
| `/hone:do <task>` | Routeur en langage naturel |
| `/hone:fast <task>` | Correction ciblée légère |
| `/hone:quick` | Flux de tâche léger |
| `/hone:audit` | Audit de qualité design |
| `/hone:darkmode` | Audit du dark mode |
| `/hone:style <component>` | Handoff de style de composant |
| `/hone:health` | Diagnostiquer l'état du pipeline |
| `/hone:progress` | Afficher la progression du cycle actuel |
| `/hone:resume` | Reprendre depuis un checkpoint |

### Outils de design et handoff

| Commande | Rôle |
| --- | --- |
| `/hone:connections` | Configurer les intégrations optionnelles |
| `/hone:figma-extract` | Extraire le contexte design system de Figma |
| `/hone:figma-write` | Réécrire les décisions et le statut dans Figma |
| `/hone:handoff <bundle>` | Importer un bundle Claude Design |
| `/hone:sketch <idea>` | Générer des maquettes HTML multi-variantes |
| `/hone:spike <idea>` | Passe de faisabilité timeboxée |

Référence complète des commandes : [SKILL.md](SKILL.md)

## Connexions

Hone fonctionne sans outils externes, mais peut se connecter à 39 intégrations optionnelles. Toutes sont optionnelles ; le pipeline dégrade gracieusement vers des fallbacks quand une connexion est indisponible.

La couche de connexion couvre ces catégories :

- **Surfaces de design** - Figma (lecture + écriture + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **Référence et recherche** - Refero, Pinterest, Lazyweb, Mobbin, handoff Claude Design
- **Génération de composants** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **Spécification de composants et QA visuelle** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **Graphe de connaissances** - Graphify
- **Sortie native et non-web** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, moteur de rendu print
- **Vérification de motion** - Lottie, Rive
- **Surfaces d'équipe** - Slack, Discord, Linear, Jira, Notion, PR GitHub

Configurez les intégrations avec :

```bash
/hone:connections
```

Pour la liste complète des connexions avec leurs motifs de sonde, voir [connections/connections.md](connections/connections.md).

## Prérequis

- Node.js 22 ou 24
- Git
- Un runtime de code IA supporté

## Support multi-runtime

Hone s'installe sur 14 runtimes de code IA : Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Kilo, Copilot, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy et Cline. Les mêmes skills et agents sources sont compilés vers la disposition native de chaque runtime (`skills/`, `command/`, `agents/`, ou `.clinerules`) par des convertisseurs propres à chaque runtime, de sorte que le pipeline vous suit d'un éditeur à l'autre.

Claude Code est le produit phare. L'expérience complète s'y déroule de bout en bout : chaque agent, les hooks de défense en profondeur et les connexions adossées à MCP. Sur les autres runtimes, vous obtenez les mêmes skills et agents dans leur forme native, les connexions adossées à MCP s'activent sur les hôtes compatibles MCP, et la couche de hooks est spécifique à Claude Code.

## Sécurité et confidentialité

Hone est local-first par défaut. Il écrit les artefacts du projet sous `.design/`, n'utilise les intégrations optionnelles que lorsqu'elles sont configurées, et garde le signalement de problèmes soumis au consentement.

Le plugin inclut des hooks de défense en profondeur pour les chemins protégés, le blocage de commandes dangereuses, le scan d'injection, le circuit breaking MCP et l'application des budgets. Hone expose également 13 outils MCP en lecture seule pour une introspection sûre du projet.

Ajoutez les chemins sensibles à la deny list de votre runtime :

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

À lire : [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## Mise à jour

```bash
npx hone
```

Ou depuis Claude Code :

```bash
/hone:update
```

Pour l'historique complet des releases, voir [CHANGELOG.md](CHANGELOG.md).

## Dépannage

### Les commandes n'apparaissent pas

Redémarrez votre runtime et lancez :

```bash
/hone:help
```

### Le pipeline est bloqué

```bash
/hone:health
/hone:resume
```

### Le coût est trop élevé

```bash
/hone:optimize
```

## Contribuer

```bash
npm install
npm test
npm run typecheck
```

À lire : [CONTRIBUTING.md](CONTRIBUTING.md)

## Licence

Licence MIT. Voir [LICENSE](LICENSE) pour les détails. Les attributions tierces sont listées dans [NOTICE](NOTICE).

---

<div align="center">

**Claude Code livre du code. Hone garantit qu'il livre aussi le design.**

</div>
