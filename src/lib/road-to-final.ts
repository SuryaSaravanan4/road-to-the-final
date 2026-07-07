import { getProvider } from "@/providers/registry";
import { getCached } from "@/lib/cache";
import { rankScenarios } from "@/lib/scenario-ranking";
import { buildScenarioPrompt } from "@/reasoning/buildScenarioPrompt";
import { generateScenarios } from "@/reasoning/claude-client";
import type { RoundPath } from "@/types/domain";

const CACHE_TTL_MS = 15 * 60 * 1000;

// Forced refresh (the "Refresh" button, /api/refresh, /api/cron) still
// respects a short floor instead of always refetching — otherwise an
// unauthenticated public endpoint calling forceRefresh in a loop could
// burn through football-data.org's rate limit and the Anthropic budget.
const MIN_FORCE_REFRESH_INTERVAL_MS = 60 * 1000;

// Order used to sort whatever knockout stages actually appear in the
// provider's fixture data — not every stage needs to be present (e.g. a
// 48-team World Cup has a Round of 32 that a 32-team bracket wouldn't).
const KNOCKOUT_STAGE_ORDER = [
  "LAST_32",
  "ROUND_OF_32",
  "LAST_16",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "FINAL",
];

function stageRank(stage: string): number {
  const index = KNOCKOUT_STAGE_ORDER.indexOf(stage);
  return index === -1 ? KNOCKOUT_STAGE_ORDER.length : index;
}

export interface TournamentPathResult {
  teamName: string;
  currentStage: string;
  record: { played: number; won: number; draw: number; lost: number };
  rounds: RoundPath[];
  dataFetchedAt: string;
  stale: boolean;
}

export async function getTournamentPath(params: {
  providerKey: string;
  teamId: string;
  teamName: string;
  forceRefresh?: boolean;
}): Promise<TournamentPathResult> {
  const { providerKey, teamId, teamName, forceRefresh = false } = params;
  const provider = getProvider(providerKey);
  const ttl = forceRefresh ? MIN_FORCE_REFRESH_INTERVAL_MS : CACHE_TTL_MS;

  const [standingsResult, fixturesResult] = await Promise.all([
    getCached(`${providerKey}:standings`, ttl, () => provider.getStandings()),
    getCached(`${providerKey}:fixtures`, ttl, () => provider.getFixtures()),
  ]);

  const standings = standingsResult.data;
  const fixtures = fixturesResult.data;

  const teamStanding = standings.find((s) => s.teamId === teamId);
  const teamFixtures = fixtures.filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId);

  const knockoutStages = Array.from(
    new Set(fixtures.filter((f) => f.stage !== "GROUP_STAGE").map((f) => f.stage))
  ).sort((a, b) => stageRank(a) - stageRank(b));

  const rounds: RoundPath[] = [];

  for (const stage of knockoutStages) {
    const playedInStage = teamFixtures.find((f) => f.stage === stage && f.status === "FINISHED");
    if (playedInStage) {
      rounds.push({ stage, completed: true, result: playedInStage });
      // A confirmed knockout loss ends the road to the final — later stages
      // would otherwise still get (real, costed) Claude-generated scenarios
      // for a team that's already out. A missing winnerTeamId is treated as
      // inconclusive rather than assumed elimination.
      if (playedInStage.winnerTeamId && playedInStage.winnerTeamId !== teamId) {
        break;
      }
      continue;
    }

    const scheduledInStage = teamFixtures.find((f) => f.stage === stage);
    if (scheduledInStage) {
      const opponentIsHome = scheduledInStage.homeTeamId === teamId;
      rounds.push({
        stage,
        completed: false,
        scenarios: rankScenarios([
          {
            opponentId: (opponentIsHome ? scheduledInStage.awayTeamId : scheduledInStage.homeTeamId) ?? "unknown",
            opponentName: (opponentIsHome ? scheduledInStage.awayTeamName : scheduledInStage.homeTeamName) ?? "TBD",
            difficulty: "medium",
            likelihood: 100,
            reasoning: "Opponent confirmed by the published bracket.",
          },
        ]),
      });
      continue;
    }

    const scenarioCacheKey = `${providerKey}:${teamId}:scenarios:${stage}`;
    const scenarioResult = await getCached(scenarioCacheKey, ttl, async () => {
      const prompt = buildScenarioPrompt({
        teamName,
        currentStage: stage,
        standings,
        relevantFixtures: fixtures.filter((f) => f.stage === stage || f.stage === "GROUP_STAGE"),
      });
      const response = await generateScenarios(prompt);
      const stageEntry = response.rounds.find((r) => r.stage === stage) ?? response.rounds[0];
      return stageEntry?.scenarios ?? [];
    });

    rounds.push({ stage, completed: false, scenarios: rankScenarios(scenarioResult.data) });
  }

  // The current stage is whichever round is still in progress; if none is
  // (eliminated, or the whole run is finished), fall back to the last round
  // reached, and only default to GROUP_STAGE when no bracket exists yet.
  const currentRound = rounds.find((r) => !r.completed);
  const currentStage = currentRound?.stage ?? rounds[rounds.length - 1]?.stage ?? "GROUP_STAGE";

  return {
    teamName,
    currentStage,
    record: teamStanding
      ? { played: teamStanding.played, won: teamStanding.won, draw: teamStanding.draw, lost: teamStanding.lost }
      : { played: 0, won: 0, draw: 0, lost: 0 },
    rounds,
    dataFetchedAt: fixturesResult.cachedAt.toISOString(),
    stale: standingsResult.stale || fixturesResult.stale,
  };
}
