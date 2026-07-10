import type { EliminationRule } from "@/types/domain";

/**
 * Stage-name conventions shared by every provider and the orchestration in
 * road-to-final.ts. Pure data + pure functions, no I/O.
 */

/** Canonical name for group/round-robin play — excluded from knockout rounds. */
export const GROUP_STAGE = "GROUP_STAGE";

/**
 * Double-elimination conventions for screenshot-ingested brackets: losers
 * bracket stages are prefixed, and the (winners-vs-losers) final has a fixed
 * name. Winners-bracket stages carry a "WB_" prefix by symmetry but nothing
 * keys off it.
 */
export const WINNERS_BRACKET_PREFIX = "WB_";
export const LOSERS_BRACKET_PREFIX = "LB_";
export const GRAND_FINAL_STAGE = "GRAND_FINAL";

/**
 * Fallback ordering for providers that don't publish their own round order
 * (football-data.org's fixed stage vocabulary). Not every stage needs to be
 * present in the data — e.g. a 48-team World Cup has a Round of 32 that a
 * 32-team bracket wouldn't.
 */
export const KNOCKOUT_STAGE_ORDER = [
  "LAST_32",
  "ROUND_OF_32",
  "LAST_16",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "FINAL",
];

/** Position of `stage` in `order`; unknown stages sort after all known ones. */
export function stageRank(stage: string, order: string[]): number {
  const index = order.indexOf(stage);
  return index === -1 ? order.length : index;
}

export function isLosersBracketStage(stage: string): boolean {
  return stage.startsWith(LOSERS_BRACKET_PREFIX);
}

/**
 * Whether a confirmed loss in `stage` ends the team's road to the final.
 * Under double elimination a winners-bracket loss only drops the team into
 * the losers bracket; only a losers-bracket or grand-final loss eliminates.
 */
export function lossEndsRoad(stage: string, rule: EliminationRule): boolean {
  if (rule === "single-loss") return true;
  return isLosersBracketStage(stage) || stage === GRAND_FINAL_STAGE;
}
