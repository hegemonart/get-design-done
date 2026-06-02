---
name: gdd-do
description: "Natural-language design task router. Parses your intent, maps to the right gdd command(s), confirms before executing."
argument-hint: "<natural language description>"
tools: Read, Write, AskUserQuestion
---

# /gdd:do

Takes a free-form description, maps it to a `/gdd:*` command, confirms with the user, then routes.

## Intent parsing table

| Intent signals | Maps to |
|---|---|
| "explore", "scan", "what design patterns", "what components" | `/gdd:explore` |
| "discuss", "decide", "what should we use for", "help me decide" | `/gdd:discuss` |
| "plan", "create tasks", "what tasks do we need" | `@get-design-done plan` |
| "design", "implement", "build", "execute" | `@get-design-done design` |
| "verify", "check", "audit", "review" | `/gdd:audit` |
| "sketch", "explore directions", "try designs", "variant" | `/gdd:sketch` |
| "spike", "experiment", "feasibility", "test if" | `/gdd:spike` |
| "fix [specific thing]" | `/gdd:fast` |
| "pause", "stop", "save my place" | `/gdd:pause` |
| "resume", "pick back up", "continue where I left off" | `/gdd:resume` |
| "ship", "PR", "submit", "merge" | `/gdd:ship` |
| "undo", "revert", "roll back" | `/gdd:undo` |

## Steps

1. Parse the argument text. Match it against the intent signals table. Choose the best fit.
2. If two intents tie, ask (AskUserQuestion): "Did you mean <option A> or <option B>?"
3. Print the routing decision in this exact shape:
   ```
   I'll run `/gdd:<command>` — "<one-line rationale>". Confirm? (yes/no)
   ```
4. On confirmation: invoke the target skill with any parameters extracted from the input (e.g., topic for `discuss`, symptom for `debug`).
5. On rejection: ask "What did you mean instead?" and retry once, then abort gracefully.

## Do Not

- Do not execute the target command without confirmation.
- Do not invent new commands — if no intent matches, say so and list the closest options.

## DO COMPLETE
