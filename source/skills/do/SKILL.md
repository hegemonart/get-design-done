---
name: gdd-do
description: "Natural-language design task router. Parses your intent, maps to the right gdd command(s), confirms before executing."
argument-hint: "<natural language description>"
tools: Read, Write, AskUserQuestion
---

# {{command_prefix}}do

Takes a free-form description, maps it to a `{{command_prefix}}*` command, confirms with the user, then routes.

## Intent parsing table

| Intent signals | Maps to |
|---|---|
| "explore", "scan", "what design patterns", "what components" | `{{command_prefix}}explore` |
| "discuss", "decide", "what should we use for", "help me decide" | `{{command_prefix}}discuss` |
| "plan", "create tasks", "what tasks do we need" | `@get-design-done plan` |
| "design", "implement", "build", "execute" | `@get-design-done design` |
| "verify", "check", "audit", "review" | `{{command_prefix}}audit` |
| "sketch", "explore directions", "try designs", "variant" | `{{command_prefix}}sketch` |
| "spike", "experiment", "feasibility", "test if" | `{{command_prefix}}spike` |
| "fix [specific thing]" | `{{command_prefix}}fast` |
| "pause", "stop", "save my place" | `{{command_prefix}}pause` |
| "resume", "pick back up", "continue where I left off" | `{{command_prefix}}resume` |
| "ship", "PR", "submit", "merge" | `{{command_prefix}}ship` |
| "undo", "revert", "roll back" | `{{command_prefix}}undo` |

## Steps

1. Parse the argument text. Match it against the intent signals table. Choose the best fit.
2. If two intents tie, ask (AskUserQuestion): "Did you mean <option A> or <option B>?"
3. Print the routing decision in this exact shape:
   ```
   I'll run `{{command_prefix}}<command>` — "<one-line rationale>". Confirm? (yes/no)
   ```
4. On confirmation: invoke the target skill with any parameters extracted from the input (e.g., topic for `discuss`, symptom for `debug`).
5. On rejection: ask "What did you mean instead?" and retry once, then abort gracefully.

## Do Not

- Do not execute the target command without confirmation.
- Do not invent new commands - if no intent matches, say so and list the closest options.

## DO COMPLETE
