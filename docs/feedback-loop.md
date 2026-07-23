# Human-feedback loop — remaining work

Every screenshot ingestion already stores what Claude read (`rawExtraction`,
with a confidence per leaf) next to what the human confirmed (`corrections`)
and what that changed (`appliedDiff`). That is a correction corpus. This
document tracks what has been built on top of it and what has not.

## Done

**Calibration measurement** (`src/lib/calibration.ts`, `npm run calibration`).
Pairs each stored extraction against its confirmed corrections and reports
per-field edit rates, confidence calibration by band, the AUC of confidence as
an error detector, and how `CONFIDENCE_CONFIRM_THRESHOLD` performs — its
precision (flagged work worth doing) and, more importantly, the unflagged
error rate (wrong values that reached ground truth without anyone being asked
to look).

Two things to know before trusting its output:

- **The baseline is the preview's no-edit projection, not the raw extracted
  values.** `IngestReview.tsx` auto-names blank rounds and groups, falls back
  to the existing competition name, trims on submit, forces `bracketSide`
  outside double-elim, drops zero-row groups, and round-trips the winner
  through a home/away radio. Diffing raw against corrected would book all of
  that as human work. Changes the human could not have authored are excluded
  and counted separately instead.
- **`observeIngestion` mirrors `IngestReview`'s `initRounds` / `initGroups` /
  `buildCorrected` by hand.** If the preview's normalization changes and this
  does not, the numbers quietly drift. `tests/calibration.test.ts` pins the
  specific behaviors; a shared projection module would be the real fix.

**Discard path** (`POST /api/ingest/[id]/discard`, "Discard this read" in
`IngestReview`). A DRAFT can now reach `DISCARDED` — the human saw the read and
judged it not worth correcting — with an optional free-text reason
(`Ingestion.discardReason`, `discardedAt`). This is the strongest negative
signal the pipeline has, and it no longer vanishes when someone navigates away
from a bad draft. `npm run calibration` prints the discard count and the reasons
given. Discards carry no per-field corrections, so they stay out of the edit-rate
and AUC numbers; they are counted, not calibrated. The transition is guarded to
DRAFT-only, same-origin like confirm.

## Blocked on data

As of the last run there is **one** usable confirmed ingestion — 22 comparable
fields, zero human corrections. (A second row is stub test data: 8-byte image,
`rawExtraction` of `{}`; the report skips it.) Nothing below can start until
roughly 20–30 real brackets have been confirmed, at which point the
calibration report is the thing that says whether the effort is warranted.

### Error taxonomy → extraction prompt

`buildExtractionPrompt.ts` is 31 lines with no few-shot examples. Once the
report shows *which* field types get corrected (team names? dates? round
labels?), feed the real correction pairs back as few-shot examples or an
explicit "common mistakes" section. Highest expected accuracy gain of anything
here — and the cheapest, since it is prompt text, not architecture.

Do not attempt this off a handful of ingestions: with no observed corrections,
any examples would be invented rather than learned.

### Extraction eval harness

The confirmed `(imageData, corrections)` pairs are a golden set. Nothing today
exercises the model call itself — all 10 test files are pure logic — so any
edit to the extraction prompt is currently unverifiable. Replay stored images
through the current prompt, score against the confirmed state, and gate prompt
changes on the result. Needs a decision on cost and on whether it runs in CI or
on demand.

## Ready to build now

### Reasoning-layer feedback — designed, Phase A ready

Everything above concerns extraction. `src/reasoning/` produces scenario
difficulty and likelihood assessments, and nothing captures whether a user
found a ranking sensible. The blocking question — *what is the signal?* — is
now decided in **`docs/adr/0002-reasoning-feedback.md`**: a one-click
`agree`/`disagree` per scenario, disagreement optionally refined by a corrected
difficulty band and a note; likelihood is not directly correctable; only
`source: "model"` scenarios are targets (the bracket-confirmed synthetic ones
are excluded, like extraction's not-human-authored fields).

The load-bearing difference from extraction: a difficulty assessment has **no
ground truth** and scenarios are **ephemeral** (regenerated every TTL, never
persisted). So each feedback row must snapshot the assessment as shown — the
analog of `rawExtraction` — and the eventual report yields an *agreement rate*,
not an error rate.

**Phase A (buildable now):** add `source` to `ScenarioInput`/`RankedScenario`
and set it in `road-to-final.ts`; a `SCENARIO_PROMPT_VERSION` constant on
`buildScenarioPrompt` (so feedback is attributable to a prompt era); the
`ScenarioFeedback` model + migration; `POST /api/path/feedback`; and the
agree/disagree control in `ScenarioCard.tsx`. **Phase B (blocked on data, the
same gate as the extraction items above):** the `reasoning-feedback` report and
feeding disagreements back into the prompt. See the ADR for the schema and the
single-tenant last-write-wins caveat that Phase 2 accounts change.

## Prerequisite for scaling any of this

`imageData` is base64 in the database and grows without bound, and Phase 1 has
no user model — ingestion and confirmation are unauthenticated. Treating user
uploads as a training corpus needs a retention policy and a consent story that
do not exist yet. This gates the eval harness in particular, which implies
keeping images indefinitely.
