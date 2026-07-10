import { describe, expect, it } from "vitest";
import {
  eliminationRuleForFormat,
  parseCompetitionState,
  stateBracket,
  stateFixtures,
  stateResults,
  type CompetitionState,
} from "@/providers/screenshot-bracket/state";
import type { Fixture } from "@/types/domain";

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: "f1",
    stage: "SEMI_FINALS",
    homeTeamId: "a",
    homeTeamName: "Team A",
    awayTeamId: "b",
    awayTeamName: "Team B",
    utcDate: "2026-07-01T18:00:00Z",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    ...overrides,
  };
}

function row(overrides: Partial<Record<string, string | null>> = {}) {
  return {
    id: "comp1",
    name: "DDN Legends",
    sport: "soccer",
    format: "SINGLE_ELIM",
    ratingSystem: null,
    teams: JSON.stringify([{ id: "a", name: "Team A" }]),
    fixtures: JSON.stringify([]),
    standings: JSON.stringify([]),
    stageOrder: JSON.stringify(["SEMI_FINALS", "FINAL"]),
    ...overrides,
  } as Parameters<typeof parseCompetitionState>[0];
}

function state(overrides: Partial<CompetitionState>): CompetitionState {
  return {
    id: "comp1",
    name: "DDN Legends",
    sport: "soccer",
    format: "SINGLE_ELIM",
    ratingSystem: null,
    teams: [],
    fixtures: [],
    standings: [],
    stageOrder: [],
    ...overrides,
  };
}

describe("parseCompetitionState", () => {
  it("parses a valid row", () => {
    const parsed = parseCompetitionState(row());
    expect(parsed.format).toBe("SINGLE_ELIM");
    expect(parsed.stageOrder).toEqual(["SEMI_FINALS", "FINAL"]);
    expect(parsed.teams).toEqual([{ id: "a", name: "Team A" }]);
  });

  it("passes ratingSystem through untouched — a reserved axis, no Phase 1 behavior", () => {
    expect(parseCompetitionState(row()).ratingSystem).toBeNull();
    expect(parseCompetitionState(row({ ratingSystem: "ELO" })).ratingSystem).toBe("ELO");
  });

  it("rejects an unknown format", () => {
    expect(() => parseCompetitionState(row({ format: "TRIPLE_ELIM" }))).toThrow(/unknown format/);
  });

  it("rejects corrupt JSON columns with a column-specific error", () => {
    expect(() => parseCompetitionState(row({ fixtures: "not json{" }))).toThrow(/"fixtures"/);
  });
});

describe("stateFixtures", () => {
  it("sorts fixtures by the competition's own stage order", () => {
    const s = state({
      stageOrder: ["ROUND_1", "ROUND_2", "FINAL"],
      fixtures: [
        fixture({ id: "late", stage: "FINAL" }),
        fixture({ id: "early", stage: "ROUND_1" }),
        fixture({ id: "mid", stage: "ROUND_2" }),
      ],
    });

    expect(stateFixtures(s).map((f) => f.id)).toEqual(["early", "mid", "late"]);
  });

  it("does not mutate the stored fixtures array", () => {
    const fixtures = [fixture({ id: "b", stage: "FINAL" }), fixture({ id: "a", stage: "ROUND_1" })];
    const s = state({ stageOrder: ["ROUND_1", "FINAL"], fixtures });

    stateFixtures(s);

    expect(fixtures.map((f) => f.id)).toEqual(["b", "a"]);
  });
});

describe("stateResults", () => {
  it("returns only FINISHED fixtures", () => {
    const s = state({
      fixtures: [
        fixture({ id: "done", status: "FINISHED" }),
        fixture({ id: "pending", status: "SCHEDULED" }),
      ],
    });

    expect(stateResults(s).map((f) => f.id)).toEqual(["done"]);
  });
});

describe("stateBracket", () => {
  it("groups knockout fixtures by stage and excludes the group stage", () => {
    const s = state({
      stageOrder: ["GROUP_STAGE", "SEMI_FINALS", "FINAL"],
      fixtures: [
        fixture({ id: "g1", stage: "GROUP_STAGE" }),
        fixture({ id: "sf1", stage: "SEMI_FINALS" }),
        fixture({ id: "sf2", stage: "SEMI_FINALS" }),
        fixture({ id: "final", stage: "FINAL" }),
      ],
    });

    const bracket = stateBracket(s);
    expect(bracket.map((n) => n.stage)).toEqual(["SEMI_FINALS", "FINAL"]);
    expect(bracket[0].fixtures.map((f) => f.id)).toEqual(["sf1", "sf2"]);
  });
});

describe("eliminationRuleForFormat", () => {
  it("is double-loss only for double elimination", () => {
    expect(eliminationRuleForFormat("DOUBLE_ELIM")).toBe("double-loss");
    expect(eliminationRuleForFormat("SINGLE_ELIM")).toBe("single-loss");
    expect(eliminationRuleForFormat("ROUND_ROBIN")).toBe("single-loss");
    expect(eliminationRuleForFormat("GROUPS_KNOCKOUT")).toBe("single-loss");
  });
});
