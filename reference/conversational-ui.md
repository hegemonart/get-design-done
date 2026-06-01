# Conversational UI Design Patterns

This pack covers conversational interfaces in two modes: **voice flows** (IVR, smart-speaker skills/actions, voice assistants) and **chatbot / text assistants** (in-app chat, support bots, LLM-backed copilots). GDD's design-context-builder loads this reference when it detects a conversational or voice project so downstream design and audit stages share a vocabulary. CLI / REPL / terminal UX is explicitly out of scope for this pack — those follow a different interaction model and have their own conventions.

The guidance below leans on established authorities: Google's Conversation Design guidelines, the Amazon Alexa Design Guide, and Nielsen Norman Group's research on chatbots and conversational interfaces.

## Voice-flow patterns

A voice flow is more than its happy path. The happy path is the shortest successful route (user states a complete, in-scope request; system confirms and acts). Design quality lives in the branches around it.

| Branch | Trigger | Pattern |
|--------|---------|---------|
| No-input (NID) | User says nothing within the listen window | Escalating reprompts: 1st is a light nudge ("Which city?"), 2nd adds an example ("For example, say Berlin."), 3rd offers help or hands off. Never repeat the same words. |
| No-match (NM) | Speech recognized but no intent matched | Reflect what was heard, narrow the ask, give an example. After repeated NM, escalate to options or a human. |
| Confirmation | Action is risky, costly, or irreversible | See implicit vs explicit below. |
| Barge-in | User speaks over the prompt | Allow it — stop TTS immediately and listen. Disable only for legally required disclosures. |
| Hand-off | N consecutive failures (typically 2-3) | Route to a human, a visual fallback, or a clear "let's try later." Track the failure count across turns. |

**One-breath confirmation.** Confirm in a single short clause that the user can absorb in one breath: "Two tickets for Friday — booking now." Avoid reading back every slot verbatim; that is robotic and slow.

**Implicit vs explicit confirmation.**
- *Implicit* — fold the understood value into the next prompt ("Friday — what time?"). Use for low-risk, easily-reversed actions. It keeps the dialogue moving.
- *Explicit* — require a yes/no ("Send $200 to Sam — confirm?"). Reserve for irreversible, costly, or destructive actions (payments, deletes, sends).

**Failure escalation.** Each successive reprompt should add information (an example, then a menu, then a human). Three strikes is a common ceiling — after that, stop asking and offer an exit. A dead end ("Sorry, goodbye.") is a design failure.

## Multi-turn dialogue rules

Multi-turn dialogue is where conversational UIs earn their name. The core obligation: remember context so the user speaks like a human, not a form.

- **Context carryover (anaphora).** Resolve references to prior turns. After "Weather in Paris?", the user says "What about tomorrow?" or "And Rome?" — carry the unstated slots (location, intent) forward. Failing this forces the user to repeat themselves and breaks the illusion of conversation.
- **Turn-taking.** Make it unambiguous whose turn it is. In voice, an earcon or a brief pause signals "your turn." In chat, a typing indicator signals the assistant is composing. Never leave the user unsure whether to speak/type.
- **Disambiguation.** When input matches more than one intent or entity, ask a tight either/or ("Did you mean the 9am or the 9pm flight?") rather than restarting. Offer at most 2-3 options by voice.
- **Slot-filling + validation.** Collect required slots one at a time when missing, but accept them all at once when volunteered ("Book a 7pm table for four" fills time + party size in one turn). Validate each slot against real constraints (date in the future, party size within limits) and reprompt only the invalid slot, not the whole request.
- **Repair.** Support correction mid-flow: "No, I said *four*, not *forty*." Detect the correction marker ("no", "I meant", "actually") and overwrite the targeted slot without discarding the rest of the context.
- **Don't over-ask.** Never re-confirm what is already certain. If the user said "tomorrow at noon," do not ask "what day?" again. Over-asking is the most common way a multi-turn flow feels broken.

## Prompt-as-UX (system prompts as design artifacts)

For LLM-backed assistants, the `system-prompt` is a design artifact, not config. It defines the assistant's persona, tone, scope, and boundaries — and those ARE the user experience. Treat it accordingly.

- **Persona and voice are design decisions.** Warmth, formality, verbosity, use of humor, first-person vs neutral — these are chosen, documented, and kept consistent across every turn. A persona that drifts mid-conversation reads as broken.
- **The prompt is the spec for behavior.** What the assistant will and won't do, how it greets, how it refuses, how it asks for clarification — all of it is specified in the prompt. Downstream copy and flows must match it.
- **Version and review it like production copy.** The `system-prompt` belongs in source control, with diffs reviewed by design/content the same way UI strings are. A wording change to a refusal message is a UX change.
- **Refusal and limits messaging.** When the assistant can't or won't help, the decline should be in-voice, specific, and ideally redirect ("I can't process refunds here, but I can show you the refund form."). A blunt "I cannot do that" is a UX bug.
- **Consistency of voice.** Error states, confirmations, empty states, and refusals must all sound like the same persona. Audit them together, not in isolation.

## Chatbot empty-states and entry

The opening message is the chatbot's most important screen. It does the work an empty form can't: it sets scope and teaches capability.

- **The opener states scope + capability.** "Hi — I can track orders, start a return, or check store hours. What do you need?" tells the user what's in bounds before they guess wrong. Vague openers ("How can I help?") invite out-of-scope requests the bot then fails.
- **Suggested-reply chips.** Offer 2-4 tappable starter prompts that double as a capability menu. They remove the cold-start guess and demonstrate the input format.
- **Discoverability of commands.** If the bot supports commands or shortcuts, surface them (a menu, a persistent "Help" affordance, or a slash-command hint). Hidden capabilities don't exist to users.
- **Avoid the blank-box-no-affordance trap.** A bare text input with a blinking cursor and no guidance is the #1 chatbot empty-state failure (NN/g). Always pair the input with scope-setting copy and/or chips.
- **Re-entry and history.** On return, remind the user where they left off or what the bot does — don't assume they remember the opener from last session.

## Voice-first onboarding

Voice-first surfaces (smart speakers, headless assistants) onboard without a screen, which makes discoverability the central challenge.

- **Teach invocation.** Make the wake phrase / invocation name explicit early ("Just say 'Ask Acme to…'"). Users can't use what they can't name.
- **Teach capability by example.** Replace abstract menus with concrete sample utterances: "You can say 'add milk to my list' or 'what's on my list?'" The "you can say…" pattern is the canonical voice-discoverability tool.
- **Progressive disclosure.** Don't dump every feature in the first session. Reveal capabilities over time, contextually, as the user's needs surface.
- **Earcons and audio feedback.** Use short, distinct audio cues to mark state — listening, processing, success, error. Audio is the only "UI" the user has; consistent earcons replace visual affordances.
- **Confirm understanding audibly.** Because there's no screen to glance at, brief spoken confirmations carry the load that visual feedback would in a GUI.

## Error recovery in voice flows

Recovery is the difference between a usable voice product and an abandoned one. The guiding rule: **never a dead end.**

- **Graceful degradation.** When confidence is low, narrow rather than fail — fall back from open prompt to a menu, from a menu to yes/no, from voice to a visual/text fallback if a screen is available.
- **Rapid, varied reprompts.** Reprompt quickly and change the wording each time. Repeating the identical prompt is the fastest way to frustrate.
- **Offer alternatives.** "I couldn't find that. Want me to search nearby instead?" keeps momentum and gives the user a next move.
- **Escalate to human / visual fallback.** After N failed turns, route to a person, send a link to a phone/companion screen, or switch channels. Honor explicit "talk to a person" requests immediately.
- **Accessibility.** Provide captions and transcripts for voice interactions; ensure chat is screen-reader-friendly with proper roles, focus management, and announced new messages. Don't gate critical actions behind audio-only or visual-only cues — offer both paths.

## Detection signals

The design-context-builder classifies a project as conversational when it sees these signals.

**Keywords (in README, package name, docs, route/handler names):** chatbot, conversational, voice, assistant, dialogue, IVR, utterance, intent, skill, action, slot, prompt, agent, NLU.

**`package.json` dependencies:**

| Dependency | Platform |
|------------|----------|
| `botpress` / `@botpress/...` | Botpress conversational platform |
| `rasa` / `@rasa/...` | Rasa NLU / dialogue (often a Python sibling service) |
| `dialogflow` / `@google-cloud/dialogflow` | Google Dialogflow NLU |
| `actions-on-google` | Google Assistant actions |
| `ask-sdk-core` | Amazon Alexa skills |
| `botframework-webchat` / `@microsoft/botframework-*` | Microsoft Bot Framework |

Presence of any of these deps is a strong signal; keyword matches add weight. A `system-prompt` / persona file plus an LLM SDK also indicates a text assistant even without the platform deps above.

## Audit checklist

1. Every voice flow handles **no-input (NID)** and **no-match (NM)** with escalating reprompts that add help each time — never a dead end.
2. Risky, costly, or irreversible actions use **explicit confirmation**; low-risk actions use implicit confirmation and don't over-confirm.
3. **Barge-in** is allowed on standard prompts (TTS stops and listening resumes immediately), disabled only where legally required.
4. Voice flows offer a **human / visual fallback after N failed turns** (typically 2-3) and honor explicit "talk to a person" requests.
5. **Multi-turn context carries over** (anaphora resolved) so the user isn't forced to repeat slots already provided.
6. **Slot validation** reprompts only the invalid slot and accepts multiple slots when volunteered in one turn.
7. **Repair** is supported — corrections ("no, I said…") overwrite the targeted slot without losing surrounding context.
8. The **`system-prompt` persona** (tone, scope, boundaries) is versioned and reviewed like production copy, and its voice is consistent across confirmations, errors, and refusals.
9. **Refusal / limits messaging** is in-voice, specific, and redirects to an alternative rather than a blunt decline.
10. The **chatbot opener states scope + capability** and offers suggested-reply chips; no blank-box-without-affordance entry state.
11. **Voice-first onboarding** teaches invocation and capabilities by example ("you can say…") with consistent earcons for state.
12. **Transcripts / captions** exist for voice, and chat is screen-reader-friendly (announced messages, focus management, dual audio/visual paths).
