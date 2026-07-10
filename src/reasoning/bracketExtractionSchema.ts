import { z } from "zod";
import { COMPETITION_FORMATS } from "@/providers/screenshot-bracket/state";

/**
 * Schema for Claude vision's bracket-screenshot extraction — the extraction
 * counterpart of scenarioSchema.ts. Every leaf value carries its own
 * confidence (0-1) because there is no upstream API to cross-check against:
 * the confirmation UI flags low-confidence fields for human review, and
 * nothing becomes ground truth until the user confirms.
 *
 * The model only reads what's in the image. Normalizing round names to
 * canonical stage keys, generating team ids, and deciding elimination
 * semantics are all deterministic code at confirm time — never extraction.
 */

const Confidence = z.number().min(0).max(1);

/** A value read from the image; null when the slot is empty/unreadable. */
const ExtractedText = z.object({
  value: z.string().nullable(),
  confidence: Confidence,
});

const ExtractedCount = z.object({
  value: z.number().int().nullable(),
  confidence: Confidence,
});

export const ExtractedMatchupSchema = z.object({
  homeTeamName: ExtractedText,
  awayTeamName: ExtractedText,
  homeScore: ExtractedCount,
  awayScore: ExtractedCount,
  /** Name of the winning team as shown, if the image marks a winner. */
  winnerTeamName: ExtractedText,
  /** ISO-8601 if determinable, otherwise exactly as written in the image. */
  date: ExtractedText,
});

export const ExtractedRoundSchema = z.object({
  /** The round label as shown in the image (e.g. "Semis", "LB Round 1"). */
  name: ExtractedText,
  /** Which side of a double-elimination bracket; MAIN for everything else. */
  bracketSide: z.enum(["MAIN", "WINNERS", "LOSERS"]),
  matchups: z.array(ExtractedMatchupSchema),
});

export const ExtractedGroupRowSchema = z.object({
  teamName: ExtractedText,
  played: ExtractedCount,
  won: ExtractedCount,
  draw: ExtractedCount,
  lost: ExtractedCount,
  points: ExtractedCount,
});

export const ExtractedGroupSchema = z.object({
  /** Group label if shown (e.g. "Group A"); null for a single table. */
  name: ExtractedText,
  rows: z.array(ExtractedGroupRowSchema),
});

export const BracketExtractionSchema = z.object({
  competitionName: ExtractedText,
  format: z.enum(COMPETITION_FORMATS),
  /**
   * Below the confirmation threshold (see src/lib/ingestion) the format is
   * not pre-selected in the preview — the user must choose it explicitly.
   */
  formatConfidence: Confidence,
  /** Knockout rounds in play order, first to last. Empty for pure tables. */
  rounds: z.array(ExtractedRoundSchema),
  /** Group/league tables. Empty for pure knockout brackets. */
  groups: z.array(ExtractedGroupSchema),
  /** Free-form notes on anything the model could not read or resolve. */
  ambiguities: z.array(z.string()),
});

export type ExtractedMatchup = z.infer<typeof ExtractedMatchupSchema>;
export type ExtractedRound = z.infer<typeof ExtractedRoundSchema>;
export type ExtractedGroup = z.infer<typeof ExtractedGroupSchema>;
export type BracketExtraction = z.infer<typeof BracketExtractionSchema>;
