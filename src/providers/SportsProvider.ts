import type { Standing, Fixture, BracketNode, EliminationRule } from "@/types/domain";

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

  /**
   * The competition's real round order, first to last. Optional: providers
   * whose stage names come from a fixed vocabulary (football-data.org) can
   * omit it and the orchestration falls back to KNOCKOUT_STAGE_ORDER
   * (src/lib/stages.ts).
   */
  getStageOrder?(): Promise<string[]>;

  /**
   * How losses eliminate in this competition. Optional: defaults to
   * "single-loss" (one knockout loss ends the road).
   */
  getEliminationRule?(): Promise<EliminationRule>;
}
