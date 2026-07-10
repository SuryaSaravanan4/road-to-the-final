import { z } from "zod";
import type { Fixture, Standing } from "@/types/domain";
import {
  GROUP_STAGE,
  GRAND_FINAL_STAGE,
  LOSERS_BRACKET_PREFIX,
  WINNERS_BRACKET_PREFIX,
} from "@/lib/stages";
import {
  COMPETITION_FORMATS,
  type CompetitionFormat,
  type CompetitionTeam,
} from "@/providers/screenshot-bracket/state";

/**
 * Deterministic conversion of a user-corrected extraction into a proposed
 * competition state. Pure — usable both server-side (the confirm endpoint)
 * and client-side (the live diff preview during re-ingestion). Everything an
 * LLM must never decide happens here in plain code: canonical stage keys,
 * stable team ids, fixture status, and winner resolution.
 */

// The confirm request body is human input, so it gets the same rejection
// rigor as model output — this is the values-only sibling of
// bracketExtractionSchema.ts (confidences have served their purpose by
// confirm time; the human has reviewed the flagged fields).
export const CorrectedMatchupSchema = z.object({
  homeTeamName: z.string().nullable(),
  awayTeamName: z.string().nullable(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  winnerTeamName: z.string().nullable(),
  date: z.string().nullable(),
});

export const CorrectedRoundSchema = z.object({
  name: z.string().min(1),
  bracketSide: z.enum(["MAIN", "WINNERS", "LOSERS"]),
  matchups: z.array(CorrectedMatchupSchema),
});

export const CorrectedGroupRowSchema = z.object({
  teamName: z.string().min(1),
  played: z.number().int().nullable(),
  won: z.number().int().nullable(),
  draw: z.number().int().nullable(),
  lost: z.number().int().nullable(),
  points: z.number().int().nullable(),
});

export const CorrectedGroupSchema = z.object({
  name: z.string().nullable(),
  rows: z.array(CorrectedGroupRowSchema),
});

export const CorrectedExtractionSchema = z.object({
  competitionName: z.string().min(1),
  format: z.enum(COMPETITION_FORMATS),
  rounds: z.array(CorrectedRoundSchema),
  groups: z.array(CorrectedGroupSchema),
});

export type CorrectedMatchup = z.infer<typeof CorrectedMatchupSchema>;
export type CorrectedRound = z.infer<typeof CorrectedRoundSchema>;
export type CorrectedExtraction = z.infer<typeof CorrectedExtractionSchema>;

export interface ProposedState {
  name: string;
  format: CompetitionFormat;
  teams: CompetitionTeam[];
  fixtures: Fixture[];
  standings: Standing[];
  stageOrder: string[];
}

function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Case-insensitive identity key — "Team A" and "team  a" are one team. */
function teamKey(name: string): string {
  return normalizeTeamName(name).toLowerCase();
}

function slugifyTeamId(name: string): string {
  const slug = normalizeTeamName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "team";
}

/**
 * Assigns stable team ids: teams already known to the competition keep the
 * id they were confirmed with (this is what keeps re-ingestion from forking
 * team identity), new teams get a slug id deduped against everything taken.
 */
class TeamRegistry {
  private byKey = new Map<string, CompetitionTeam>();
  private takenIds = new Set<string>();

  constructor(existingTeams: CompetitionTeam[]) {
    for (const team of existingTeams) {
      this.byKey.set(teamKey(team.name), team);
      this.takenIds.add(team.id);
    }
  }

  resolve(rawName: string): CompetitionTeam {
    const key = teamKey(rawName);
    const existing = this.byKey.get(key);
    if (existing) return existing;

    const base = slugifyTeamId(rawName);
    let id = base;
    for (let n = 2; this.takenIds.has(id); n++) id = `${base}-${n}`;

    const team = { id, name: normalizeTeamName(rawName) };
    this.byKey.set(key, team);
    this.takenIds.add(id);
    return team;
  }

  all(): CompetitionTeam[] {
    return Array.from(this.byKey.values());
  }
}

function normalizeStageKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stageKeyForRound(
  format: CompetitionFormat,
  round: CorrectedRound,
  index: number,
  taken: Set<string>
): string {
  let base = normalizeStageKey(round.name) || `ROUND_${index + 1}`;

  if (format === "DOUBLE_ELIM") {
    if (round.bracketSide === "WINNERS" && !base.startsWith(WINNERS_BRACKET_PREFIX)) {
      base = `${WINNERS_BRACKET_PREFIX}${base}`;
    } else if (round.bracketSide === "LOSERS" && !base.startsWith(LOSERS_BRACKET_PREFIX)) {
      base = `${LOSERS_BRACKET_PREFIX}${base}`;
    } else if (round.bracketSide === "MAIN") {
      // The one main-bracket round of a double elimination is the winners-vs-
      // losers final — the stage key road-to-final's elimination rule and
      // shortest-road filtering key off.
      base = GRAND_FINAL_STAGE;
    }
  }

  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

/** Parseable, year-bearing dates normalize to ISO; anything else is dropped
 * from the fixture (the as-written text survives in the stored corrections). */
function normalizeDate(raw: string | null): string {
  if (!raw || !/\d{4}/.test(raw)) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function buildFixture(
  matchup: CorrectedMatchup,
  stageKey: string,
  indexInStage: number,
  teams: TeamRegistry
): Fixture {
  const home = matchup.homeTeamName ? teams.resolve(matchup.homeTeamName) : null;
  const away = matchup.awayTeamName ? teams.resolve(matchup.awayTeamName) : null;

  let winnerTeamId: string | null = null;
  if (matchup.winnerTeamName) {
    const winnerKey = teamKey(matchup.winnerTeamName);
    if (home && teamKey(home.name) === winnerKey) winnerTeamId = home.id;
    else if (away && teamKey(away.name) === winnerKey) winnerTeamId = away.id;
    else {
      throw new Error(
        `Winner "${matchup.winnerTeamName}" in ${stageKey} is neither listed team — correct the matchup before confirming.`
      );
    }
  } else if (
    matchup.homeScore !== null &&
    matchup.awayScore !== null &&
    matchup.homeScore !== matchup.awayScore
  ) {
    winnerTeamId = matchup.homeScore > matchup.awayScore ? home?.id ?? null : away?.id ?? null;
  }

  const hasScores = matchup.homeScore !== null && matchup.awayScore !== null;

  return {
    id: `${stageKey.toLowerCase()}-m${indexInStage + 1}`,
    stage: stageKey,
    homeTeamId: home?.id ?? null,
    homeTeamName: home?.name ?? null,
    awayTeamId: away?.id ?? null,
    awayTeamName: away?.name ?? null,
    utcDate: normalizeDate(matchup.date),
    // Equal scores with no marked winner stay FINISHED with winnerTeamId
    // null — road-to-final already treats that as inconclusive, not a loss.
    status: winnerTeamId !== null || hasScores ? "FINISHED" : "SCHEDULED",
    homeScore: matchup.homeScore,
    awayScore: matchup.awayScore,
    winnerTeamId,
  };
}

function buildStandings(extraction: CorrectedExtraction, teams: TeamRegistry): Standing[] {
  const standings: Standing[] = [];

  for (const group of extraction.groups) {
    // Rank by points when the table shows them, otherwise trust the row
    // order the screenshot displayed.
    const rows = group.rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => (b.row.points ?? -1) - (a.row.points ?? -1) || a.index - b.index);

    rows.forEach(({ row }, position) => {
      const team = teams.resolve(row.teamName);
      standings.push({
        teamId: team.id,
        teamName: team.name,
        group: group.name ?? undefined,
        position: position + 1,
        played: row.played ?? 0,
        won: row.won ?? 0,
        draw: row.draw ?? 0,
        lost: row.lost ?? 0,
        points: row.points ?? 0,
        goalDifference: 0,
      });
    });
  }

  return standings;
}

export function draftToState(
  corrected: CorrectedExtraction,
  existingTeams: CompetitionTeam[] = []
): ProposedState {
  const teams = new TeamRegistry(existingTeams);
  const takenStageKeys = new Set<string>();

  const stageOrder: string[] = [];
  if (corrected.groups.length > 0) stageOrder.push(GROUP_STAGE);

  const fixtures: Fixture[] = [];
  corrected.rounds.forEach((round, roundIndex) => {
    const stageKey = stageKeyForRound(corrected.format, round, roundIndex, takenStageKeys);
    stageOrder.push(stageKey);
    round.matchups.forEach((matchup, matchupIndex) => {
      fixtures.push(buildFixture(matchup, stageKey, matchupIndex, teams));
    });
  });

  const standings = buildStandings(corrected, teams);

  return {
    name: corrected.competitionName.trim(),
    format: corrected.format,
    teams: teams.all(),
    fixtures,
    standings,
    stageOrder,
  };
}
