import { describe, expect, it } from "vitest";
import {
  CorrectedExtractionSchema,
  draftToState,
  type CorrectedExtraction,
  type CorrectedMatchup,
} from "@/lib/draft-to-state";

function matchup(overrides: Partial<CorrectedMatchup> = {}): CorrectedMatchup {
  return {
    homeTeamName: "Team A",
    awayTeamName: "Team B",
    homeScore: null,
    awayScore: null,
    winnerTeamName: null,
    date: null,
    ...overrides,
  };
}

function extraction(overrides: Partial<CorrectedExtraction> = {}): CorrectedExtraction {
  return {
    competitionName: "DDN Legends",
    format: "SINGLE_ELIM",
    rounds: [
      { name: "Semifinals", bracketSide: "MAIN", matchups: [matchup()] },
      { name: "Final", bracketSide: "MAIN", matchups: [matchup({ homeTeamName: null, awayTeamName: null })] },
    ],
    groups: [],
    ...overrides,
  };
}

describe("CorrectedExtractionSchema", () => {
  it("rejects an empty round name", () => {
    expect(() =>
      CorrectedExtractionSchema.parse(
        extraction({ rounds: [{ name: "", bracketSide: "MAIN", matchups: [] }] })
      )
    ).toThrow();
  });

  it("rejects an empty competition name", () => {
    expect(() => CorrectedExtractionSchema.parse(extraction({ competitionName: "" }))).toThrow();
  });
});

describe("draftToState — stages", () => {
  it("derives stage keys from round names and keeps play order", () => {
    const state = draftToState(extraction());
    expect(state.stageOrder).toEqual(["SEMIFINALS", "FINAL"]);
    expect(state.fixtures.map((f) => f.stage)).toEqual(["SEMIFINALS", "FINAL"]);
  });

  it("prefixes double-elimination stages by bracket side and names the main round GRAND_FINAL", () => {
    const state = draftToState(
      extraction({
        format: "DOUBLE_ELIM",
        rounds: [
          { name: "Round 1", bracketSide: "WINNERS", matchups: [matchup()] },
          { name: "LB Round 1", bracketSide: "LOSERS", matchups: [matchup({ homeTeamName: "Team C", awayTeamName: "Team D" })] },
          { name: "Final", bracketSide: "MAIN", matchups: [matchup({ homeTeamName: null, awayTeamName: null })] },
        ],
      })
    );
    // "LB Round 1" already normalizes with the prefix — no double prefix.
    expect(state.stageOrder).toEqual(["WB_ROUND_1", "LB_ROUND_1", "GRAND_FINAL"]);
  });

  it("dedupes colliding stage keys deterministically", () => {
    const state = draftToState(
      extraction({
        rounds: [
          { name: "Round 1", bracketSide: "MAIN", matchups: [] },
          { name: "Round #1!", bracketSide: "MAIN", matchups: [] },
        ],
      })
    );
    expect(state.stageOrder).toEqual(["ROUND_1", "ROUND_1_2"]);
  });

  it("includes GROUP_STAGE in the order only when groups exist", () => {
    expect(draftToState(extraction()).stageOrder).not.toContain("GROUP_STAGE");
    const withGroups = draftToState(
      extraction({
        groups: [{ name: "Group A", rows: [{ teamName: "Team A", played: 1, won: 1, draw: 0, lost: 0, points: 3 }] }],
      })
    );
    expect(withGroups.stageOrder[0]).toBe("GROUP_STAGE");
  });
});

describe("draftToState — teams", () => {
  it("treats differently-cased and spaced names as one team", () => {
    const state = draftToState(
      extraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [matchup({ homeTeamName: "Team  A", awayTeamName: "team a" })],
          },
        ],
      })
    );
    expect(state.teams).toHaveLength(1);
  });

  it("keeps ids stable across re-ingestion via existing teams", () => {
    const state = draftToState(extraction(), [{ id: "legacy-a", name: "Team A" }]);
    expect(state.fixtures[0].homeTeamId).toBe("legacy-a");
    expect(state.teams.find((t) => t.name === "Team B")?.id).toBe("team-b");
  });

  it("dedupes slug collisions between distinct teams", () => {
    const state = draftToState(
      extraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [matchup({ homeTeamName: "Team A!", awayTeamName: "Team A?" })],
          },
        ],
      })
    );
    const ids = state.teams.map((t) => t.id).sort();
    expect(ids).toEqual(["team-a", "team-a-2"]);
  });
});

describe("draftToState — fixtures", () => {
  it("resolves the winner from an explicit winner name", () => {
    const state = draftToState(
      extraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [matchup({ winnerTeamName: "Team B" })],
          },
        ],
      })
    );
    const fixture = state.fixtures[0];
    expect(fixture.winnerTeamId).toBe("team-b");
    expect(fixture.status).toBe("FINISHED");
  });

  it("resolves the winner from unequal scores when no winner is marked", () => {
    const state = draftToState(
      extraction({
        rounds: [
          { name: "Final", bracketSide: "MAIN", matchups: [matchup({ homeScore: 1, awayScore: 3 })] },
        ],
      })
    );
    expect(state.fixtures[0].winnerTeamId).toBe("team-b");
  });

  it("leaves equal scores FINISHED but inconclusive", () => {
    const state = draftToState(
      extraction({
        rounds: [
          { name: "Final", bracketSide: "MAIN", matchups: [matchup({ homeScore: 2, awayScore: 2 })] },
        ],
      })
    );
    expect(state.fixtures[0].status).toBe("FINISHED");
    expect(state.fixtures[0].winnerTeamId).toBeNull();
  });

  it("keeps TBD slots SCHEDULED with null teams", () => {
    const state = draftToState(extraction());
    const final = state.fixtures.find((f) => f.stage === "FINAL")!;
    expect(final.homeTeamId).toBeNull();
    expect(final.status).toBe("SCHEDULED");
  });

  it("rejects a winner that is neither listed team", () => {
    expect(() =>
      draftToState(
        extraction({
          rounds: [
            { name: "Final", bracketSide: "MAIN", matchups: [matchup({ winnerTeamName: "Team Z" })] },
          ],
        })
      )
    ).toThrow(/neither listed team/);
  });

  it("normalizes parseable dates to ISO and drops unparseable ones", () => {
    const state = draftToState(
      extraction({
        rounds: [
          {
            name: "Final",
            bracketSide: "MAIN",
            matchups: [
              matchup({ date: "2026-07-01" }),
              matchup({ homeTeamName: "Team C", awayTeamName: "Team D", date: "next saturday" }),
            ],
          },
        ],
      })
    );
    expect(state.fixtures[0].utcDate).toMatch(/^2026-07-01T/);
    expect(state.fixtures[1].utcDate).toBe("");
  });
});

describe("draftToState — standings", () => {
  it("ranks group rows by points, falling back to screenshot order", () => {
    const state = draftToState(
      extraction({
        rounds: [],
        groups: [
          {
            name: "Group A",
            rows: [
              { teamName: "Second", played: 3, won: 1, draw: 1, lost: 1, points: 4 },
              { teamName: "First", played: 3, won: 3, draw: 0, lost: 0, points: 9 },
            ],
          },
        ],
      })
    );
    expect(state.standings.map((s) => s.teamName)).toEqual(["First", "Second"]);
    expect(state.standings[0].position).toBe(1);
    expect(state.standings[0].group).toBe("Group A");
  });
});
