import { CONFIDENCE_CONFIRM_THRESHOLD } from "@/lib/ingestion";
import type { BracketExtraction } from "@/reasoning/bracketExtractionSchema";
import type { CorrectedExtraction } from "@/lib/draft-to-state";

/**
 * Measures whether extraction confidence predicts human correction.
 *
 * Every ingestion stores both what Claude read (rawExtraction, a confidence
 * per leaf) and what the human confirmed (corrections). Pairing them says
 * what the "needs review" flag is actually worth: if a flagged field is no
 * likelier to have been edited than an unflagged one, the flag is noise and
 * the preview is training people to ignore it.
 *
 * The baseline for "edited" is NOT the raw extracted value — it is what the
 * confirmation UI would have submitted had the human touched nothing. The
 * preview auto-names blank rounds/groups, trims, forces bracketSide outside
 * double-elim, and round-trips the winner through a home/away choice. Diffing
 * against raw values would book all of that as human corrections. Changes the
 * human could not have authored are excluded from the stats and counted
 * separately instead.
 *
 * COUPLING: projectNoEdit mirrors IngestReview's initRounds / initGroups /
 * buildCorrected. If the preview's normalization changes, change this too —
 * tests/calibration.test.ts pins the specific behaviors.
 */

export type FieldKind =
  | "competitionName"
  | "format"
  | "roundName"
  | "homeTeamName"
  | "awayTeamName"
  | "homeScore"
  | "awayScore"
  | "winnerTeamName"
  | "date"
  | "groupName"
  | "groupTeamName"
  | "played"
  | "won"
  | "draw"
  | "lost"
  | "points";

export type ExclusionReason =
  /** The model read nothing; the preview supplied the value. Measures the UI. */
  | "auto-filled"
  /** Extracted winner matched neither team, so the preview dropped it. */
  | "winner-unmatched"
  /** Winner name moved only because the team name it points at was corrected. */
  | "derived-from-team";

export interface FieldObservation {
  ingestionId: string;
  /** Where in the extraction, e.g. `rounds[1].matchups[0].homeScore`. */
  path: string;
  field: FieldKind;
  confidence: number;
  edited: boolean;
  extracted: string;
  corrected: string;
  /** Set when this pair is not clean evidence about the model. */
  excluded?: ExclusionReason;
}

export interface IngestionObservations {
  observations: FieldObservation[];
  /** Array-shape mismatches; the current preview cannot produce any. */
  structural: string[];
}

const EMPTY = "∅";

function text(field: { value: string | null }): string {
  return field.value ?? "";
}

function show(value: string | number | null): string {
  return value === null || value === "" ? EMPTY : String(value);
}

/** null and "" are the same absence; everything else compares by value. */
function same(a: string | number | null, b: string | number | null): boolean {
  const norm = (v: string | number | null) => (v === null || v === "" ? "" : String(v));
  return norm(a) === norm(b);
}

/**
 * Pairs one ingestion's extraction against its confirmed corrections.
 *
 * `existingName` is the competition's name on re-ingestion — the preview
 * falls back to it when the screenshot has no readable title.
 */
export function observeIngestion(
  ingestionId: string,
  raw: BracketExtraction,
  corrected: CorrectedExtraction,
  existingName?: string | null
): IngestionObservations {
  const observations: FieldObservation[] = [];
  const structural: string[] = [];

  const add = (o: FieldObservation) => observations.push(o);

  // --- competition name -----------------------------------------------
  const readName = text(raw.competitionName).trim();
  const expectedName = readName || (existingName ?? "").trim();
  add({
    ingestionId,
    path: "competitionName",
    field: "competitionName",
    confidence: raw.competitionName.confidence,
    edited: !same(corrected.competitionName, expectedName),
    extracted: show(raw.competitionName.value),
    corrected: show(corrected.competitionName),
    excluded: readName === "" ? "auto-filled" : undefined,
  });

  // --- format ----------------------------------------------------------
  // Below the threshold the preview refuses to pre-select, so the human
  // always chose deliberately — agreement and disagreement are both signal.
  add({
    ingestionId,
    path: "format",
    field: "format",
    confidence: raw.formatConfidence,
    edited: corrected.format !== raw.format,
    extracted: raw.format,
    corrected: corrected.format,
  });

  // --- rounds ----------------------------------------------------------
  if (raw.rounds.length !== corrected.rounds.length) {
    structural.push(
      `rounds: extracted ${raw.rounds.length}, confirmed ${corrected.rounds.length}`
    );
  }
  const roundCount = Math.min(raw.rounds.length, corrected.rounds.length);
  for (let r = 0; r < roundCount; r++) {
    const rawRound = raw.rounds[r];
    const fixedRound = corrected.rounds[r];

    const readRoundName = text(rawRound.name);
    add({
      ingestionId,
      path: `rounds[${r}].name`,
      field: "roundName",
      confidence: rawRound.name.confidence,
      edited: !same(fixedRound.name, (readRoundName || `Round ${r + 1}`).trim()),
      extracted: show(rawRound.name.value),
      corrected: show(fixedRound.name),
      excluded: readRoundName.trim() === "" ? "auto-filled" : undefined,
    });

    // bracketSide carries no confidence in the schema, and the preview
    // overwrites it outside double-elim — nothing to calibrate.

    if (rawRound.matchups.length !== fixedRound.matchups.length) {
      structural.push(
        `rounds[${r}].matchups: extracted ${rawRound.matchups.length}, confirmed ${fixedRound.matchups.length}`
      );
    }
    const matchupCount = Math.min(rawRound.matchups.length, fixedRound.matchups.length);
    for (let m = 0; m < matchupCount; m++) {
      const rawMatch = rawRound.matchups[m];
      const fixedMatch = fixedRound.matchups[m];
      const at = `rounds[${r}].matchups[${m}]`;

      const expectedHome = text(rawMatch.homeTeamName).trim() || null;
      const expectedAway = text(rawMatch.awayTeamName).trim() || null;
      const homeEdited = !same(fixedMatch.homeTeamName, expectedHome);
      const awayEdited = !same(fixedMatch.awayTeamName, expectedAway);

      add({
        ingestionId,
        path: `${at}.homeTeamName`,
        field: "homeTeamName",
        confidence: rawMatch.homeTeamName.confidence,
        edited: homeEdited,
        extracted: show(rawMatch.homeTeamName.value),
        corrected: show(fixedMatch.homeTeamName),
      });
      add({
        ingestionId,
        path: `${at}.awayTeamName`,
        field: "awayTeamName",
        confidence: rawMatch.awayTeamName.confidence,
        edited: awayEdited,
        extracted: show(rawMatch.awayTeamName.value),
        corrected: show(fixedMatch.awayTeamName),
      });
      add({
        ingestionId,
        path: `${at}.homeScore`,
        field: "homeScore",
        confidence: rawMatch.homeScore.confidence,
        edited: !same(fixedMatch.homeScore, rawMatch.homeScore.value),
        extracted: show(rawMatch.homeScore.value),
        corrected: show(fixedMatch.homeScore),
      });
      add({
        ingestionId,
        path: `${at}.awayScore`,
        field: "awayScore",
        confidence: rawMatch.awayScore.confidence,
        edited: !same(fixedMatch.awayScore, rawMatch.awayScore.value),
        extracted: show(rawMatch.awayScore.value),
        corrected: show(fixedMatch.awayScore),
      });
      add({
        ingestionId,
        path: `${at}.date`,
        field: "date",
        confidence: rawMatch.date.confidence,
        edited: !same(fixedMatch.date, text(rawMatch.date).trim() || null),
        extracted: show(rawMatch.date.value),
        corrected: show(fixedMatch.date),
      });

      // The preview offers a home/away radio, not a free-text winner: an
      // extracted name that matches neither team can only come back as null,
      // and a winner that follows a corrected team name moved on its own.
      const readWinner = text(rawMatch.winnerTeamName).trim().toLowerCase();
      const side =
        readWinner && readWinner === text(rawMatch.homeTeamName).trim().toLowerCase()
          ? "home"
          : readWinner && readWinner === text(rawMatch.awayTeamName).trim().toLowerCase()
            ? "away"
            : "";
      const expectedWinner = side === "home" ? expectedHome : side === "away" ? expectedAway : null;

      let winnerExcluded: ExclusionReason | undefined;
      if (readWinner !== "" && side === "") {
        winnerExcluded = "winner-unmatched";
      } else if (
        (side === "home" && homeEdited && same(fixedMatch.winnerTeamName, fixedMatch.homeTeamName)) ||
        (side === "away" && awayEdited && same(fixedMatch.winnerTeamName, fixedMatch.awayTeamName))
      ) {
        winnerExcluded = "derived-from-team";
      }

      add({
        ingestionId,
        path: `${at}.winnerTeamName`,
        field: "winnerTeamName",
        confidence: rawMatch.winnerTeamName.confidence,
        edited: !same(fixedMatch.winnerTeamName, expectedWinner),
        extracted: show(rawMatch.winnerTeamName.value),
        corrected: show(fixedMatch.winnerTeamName),
        excluded: winnerExcluded,
      });
    }
  }

  // --- groups ----------------------------------------------------------
  // The preview drops empty groups on submit but auto-names them from their
  // position in the unfiltered list, so keep the original index around.
  const keptGroups = raw.groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.rows.length > 0);

  if (keptGroups.length !== corrected.groups.length) {
    structural.push(
      `groups: extracted ${keptGroups.length} non-empty, confirmed ${corrected.groups.length}`
    );
  }
  const groupCount = Math.min(keptGroups.length, corrected.groups.length);
  for (let g = 0; g < groupCount; g++) {
    const { group: rawGroup, index } = keptGroups[g];
    const fixedGroup = corrected.groups[g];

    const readGroupName = text(rawGroup.name);
    const autoName = raw.groups.length > 1 ? `Group ${index + 1}` : "";
    add({
      ingestionId,
      path: `groups[${index}].name`,
      field: "groupName",
      confidence: rawGroup.name.confidence,
      edited: !same(fixedGroup.name, (readGroupName || autoName).trim() || null),
      extracted: show(rawGroup.name.value),
      corrected: show(fixedGroup.name),
      excluded: readGroupName.trim() === "" && autoName !== "" ? "auto-filled" : undefined,
    });

    if (rawGroup.rows.length !== fixedGroup.rows.length) {
      structural.push(
        `groups[${index}].rows: extracted ${rawGroup.rows.length}, confirmed ${fixedGroup.rows.length}`
      );
    }
    const rowCount = Math.min(rawGroup.rows.length, fixedGroup.rows.length);
    for (let i = 0; i < rowCount; i++) {
      const rawRow = rawGroup.rows[i];
      const fixedRow = fixedGroup.rows[i];
      const at = `groups[${index}].rows[${i}]`;

      add({
        ingestionId,
        path: `${at}.teamName`,
        field: "groupTeamName",
        confidence: rawRow.teamName.confidence,
        edited: !same(fixedRow.teamName, text(rawRow.teamName).trim()),
        extracted: show(rawRow.teamName.value),
        corrected: show(fixedRow.teamName),
      });

      const stats = ["played", "won", "draw", "lost", "points"] as const;
      for (const stat of stats) {
        add({
          ingestionId,
          path: `${at}.${stat}`,
          field: stat,
          confidence: rawRow[stat].confidence,
          edited: !same(fixedRow[stat], rawRow[stat].value),
          extracted: show(rawRow[stat].value),
          corrected: show(fixedRow[stat]),
        });
      }
    }
  }

  return { observations, structural };
}

/** The observations that are clean evidence about the model. */
export function counted(observations: FieldObservation[]): FieldObservation[] {
  return observations.filter((o) => !o.excluded);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface FieldSummary {
  field: FieldKind;
  n: number;
  edits: number;
  editRate: number;
  meanConfidenceClean: number | null;
  meanConfidenceEdited: number | null;
}

/** Per field type: how often the human corrected it, most-corrected first. */
export function summarizeByField(observations: FieldObservation[]): FieldSummary[] {
  const byField = new Map<FieldKind, FieldObservation[]>();
  for (const o of counted(observations)) {
    const list = byField.get(o.field) ?? [];
    list.push(o);
    byField.set(o.field, list);
  }

  return Array.from(byField, ([field, list]) => {
    const edits = list.filter((o) => o.edited);
    return {
      field,
      n: list.length,
      edits: edits.length,
      editRate: edits.length / list.length,
      meanConfidenceClean: mean(list.filter((o) => !o.edited).map((o) => o.confidence)),
      meanConfidenceEdited: mean(edits.map((o) => o.confidence)),
    };
  }).sort((a, b) => b.editRate - a.editRate || b.n - a.n);
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  n: number;
  edits: number;
  /** Share of the bin the human actually corrected. */
  observedEditRate: number;
  /** What the model's own confidence implies it should be (1 - mean conf). */
  expectedEditRate: number;
}

export const DEFAULT_BINS = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 1] as const;

/**
 * Bins observations by confidence and compares the edit rate the model
 * implied against the one the humans produced. A well-calibrated 0.9 field
 * should be wrong about 10% of the time.
 */
export function calibrationBins(
  observations: FieldObservation[],
  edges: readonly number[] = DEFAULT_BINS
): CalibrationBin[] {
  const pool = counted(observations);
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < edges.length - 1; i++) {
    const lower = edges[i];
    const upper = edges[i + 1];
    const isLast = i === edges.length - 2;
    const inBin = pool.filter(
      (o) => o.confidence >= lower && (isLast ? o.confidence <= upper : o.confidence < upper)
    );
    const edits = inBin.filter((o) => o.edited).length;
    bins.push({
      lower,
      upper,
      n: inBin.length,
      edits,
      observedEditRate: inBin.length === 0 ? 0 : edits / inBin.length,
      expectedEditRate: inBin.length === 0 ? 0 : 1 - (mean(inBin.map((o) => o.confidence)) ?? 0),
    });
  }

  return bins;
}

export interface Discrimination {
  /**
   * P(a clean field outranks an edited one), ties counted half — the ROC AUC
   * of confidence as an error detector. 0.5 is a coin flip: confidence
   * carries no information about correctness at all.
   */
  auc: number | null;
  nEdited: number;
  nClean: number;
}

export function discrimination(observations: FieldObservation[]): Discrimination {
  const pool = counted(observations);
  const edited = pool.filter((o) => o.edited).map((o) => o.confidence);
  const clean = pool.filter((o) => !o.edited).map((o) => o.confidence);

  if (edited.length === 0 || clean.length === 0) {
    return { auc: null, nEdited: edited.length, nClean: clean.length };
  }

  let wins = 0;
  for (const c of clean) {
    for (const e of edited) {
      if (c > e) wins += 1;
      else if (c === e) wins += 0.5;
    }
  }

  return { auc: wins / (clean.length * edited.length), nEdited: edited.length, nClean: clean.length };
}

export interface ThresholdReport {
  threshold: number;
  flagged: number;
  flaggedEdits: number;
  /** Of the fields we asked the human to check, the share worth checking. */
  precision: number | null;
  /** Of the fields the human did fix, the share we flagged. */
  recall: number | null;
  unflagged: number;
  /** Errors that sailed through unflagged — the ones that reach ground truth. */
  unflaggedEdits: number;
  unflaggedEditRate: number | null;
}

/** How the live "needs review" cutoff performs as an error detector. */
export function thresholdReport(
  observations: FieldObservation[],
  threshold: number = CONFIDENCE_CONFIRM_THRESHOLD
): ThresholdReport {
  const pool = counted(observations);
  const flagged = pool.filter((o) => o.confidence < threshold);
  const unflagged = pool.filter((o) => o.confidence >= threshold);
  const flaggedEdits = flagged.filter((o) => o.edited).length;
  const unflaggedEdits = unflagged.filter((o) => o.edited).length;
  const totalEdits = flaggedEdits + unflaggedEdits;

  return {
    threshold,
    flagged: flagged.length,
    flaggedEdits,
    precision: flagged.length === 0 ? null : flaggedEdits / flagged.length,
    recall: totalEdits === 0 ? null : flaggedEdits / totalEdits,
    unflagged: unflagged.length,
    unflaggedEdits,
    unflaggedEditRate: unflagged.length === 0 ? null : unflaggedEdits / unflagged.length,
  };
}
