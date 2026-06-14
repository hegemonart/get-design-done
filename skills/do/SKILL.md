---
name: hone-do
description: "Natural-language design task router. Parses your intent, maps to the right gdd command(s), confirms before executing. Activates for requests involving a natural-language design request, routing intent to the right command, or not knowing which skill to use."
argument-hint: "<natural language description>"
tools: Read, Write, AskUserQuestion
---

# /hone:do

Takes a free-form description, maps it to a `/hone:*` command, confirms with the user, then routes.

## Intent parsing table

| Intent signals | Maps to |
|---|---|
| "explore", "scan", "what design patterns", "what components" | `/hone:explore` |
| "discuss", "decide", "what should we use for", "help me decide" | `/hone:discuss` |
| "plan", "create tasks", "what tasks do we need" | `/hone:plan` |
| "design", "implement", "build", "execute" | `/hone:design` |
| "verify", "check", "audit", "review" | `/hone:audit` |
| "sketch", "explore directions", "try designs", "variant" | `/hone:sketch` |
| "spike", "experiment", "feasibility", "test if" | `/hone:spike` |
| "fix [specific thing]" | `/hone:fast` |
| "pause", "stop", "save my place" | `/hone:pause` |
| "resume", "pick back up", "continue where I left off" | `/hone:resume` |
| "ship", "PR", "submit", "merge" | `/hone:ship` |
| "undo", "revert", "roll back" | `/hone:undo` |

## Steps

1. Parse the argument text. Match it against the intent signals table. Choose the best fit.
2. If two intents tie, ask (AskUserQuestion): "Did you mean <option A> or <option B>?"
3. Print the routing decision in this exact shape:
   ```
   I'll run `/hone:<command>` — "<one-line rationale>". Confirm? (yes/no)
   ```
4. On confirmation: invoke the target skill with any parameters extracted from the input (e.g., topic for `discuss`, symptom for `debug`).
5. On rejection: ask "What did you mean instead?" and retry once, then abort gracefully.

## Do Not

- Do not execute the target command without confirmation.
- Do not invent new commands - if no intent matches, say so and list the closest options.

## DO COMPLETE
