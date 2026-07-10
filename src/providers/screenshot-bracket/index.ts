import { prisma } from "@/lib/db";
import type { SportsProvider } from "../SportsProvider";
import type { Standing, Fixture, BracketNode, EliminationRule } from "@/types/domain";
import {
  parseCompetitionState,
  stateStandings,
  stateFixtures,
  stateResults,
  stateBracket,
  eliminationRuleForFormat,
  type CompetitionState,
} from "./state";

/**
 * SportsProvider backed by a user-confirmed screenshot competition stored in
 * the Competition table. Only confirmed state is ever read — a DRAFT
 * ingestion is invisible to this provider, so unconfirmed OCR output can
 * never become ground truth.
 */
export class ScreenshotBracketProvider implements SportsProvider {
  readonly id = "screenshot-bracket";
  readonly sport: string = "unknown";
  readonly competitionId: string;

  private statePromise: Promise<CompetitionState> | undefined;

  constructor(competitionId: string) {
    this.competitionId = competitionId;
  }

  // One DB read per provider instance (= per request); the row is small and
  // every getter maps from the same parsed state.
  private loadState(): Promise<CompetitionState> {
    this.statePromise ??= prisma.competition
      .findUnique({ where: { id: this.competitionId } })
      .then((row) => {
        if (!row) {
          throw new Error(
            `Screenshot competition "${this.competitionId}" not found — it may not have been confirmed yet.`
          );
        }
        return parseCompetitionState(row);
      });
    return this.statePromise;
  }

  async getStandings(): Promise<Standing[]> {
    return stateStandings(await this.loadState());
  }

  async getFixtures(): Promise<Fixture[]> {
    return stateFixtures(await this.loadState());
  }

  async getResults(): Promise<Fixture[]> {
    return stateResults(await this.loadState());
  }

  async getBracket(): Promise<BracketNode[]> {
    return stateBracket(await this.loadState());
  }

  async getStageOrder(): Promise<string[]> {
    return (await this.loadState()).stageOrder;
  }

  async getEliminationRule(): Promise<EliminationRule> {
    return eliminationRuleForFormat((await this.loadState()).format);
  }
}
