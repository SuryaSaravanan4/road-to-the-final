import type { Standing, Fixture, BracketNode, EliminationRule } from "@/types/domain";
import { GROUP_STAGE, stageRank } from "@/lib/stages";

/**
 * Pure mapping over a screenshot competition's confirmed canonical state
 * (the JSON columns on the Competition row). No I/O here — the provider
 * class in ./index.ts is the only thing that touches the database, so
 * everything about stage handling stays unit-testable.
 */

export const COMPETITION_FORMATS = [
  "SINGLE_ELIM",
  "DOUBLE_ELIM",
  "ROUND_ROBIN",
  "GROUPS_KNOCKOUT",
] as const;

export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number];

export interface CompetitionTeam {
  id: string;
  name: string;
}

export interface CompetitionState {
  id: string;
  name: string;
  sport: string;
  /** Bracket shape only (who plays whom) — not how advancement is scored. */
  format: CompetitionFormat;
  /**
   * How standing/advancement is determined. Null = win/loss elimination,
   * the only value Phase 1 supports; reserved for rating-based systems
   * (e.g. "ELO") where nothing here may key elimination off a single loss.
   */
  ratingSystem: string | null;
  teams: CompetitionTeam[];
  fixtures: Fixture[];
  standings: Standing[];
  stageOrder: string[];
}

interface CompetitionRow {
  id: string;
  name: string;
  sport: string;
  format: string;
  ratingSystem: string | null;
  teams: string;
  fixtures: string;
  standings: string;
  stageOrder: string;
}

function parseJsonColumn<T>(competitionId: string, column: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `Competition ${competitionId} has corrupt JSON in "${column}" — re-confirm the bracket via re-ingestion.`
    );
  }
}

export function parseCompetitionState(row: CompetitionRow): CompetitionState {
  if (!(COMPETITION_FORMATS as readonly string[]).includes(row.format)) {
    throw new Error(
      `Competition ${row.id} has unknown format "${row.format}" (expected one of ${COMPETITION_FORMATS.join(", ")})`
    );
  }

  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    format: row.format as CompetitionFormat,
    ratingSystem: row.ratingSystem,
    teams: parseJsonColumn(row.id, "teams", row.teams),
    fixtures: parseJsonColumn(row.id, "fixtures", row.fixtures),
    standings: parseJsonColumn(row.id, "standings", row.standings),
    stageOrder: parseJsonColumn(row.id, "stageOrder", row.stageOrder),
  };
}

export function stateStandings(state: CompetitionState): Standing[] {
  return state.standings;
}

export function stateFixtures(state: CompetitionState): Fixture[] {
  return [...state.fixtures].sort(
    (a, b) => stageRank(a.stage, state.stageOrder) - stageRank(b.stage, state.stageOrder)
  );
}

export function stateResults(state: CompetitionState): Fixture[] {
  return stateFixtures(state).filter((f) => f.status === "FINISHED");
}

export function stateBracket(state: CompetitionState): BracketNode[] {
  const knockout = stateFixtures(state).filter((f) => f.stage !== GROUP_STAGE);

  const byStage = new Map<string, Fixture[]>();
  for (const fixture of knockout) {
    const list = byStage.get(fixture.stage) ?? [];
    list.push(fixture);
    byStage.set(fixture.stage, list);
  }

  return Array.from(byStage.entries()).map(([stage, fixtures]) => ({ stage, fixtures }));
}

export function eliminationRuleForFormat(format: CompetitionFormat): EliminationRule {
  return format === "DOUBLE_ELIM" ? "double-loss" : "single-loss";
}
