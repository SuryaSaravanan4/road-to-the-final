export interface Standing {
  teamId: string;
  teamName: string;
  group?: string;
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalDifference: number;
}

export interface Fixture {
  id: string;
  stage: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  utcDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
}

export interface BracketNode {
  stage: string;
  fixtures: Fixture[];
}

/**
 * How a confirmed loss affects a team's road to the final:
 * - "single-loss": one knockout loss eliminates (single-elimination brackets,
 *   the default for every provider that doesn't say otherwise).
 * - "double-loss": only a losers-bracket loss (or a grand-final loss)
 *   eliminates — double-elimination brackets.
 */
export type EliminationRule = "single-loss" | "double-loss";

export type Difficulty = "easy" | "medium" | "hard";

export interface ScenarioInput {
  opponentId: string;
  opponentName: string;
  difficulty: Difficulty;
  /** 0-100 probability this specific matchup occurs. */
  likelihood: number;
  reasoning: string;
}

export interface RankedScenario extends ScenarioInput {
  rank: number;
}

export interface RoundPath {
  stage: string;
  completed: boolean;
  /** Set when completed=true: the actual match that was played. */
  result?: Fixture;
  /** Set when completed=false: every realistic opponent scenario, ranked. */
  scenarios?: RankedScenario[];
}
