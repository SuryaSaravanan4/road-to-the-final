import type { Standing, Fixture, BracketNode } from "@/types/domain";

/**
 * Ground-truth data access for one sport/league/competition. Implement this
 * once per data source (e.g. football-data.org, a future NBA API) — every
 * other layer of the app (caching, reasoning, UI) depends only on this
 * interface, never on a specific provider's response shapes.
 */
export interface SportsProvider {
  readonly id: string;
  readonly sport: string;
  readonly competitionId: string;

  getStandings(): Promise<Standing[]>;
  getFixtures(): Promise<Fixture[]>;
  getResults(): Promise<Fixture[]>;
  getBracket(): Promise<BracketNode[]>;
}
