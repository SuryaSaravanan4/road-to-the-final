# ADR 0002 — Reasoning-layer feedback signal

Status: accepted (design) · Date: 2026-07-22

## Context

The screenshot pipeline has a feedback loop: every extraction is stored next
to the human correction, and `npm run calibration` measures whether confidence
predicts those corrections (ADR 0001, `docs/feedback-loop.md`). The **reasoning
layer has none.** `src/reasoning/` asks Claude to assess each realistic
opponent's `difficulty` (easy/medium/hard), `likelihood` (0–100), and a
one-sentence `reasoning`; `rankScenarios` orders them; the UI
(`ScenarioCard.tsx`) shows them. Nothing captures whether a viewer found a
ranking sensible, so there is no signal to calibrate the scenario prompt
against.

`feedback-loop.md` deferred this pending one decision — *what is the signal?*
(per-scenario thumbs, or a correction of the difficulty band?). This ADR makes
that decision so the storage and capture can be built.

## The load-bearing difference from extraction feedback

Extraction feedback works because the human-confirmed value **is** ground
truth — an objectively correct answer to diff against. A difficulty/likelihood
assessment has **no ground truth**:

- It is a judgment, not a fact. There is no later "correct" difficulty to
  compare against.
- The matchup may never happen (`likelihood` < 100), and even when it does,
  one result is a noisy referendum on a probability, and win/loss is not the
  same axis as "difficulty."
- Scenarios are **ephemeral**: regenerated on the 15-minute cache TTL and on
  every forced refresh (`road-to-final.ts`), the opponent set shifts as the
  bracket resolves, and no scenario is ever persisted. There is no durable row
  to attach an opinion to.

Consequences that shape the whole design:

1. The signal must be **subjective human judgment captured at view time**, not
   a deferred comparison against truth.
2. Each feedback record must **snapshot the assessment as shown** — it cannot
   reference a scenario that won't exist after the next regeneration. This is
   the direct analog of `Ingestion.rawExtraction` freezing what Claude read.
3. The eventual report yields an **agreement rate**, not an error rate. It can
   surface systematic disagreement (e.g. users routinely downgrading `hard` →
   `medium` for top-seeded opponents) but never "X% were wrong."

## Decision — the signal

**Primary signal: a directed thumbs — `agree` / `disagree` — per scenario,
one click.** Disagreement optionally refines into (a) a corrected difficulty
band and (b) a free-text note. Rationale:

- A bare thumbs is the lowest-friction thing that still produces a labeled
  corpus, and low friction is what gets a signal at all from an unauthenticated,
  low-traffic Phase 1 app. But a bare thumbs doesn't say *what* was wrong.
- The optional band correction, when the user supplies it, is the precise
  analog of an extraction correction — a `(shown, corrected)` pair the report
  can pool by difficulty. It is optional so the common case stays one click.
- The note is the escape hatch for the dimensions we deliberately don't ask
  users to quantify (see below).

**Likelihood is not directly correctable.** Humans are poor at calibrating
probabilities, and a numeric correction would be noise dressed as signal.
Disagreement about likelihood is captured only through the note in Phase A;
if the notes show it matters, a coarse "too high / too low" toggle is a later
addition, not a number field.

**Only model-generated scenarios are feedback targets.** `road-to-final.ts`
synthesizes a scenario when the bracket has already confirmed the opponent
(`difficulty: "medium"`, `likelihood: 100`, reasoning "Opponent confirmed by
the published bracket.") — there was no reasoning to judge. Every scenario
therefore carries an explicit `source: "model" | "bracket"`; the UI shows the
control only for `"model"`, and the report excludes `"bracket"` (the analog of
extraction's "excluded as not-human-authored").

## What gets stored

A self-contained snapshot (the "what was shown" side) plus the verdict (the
"what the human thought" side), mirroring the `Ingestion` shape:

```prisma
model ScenarioFeedback {
  id            String   @id @default(cuid())
  // Identity of the scenario slot at the time of feedback.
  providerKey   String
  teamId        String
  stage         String
  opponentId    String
  opponentName  String
  // The assessment exactly as shown (the "raw" side) — frozen, since the
  // live scenario is regenerated and gone.
  source        String   // "model" | "bracket"
  difficulty    String   // easy | medium | hard, as shown
  likelihood    Int      // 0–100, as shown
  reasoning     String   // verbatim
  model         String?  // ANTHROPIC_MODEL that produced it
  promptVersion String?  // buildScenarioPrompt version tag
  // The human verdict (the "corrected" side).
  verdict              String   // "agree" | "disagree"
  difficultyCorrection String?  // easy | medium | hard, only if the user reset it
  note                 String?  // optional free text
  createdAt     DateTime @default(now())

  // Single-tenant, last-write-wins per scenario slot (see Phase 2 note).
  @@unique([providerKey, teamId, stage, opponentId])
}
```

`promptVersion` is why `buildScenarioPrompt` gains a `SCENARIO_PROMPT_VERSION`
constant: feedback must be attributable to the prompt that produced it, so a
prompt change can be measured against the agreement rate before and after
rather than pooling incomparable eras. This is the lever the whole loop turns
on and is cheap to add now.

`@@unique` on the slot makes this **last-write-wins per scenario, single
opinion** — honest for a Phase 1 app with no user model. It is *not* a
per-user opinion; with Phase 2 accounts the key becomes
`(userId, providerKey, teamId, stage, opponentId)` and the history becomes
worth keeping. Called out so it isn't carried silently into Phase 2, exactly
like the unauthenticated-write gap in ADR 0001.

## Capture path

- `source` is added to `ScenarioInput` / `RankedScenario` (`domain.ts`) and set
  in `road-to-final.ts` — `"bracket"` on the confirmed-opponent synthetic
  scenario, `"model"` on ranked Claude output. Not inferred from
  `likelihood === 100`, which is fragile.
- `POST /api/path/feedback` upserts a `ScenarioFeedback` on the slot key. Same
  origin check as the other mutating routes; unauthenticated in Phase 1 (same
  documented gap). `providerKey`/`teamId` come from the client's existing
  selection (`readSelection`); the rest of the snapshot is echoed from the
  scenario the client is rendering.
- `ScenarioCard.tsx` gains a compact agree/disagree control, rendered only for
  `source === "model"` on not-completed rounds. Disagree expands a small panel:
  a segmented easy/medium/hard for the optional corrected band and an optional
  note. It follows ADR 0001's accessibility posture: native keyboard-operable
  controls, real labels, state announced via `aria-live`, meaning never carried
  by color alone. No new animation (split-flap stays reserved).

## The loop (deferred, same gate as extraction)

`npm run reasoning-feedback` — the analog of the calibration report — will
report the agreement rate overall and by difficulty band, the disagreement
`(shown → corrected)` pairs most-common-first, all grouped by `promptVersion`
so a prompt change's effect is visible, and excluding `source: "bracket"`.
Once enough disagreements accumulate, representative pairs feed back into
`buildScenarioPrompt` as a "common miscalibrations" section — bumping
`SCENARIO_PROMPT_VERSION` — and the report says whether it moved the number.

This half is **blocked on data** for the same reason as the extraction loop:
with a handful of events any "common mistake" is invented, not learned. And it
inherits the same **retention/consent prerequisite** — feedback rows are a
training corpus on an unauthenticated app.

## Phasing

- **Phase A (buildable now):** `source` tagging, `SCENARIO_PROMPT_VERSION`, the
  `ScenarioFeedback` model + migration, `POST /api/path/feedback`, and the
  `ScenarioCard` control. This is the storage + capture that was blocked on the
  decision above.
- **Phase B (blocked on data):** the `reasoning-feedback` report and feeding
  disagreements back into the prompt.
- **Deferred:** per-user attribution (Phase 2 accounts), any numeric/coarse
  likelihood correction, and the retention/consent story (shared with the
  extraction corpus).
```
