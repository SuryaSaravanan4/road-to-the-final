import { fdRequest } from "./client";
import type { SportsProvider } from "../SportsProvider";
import type { Standing, Fixture, BracketNode } from "@/types/domain";

interface FDTeam {
  id: number;
  name: string;
}

interface FDStandingRow {
  position: number;
  team: FDTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalDifference: number;
}

interface FDStandingsGroup {
  group?: string;
  table: FDStandingRow[];
}

interface FDStandingsResponse {
  standings: FDStandingsGroup[];
}

interface FDMatch {
  id: number;
  stage: string;
  utcDate: string;
  status: string;
  homeTeam: FDTeam | null;
  awayTeam: FDTeam | null;
  score: {
    winner: string | null;
    fullTime: { home: number | null; away: number | null };
  };
}

interface FDMatchesResponse {
  matches: FDMatch[];
}

function toStanding(row: FDStandingRow, group?: string): Standing {
  return {
    teamId: String(row.team.id),
    teamName: row.team.name,
    group,
    position: row.position,
    played: row.playedGames,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    points: row.points,
    goalDifference: row.goalDifference,
  };
}

function toFixture(m: FDMatch): Fixture {
  const homeId = m.homeTeam ? String(m.homeTeam.id) : null;
  const awayId = m.awayTeam ? String(m.awayTeam.id) : null;

  return {
    id: String(m.id),
    stage: m.stage,
    homeTeamId: homeId,
    homeTeamName: m.homeTeam?.name ?? null,
    awayTeamId: awayId,
    awayTeamName: m.awayTeam?.name ?? null,
    utcDate: m.utcDate,
    status: m.status,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    winnerTeamId:
      m.score.winner === "HOME_TEAM" ? homeId : m.score.winner === "AWAY_TEAM" ? awayId : null,
  };
}

/** SportsProvider backed by football-data.org, scoped to a single competition (default: FIFA World Cup). */
export class FootballDataOrgProvider implements SportsProvider {
  readonly id = "football-data-org";
  readonly sport = "soccer";
  readonly competitionId: string;

  constructor(competitionId: string = "WC") {
    this.competitionId = competitionId;
  }

  async getStandings(): Promise<Standing[]> {
    const data = await fdRequest<FDStandingsResponse>(
      `/competitions/${this.competitionId}/standings`
    );
    return data.standings.flatMap((group) =>
      group.table.map((row) => toStanding(row, group.group))
    );
  }

  async getFixtures(): Promise<Fixture[]> {
    const data = await fdRequest<FDMatchesResponse>(`/competitions/${this.competitionId}/matches`);
    return data.matches.map(toFixture);
  }

  async getResults(): Promise<Fixture[]> {
    const fixtures = await this.getFixtures();
    return fixtures.filter((f) => f.status === "FINISHED");
  }

  async getBracket(): Promise<BracketNode[]> {
    const fixtures = await this.getFixtures();
    const knockout = fixtures.filter((f) => f.stage !== "GROUP_STAGE");

    const byStage = new Map<string, Fixture[]>();
    for (const fixture of knockout) {
      const list = byStage.get(fixture.stage) ?? [];
      list.push(fixture);
      byStage.set(fixture.stage, list);
    }

    return Array.from(byStage.entries()).map(([stage, stageFixtures]) => ({
      stage,
      fixtures: stageFixtures,
    }));
  }
}
