import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTournamentPath } from "@/lib/road-to-final";
import { getProvider } from "@/providers/registry";
import { generateScenarios } from "@/reasoning/claude-client";
import type { SportsProvider } from "@/providers/SportsProvider";
import type { EliminationRule, Fixture, Standing } from "@/types/domain";

vi.mock("@/providers/registry", () => ({
  getProvider: vi.fn(),
}));

// The cache is exercised elsewhere; here it becomes a pass-through so the
// orchestration logic is what's under test.
vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => ({
    data: await fetcher(),
    cachedAt: new Date("2026-07-09T00:00:00Z"),
    stale: false,
  })),
}));

vi.mock("@/reasoning/claude-client", () => ({
  generateScenarios: vi.fn(),
}));

const TEAM = "us";

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: Math.random().toString(36).slice(2),
    stage: "SEMI_FINALS",
    homeTeamId: TEAM,
    homeTeamName: "United States",
    awayTeamId: "opp",
    awayTeamName: "Opponent",
    utcDate: "2026-07-01T18:00:00Z",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    ...overrides,
  };
}

function fakeProvider(opts: {
  fixtures: Fixture[];
  standings?: Standing[];
  stageOrder?: string[];
  eliminationRule?: EliminationRule;
}): SportsProvider {
  const provider: SportsProvider = {
    id: "fake",
    sport: "test",
    competitionId: "fake-comp",
    getStandings: async () => opts.standings ?? [],
    getFixtures: async () => opts.fixtures,
    getResults: async () => opts.fixtures.filter((f) => f.status === "FINISHED"),
    getBracket: async () => [],
  };
  if (opts.stageOrder) provider.getStageOrder = async () => opts.stageOrder!;
  if (opts.eliminationRule) provider.getEliminationRule = async () => opts.eliminationRule!;
  return provider;
}

function track(provider: SportsProvider) {
  vi.mocked(getProvider).mockReturnValue(provider);
  return getTournamentPath({ providerKey: "fake", teamId: TEAM, teamName: "United States" });
}

beforeEach(() => {
  vi.mocked(getProvider).mockReset();
  vi.mocked(generateScenarios).mockReset();
  vi.mocked(generateScenarios).mockResolvedValue({ rounds: [] });
});

describe("getTournamentPath — single elimination", () => {
  it("ends the road after a confirmed knockout loss and never calls Claude for later stages", async () => {
    const result = await track(
      fakeProvider({
        fixtures: [
          fixture({ stage: "QUARTER_FINALS", status: "FINISHED", winnerTeamId: "opp" }),
          fixture({ stage: "SEMI_FINALS", homeTeamId: "x", awayTeamId: "y" }),
          fixture({ stage: "FINAL", homeTeamId: null, awayTeamId: null }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual(["QUARTER_FINALS"]);
    expect(result.rounds[0].completed).toBe(true);
    expect(generateScenarios).not.toHaveBeenCalled();
  });

  it("treats a finished match without winnerTeamId as inconclusive, not elimination", async () => {
    const result = await track(
      fakeProvider({
        fixtures: [
          fixture({ stage: "QUARTER_FINALS", status: "FINISHED", winnerTeamId: null }),
          fixture({ stage: "SEMI_FINALS", homeTeamId: "x", awayTeamId: "y" }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual(["QUARTER_FINALS", "SEMI_FINALS"]);
  });

  it("short-circuits Claude entirely when the opponent is confirmed by the bracket", async () => {
    const result = await track(
      fakeProvider({
        fixtures: [fixture({ stage: "SEMI_FINALS", awayTeamId: "opp", awayTeamName: "Opponent" })],
      })
    );

    const scenarios = result.rounds[0].scenarios!;
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({ opponentId: "opp", likelihood: 100, source: "bracket" });
    expect(generateScenarios).not.toHaveBeenCalled();
  });

  it("asks Claude for unknown opponents and ranks the schema-validated result", async () => {
    vi.mocked(generateScenarios).mockResolvedValue({
      rounds: [
        {
          stage: "SEMI_FINALS",
          scenarios: [
            { opponentId: "h", opponentName: "Hard", difficulty: "hard", likelihood: 60, reasoning: "r" },
            { opponentId: "e", opponentName: "Easy", difficulty: "easy", likelihood: 40, reasoning: "r" },
          ],
        },
      ],
    });

    const result = await track(
      fakeProvider({
        // The stage exists in the bracket but the tracked team has no fixture
        // in it yet — the reasoning path.
        fixtures: [fixture({ stage: "SEMI_FINALS", homeTeamId: "x", awayTeamId: "y" })],
      })
    );

    expect(generateScenarios).toHaveBeenCalledTimes(1);
    expect(result.rounds[0].scenarios!.map((s) => s.opponentId)).toEqual(["e", "h"]);
    expect(result.rounds[0].scenarios![0].rank).toBe(1);
    // Claude-assessed scenarios are the feedback targets.
    expect(result.rounds[0].scenarios!.every((s) => s.source === "model")).toBe(true);
  });

  it("derives the record from finished fixtures when standings are empty", async () => {
    const result = await track(
      fakeProvider({
        fixtures: [
          fixture({ stage: "QUARTER_FINALS", status: "FINISHED", winnerTeamId: TEAM }),
          fixture({ stage: "SEMI_FINALS", status: "FINISHED", winnerTeamId: "opp" }),
        ],
      })
    );

    expect(result.record).toEqual({ played: 2, won: 1, draw: 0, lost: 1 });
  });

  it("orders rounds by the provider-supplied stage order", async () => {
    const result = await track(
      fakeProvider({
        stageOrder: ["OPENING_ROUND", "CHAMPIONSHIP"],
        fixtures: [
          // Listed final-first to prove sorting comes from stageOrder, not
          // fixture insertion order.
          fixture({ stage: "CHAMPIONSHIP", homeTeamId: "x", awayTeamId: "y" }),
          fixture({ stage: "OPENING_ROUND", awayTeamId: "opp" }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual(["OPENING_ROUND", "CHAMPIONSHIP"]);
  });
});

describe("getTournamentPath — double elimination", () => {
  const stageOrder = ["WB_SEMI_FINALS", "WB_FINAL", "LB_ROUND_1", "LB_FINAL", "GRAND_FINAL"];

  it("skips losers-bracket rounds while the team is alive in the winners bracket", async () => {
    const result = await track(
      fakeProvider({
        stageOrder,
        eliminationRule: "double-loss",
        fixtures: [
          fixture({ stage: "WB_SEMI_FINALS", status: "FINISHED", winnerTeamId: TEAM }),
          fixture({ stage: "WB_FINAL", awayTeamId: "opp" }),
          fixture({ stage: "LB_ROUND_1", homeTeamId: "x", awayTeamId: "y" }),
          fixture({ stage: "LB_FINAL", homeTeamId: null, awayTeamId: null }),
          fixture({ stage: "GRAND_FINAL", homeTeamId: null, awayTeamId: null }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual([
      "WB_SEMI_FINALS",
      "WB_FINAL",
      "GRAND_FINAL",
    ]);
  });

  it("continues into the losers bracket after a winners-bracket loss and drops later winners-bracket rounds", async () => {
    const result = await track(
      fakeProvider({
        stageOrder,
        eliminationRule: "double-loss",
        fixtures: [
          fixture({ stage: "WB_SEMI_FINALS", status: "FINISHED", winnerTeamId: "opp" }),
          fixture({ stage: "WB_FINAL", homeTeamId: "x", awayTeamId: "y" }),
          fixture({ stage: "LB_ROUND_1", homeTeamId: "x2", awayTeamId: "y2" }),
          fixture({ stage: "GRAND_FINAL", homeTeamId: null, awayTeamId: null }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual([
      "WB_SEMI_FINALS",
      "LB_ROUND_1",
      "GRAND_FINAL",
    ]);
  });

  it("ends the road on a losers-bracket loss", async () => {
    const result = await track(
      fakeProvider({
        stageOrder,
        eliminationRule: "double-loss",
        fixtures: [
          fixture({ stage: "WB_SEMI_FINALS", status: "FINISHED", winnerTeamId: "opp" }),
          fixture({ stage: "LB_ROUND_1", status: "FINISHED", winnerTeamId: "opp" }),
          fixture({ stage: "GRAND_FINAL", homeTeamId: null, awayTeamId: null }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual(["WB_SEMI_FINALS", "LB_ROUND_1"]);
    expect(generateScenarios).not.toHaveBeenCalled();
  });

  it("includes a losers-bracket round the bracket already schedules the team into", async () => {
    const result = await track(
      fakeProvider({
        stageOrder,
        eliminationRule: "double-loss",
        fixtures: [
          // No finished WB loss recorded (e.g. the screenshot only shows the
          // current state), but the team is explicitly scheduled in LB.
          fixture({ stage: "LB_ROUND_1", awayTeamId: "opp" }),
          fixture({ stage: "GRAND_FINAL", homeTeamId: null, awayTeamId: null }),
        ],
      })
    );

    expect(result.rounds.map((r) => r.stage)).toEqual(["LB_ROUND_1", "GRAND_FINAL"]);
    expect(result.rounds[0].scenarios![0]).toMatchObject({ opponentId: "opp", likelihood: 100 });
  });
});
