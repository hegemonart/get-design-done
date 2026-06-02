# Healthcare & Clinical Design Patterns

This pack covers domain-specific UI/UX patterns for healthcare, clinical, and EHR/EMR software: HIPAA-aware forms, audit-trail surfaces, patient-portal flows, accessibility for vulnerable populations, and safe medical-data visualization. GDD loads it automatically when it detects a healthcare/clinical/EHR project from the signals below. GDD surfaces these patterns and flags likely risks; it does **not** certify HIPAA compliance - that is a legal and organizational process (Business Associate Agreements, Security Risk Analysis, counsel sign-off) that no design tool can perform.

## HIPAA-aware form patterns

Protected Health Information (PHI) is any individually identifiable health data - the 18 HIPAA identifiers include name, dates (DOB, admission), MRN, account numbers, biometric IDs, full-face photos, and any of the geographic/contact fields. Design forms so PHI is contained, intentional, and minimal.

- **PHI isolation.** Keep PHI fields in clearly bounded form sections, visually and structurally separate from non-PHI (preferences, UI settings, marketing opt-ins). This makes the data classification obvious to engineers and supports field-level encryption/access scoping downstream.
- **Minimum-necessary principle.** The HIPAA Privacy Rule requires using/disclosing only the PHI needed for the task. Do not collect a field "just in case." Every PHI input should map to a stated purpose; prefer progressive disclosure over one giant intake form.
- **Never leak PHI into ambient surfaces.** No PHI in URLs, path segments, or query strings (`/patient/12345?ssn=...` is a breach vector - it lands in browser history, server logs, and `Referer` headers). No PHI in page `<title>`, no PHI in client analytics events (Google Analytics, Segment, Mixpanel, session-replay tools like FullStory/Hotjar - these are notorious for inadvertent capture), and no PHI written to console or client logs.
- **Session auto-logout + idle timeout.** Auto-terminate or lock the session after **10-15 minutes** of inactivity (shorter on shared/kiosk workstations). Show a countdown warning ~60s before logout with an "I'm still here" extend action. Clear in-memory PHI on logout; never persist PHI to `localStorage`.
- **Break-the-glass emergency access.** When a clinician needs records outside their normal authorization (e.g., a patient in the ED who isn't theirs), allow override but **capture justification at the moment of access** (free-text reason + structured reason code), warn that the access is logged and reviewed, and flag the event for compliance audit. The friction is intentional.
- **Auto-fill / autocomplete.** Disable browser autofill on sensitive fields (`autocomplete="off"` where appropriate) and never pre-fill another patient's data into a shared form.

## Audit trails as UI

Access logging is mandated by the HIPAA Security Rule (audit controls, §164.312(b)). Treat the audit log as a first-class, user-visible feature - not just a backend table.

- **Who-accessed-what.** Surface access events with actor identity, role, timestamp, the specific record/section viewed, and the action (view/edit/export/print).
- **Access reason.** Where access requires justification (break-the-glass, sensitive segments), display the captured reason inline with the event.
- **Immutability.** Audit entries are append-only. The UI must never offer edit/delete on a log row; show it as a read-only, chronological ledger. Surface tamper-evidence (e.g., sequence numbers) if the backend provides it.
- **Patient-facing "who saw my record."** Patient portals should let patients review an access history of their own chart and report suspected inappropriate access. This supports the patient's right to an accounting of disclosures.

## Patient-portal flows (MyChart-class)

Patient portals (MyChart, Athenahealth, Healow-style) share a recognizable set of flows. Design each with the safety/consent rules below.

| Flow | Key design considerations |
|------|---------------------------|
| Appointment scheduling | Real-time slot availability, visit-type/reason capture, pre-visit forms, reminders, easy reschedule/cancel with cancellation-window rules. |
| Lab / result release | Respect **provider hold windows** - sensitive results (oncology, genetics, HIV, pathology) may be embargoed so the provider can contact the patient first. Note: the ONC Information Blocking rule (21st Century Cures Act) generally requires *prompt* release, so holds must be narrow and policy-driven. Always show units + reference ranges (see visualization). |
| Proxy / caregiver access | Distinct, scoped access for parents of minors, caregivers, and guardians. Handle the **adolescent-confidentiality transition** (access often narrows at age 12-18 per state law). Show proxies clearly whose record they are viewing. |
| Secure messaging | Encrypted in-app messaging with care team, not email/SMS. Set expectations (not for emergencies - direct to 911/ED), show response-time SLAs, and capture message threads in the chart. |
| After-visit summary (AVS) | Plain-language recap of the visit: diagnoses, meds, instructions, follow-ups. Printable/downloadable, reading-level controlled. |
| Prescription / refills | Refill requests, pharmacy selection, and medication lists with names, doses, and clear active/discontinued status. |

## Accessibility-first

Healthcare reaches the broadest, most impaired population of any domain: elderly users, low vision, motor and cognitive impairment, low health literacy, limited English proficiency, and people in pain or distress. Target **WCAG 2.1 Level AAA** where feasible (not just AA) and design for stress cases.

- **Touch targets.** Minimum **44x44 px** (Apple HIG / WCAG 2.5.5 AAA recommends 44pt; Material recommends 48dp). Generous spacing between targets to prevent mis-taps.
- **Contrast.** AAA text contrast is **7:1** for normal text and **4.5:1** for large text (vs. AA's 4.5:1 / 3:1). Do not rely on hairline gray-on-gray.
- **Plain medical language + reading level.** Default to plain language (CDC guidance targets roughly a 6th-8th grade reading level for patient materials). Offer a reading-level / "explain this" control, expand acronyms (BP, A1C), and pair clinical terms with lay equivalents ("hypertension (high blood pressure)").
- **Error messages that explain.** Say what is wrong, why, and how to fix it ("Date of birth must be in the past - use MM/DD/YYYY"). Never error-by-color-only; include text + icon and associate the message programmatically with the field (`aria-describedby`).
- **Scalable type & zoom.** Support 200% zoom and OS text-scaling without loss of content (WCAG 1.4.4 / 1.4.10 reflow). Respect `prefers-reduced-motion`.
- **Language access.** Support translation/interpreter pathways; civil-rights rules (ACA Section 1557) expect meaningful access for limited-English-proficiency patients.

## Medical-data visualization

Lab and vitals visualization is safety-critical. The goal is accurate interpretation without implying a diagnosis the data does not support.

- **Values with reference ranges + units.** Every result shows the value, the **unit** (mg/dL, mmol/L, mEq/L - unit ambiguity causes real harm), and the lab's reference range. Ranges can be age/sex-specific; show the applicable range.
- **Normal / abnormal / critical flags.** Mark results as within-range, abnormal (H/L), or critical (HH/LL / panic value). Critical values warrant the strongest treatment.
- **Never color-only for critical values.** Encode status with **icon + text + position**, not hue alone (8% of men have color-vision deficiency). A red dot is invisible to many users and to grayscale printouts; pair it with an explicit "Critical - High" label and an icon.
- **Trends over time.** Plot longitudinal values with the reference band shaded behind the line so abnormality is visible at a glance. Label axes with units; keep consistent scales when comparing.
- **Avoid implying diagnosis.** Present data and flags, not conclusions. Don't auto-label a value as a disease; surface it as a flagged result for clinician interpretation. Show result status (preliminary vs. final), collection time, and the ordering provider.

## Detection signals

GDD auto-detects this domain from project keywords and dependencies.

**Keywords (code, copy, file/route names):** `patient`, `clinical`, `EHR`, `EMR`, `telehealth`, `HIPAA`, `PHI`, `provider`, `diagnosis`, `prescription`, plus supporting terms like `MRN`, `chart`, `encounter`, `appointment`, `lab result`.

**`package.json` dependencies (strong signal):**

| Package | Indicates |
|---------|-----------|
| `fhir` | FHIR resource models/parsing |
| `fhirclient` | SMART on FHIR client (EHR launch) |
| `fhir-kit-client` | FHIR REST client |
| `@medplum/core` / `medplum` | Medplum healthcare platform SDK |
| `hl7` | HL7 v2 messaging |
| `@types/fhir` | FHIR TypeScript types |
| `redox` | Redox EHR integration engine |

Any FHIR/HL7/Medplum/Redox dependency, or a cluster of the keywords above, should trigger loading this pack.

## Audit checklist

Concrete, verifiable items for reviewing a healthcare UI:

1. **No PHI in URLs, path params, query strings, page titles, or client analytics/session-replay events.** Inspect routes and analytics payloads for identifiers.
2. **Forms collect only minimum-necessary PHI** - each PHI field maps to a stated purpose; no speculative "just in case" fields.
3. **PHI fields are isolated** from non-PHI (preferences, marketing) in clearly bounded sections.
4. **Session auto-logs-out after a 10-15 min idle timeout**, with a countdown warning and an extend action; in-memory PHI is cleared and never stored in `localStorage`.
5. **Break-the-glass / emergency access captures a justification** (reason code + free text), warns the user it is logged, and flags the event for review.
6. **An immutable, append-only access log is surfaced in the UI** (actor, role, timestamp, record, action) with no edit/delete affordance.
7. **Patients can view who accessed their own record** and report suspected inappropriate access.
8. **Sensitive lab/result release honors provider hold windows** and proxy/adolescent-confidentiality rules.
9. **Lab results show value + unit + reference range**, with normal/abnormal/critical flags.
10. **Lab criticals are flagged by icon + text (and position), not color alone**, and remain legible in grayscale.
11. **Visualizations present flagged data, not diagnoses** - no auto-labeling of results as a disease.
12. **Accessibility meets the AAA bar where feasible:** touch targets >= 44x44 px, 7:1 text contrast, plain-language/reading-level control, and error messages that explain what's wrong and how to fix it.

## Canonical references

- HIPAA Privacy & Security Rules (HHS): https://www.hhs.gov/hipaa/for-professionals/index.html
- HHS guidance on tracking technologies and PHI: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/index.html
- WCAG 2.1 (W3C/WAI): https://www.w3.org/TR/WCAG21/
- WAI accessibility guidance: https://www.w3.org/WAI/
- HL7 FHIR specification: https://hl7.org/fhir/
- ONC Cures Act / information blocking (HealthIT.gov): https://www.healthit.gov/topic/information-blocking
