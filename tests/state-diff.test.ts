import { describe, expect, it } from "vitest";
import type { Fixture } from "@/types/domain";
import type { ProposedState } from "@/lib/draft-to-state";
import { diffStates, mergeStageOrder, mergeStates, type ExistingState } from "@/lib/state-diff";

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: "sf-m1",
    stage: "SEMIFINALS",
    homeTeamId: "team-a",
    homeTeamName: "Team A",
    awayTeamId: "team-b",
    awayTeamName: "Team B",
    utcDate: "",
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingState> = {}): ExistingState {
  return {
    name: "DDN Legends",
    format: "SINGLE_ELIM",
    teams: [
      { id: "team-a", name: "Team A" },
      { id: "team-b", name: "Team B" },
    ],
    fixtures: [fixture({})],
    standings: [],
    stageOrder: ["SEMIFINALS", "FINAL"],
    ...overrides,
  };
}

function proposed(overrides: Partial<ProposedState> = {}): ProposedState {
  return {
    name: "DDN Legends",
    format: "SINGLE_ELIM",
    teams: [
      { id: "team-a", name: "Team A" },
      { id: "team-b", name: "Team B" },
    ],
    fixtures: [fixture({})],
    standings: [],
    stageOrder: ["SEMIFINALS", "FINAL"],
    ...overrides,
  };
}

describe("diffStates", () => {
  it("reports no changes for an identical proposal", () => {
    const diff = diffStates(existing(), proposed());
    expect(diff.changedFixtures).toHaveLength(0);
    expect(diff.addedFixtures).toHaveLength(0);
    expect(diff.unchangedFixtureCount).toBe(1);
  });

  it("flags a contradicted result as a change with the exact fields", () => {
    const diff = diffStates(
      existing({ fixtures: [fixture({ status: "FINISHED", homeScore: 2, awayScore: 1, winnerTeamId: "team-a" })] }),
      proposed({ fixtures: [fixture({ status: "FINISHED", homeScore: 2, awayScore: 3, winnerTeamId: "team-b" })] })
    );
    expect(diff.changedFixtures).toHaveLength(1);
    expect(diff.changedFixtures[0].changedFields.sort()).toEqual(["awayScore", "winnerTeamId"]);
  });

  it("matches by team pair even when home/away are flipped", () => {
    const diff = diffStates(
      existing(),
      proposed({
        fixtures: [
          fixture({
            homeTeamId: "team-b",
            homeTeamName: "Team B",
            awayTeamId: "team-a",
            awayTeamName: "Team A",
          }),
        ],
      })
    );
    // Same pair, but the sides swapped — that IS a field-level change.
    expect(diff.addedFixtures).toHaveLength(0);
    expect(diff.changedFixtures).toHaveLength(1);
  });

  it("matches TBD slots positionally within a stage", () => {
    const tbd = fixture({ id: "f-m1", stage: "FINAL", homeTeamId: null, homeTeamName: null, awayTeamId: null, awayTeamName: null });
    const nowKnown = fixture({ id: "f-m1", stage: "FINAL", homeTeamId: "team-a", homeTeamName: "Team A", awayTeamId: null, awayTeamName: null });
    const diff = diffStates(existing({ fixtures: [tbd] }), proposed({ fixtures: [nowKnown] }));
    expect(diff.addedFixtures).toHaveLength(0);
    expect(diff.changedFixtures[0].changedFields).toContain("homeTeamId");
  });

  it("reports genuinely new fixtures, stages, and teams as additions", () => {
    const diff = diffStates(
      existing(),
      proposed({
        teams: [
          { id: "team-a", name: "Team A" },
          { id: "team-b", name: "Team B" },
          { id: "team-c", name: "Team C" },
        ],
        fixtures: [
          fixture({}),
          fixture({ id: "qf-m1", stage: "QUARTERFINALS", homeTeamId: "team-c", homeTeamName: "Team C" }),
        ],
        stageOrder: ["QUARTERFINALS", "SEMIFINALS", "FINAL"],
      })
    );
    expect(diff.addedFixtures.map((f) => f.stage)).toEqual(["QUARTERFINALS"]);
    expect(diff.addedStages).toEqual(["QUARTERFINALS"]);
    expect(diff.addedTeams.map((t) => t.id)).toEqual(["team-c"]);
  });
});

describe("mergeStageOrder", () => {
  it("slots new stages into place using shared stages as anchors", () => {
    expect(mergeStageOrder(["QF", "SF", "F"], ["R16", "QF"])).toEqual(["R16", "QF", "SF", "F"]);
    expect(mergeStageOrder(["A", "B", "D"], ["B", "C", "D"])).toEqual(["A", "B", "C", "D"]);
  });

  it("appends stages with no following anchor", () => {
    expect(mergeStageOrder(["A"], ["B"])).toEqual(["A", "B"]);
  });
});

describe("mergeStates", () => {
  it("applies approved values to matched fixtures but keeps their ids, and keeps unseen fixtures", () => {
    const unseen = fixture({ id: "f-m1", stage: "FINAL", homeTeamId: null, homeTeamName: null, awayTeamId: null, awayTeamName: null });
    const merged = mergeStates(
      existing({ fixtures: [fixture({ id: "original-id" }), unseen] }),
      proposed({
        fixtures: [fixture({ id: "sf-m1", status: "FINISHED", homeScore: 1, awayScore: 0, winnerTeamId: "team-a" })],
      })
    );

    const updated = merged.fixtures.find((f) => f.id === "original-id")!;
    expect(updated.status).toBe("FINISHED");
    expect(updated.winnerTeamId).toBe("team-a");
    expect(merged.fixtures.find((f) => f.id === "f-m1")).toEqual(unseen);
  });

  it("unions teams and keeps existing standings when the proposal has none", () => {
    const standings = [
      {
        teamId: "team-a",
        teamName: "Team A",
        position: 1,
        played: 1,
        won: 1,
        draw: 0,
        lost: 0,
        points: 3,
        goalDifference: 0,
      },
    ];
    const merged = mergeStates(
      existing({ standings }),
      proposed({
        teams: [
          { id: "team-a", name: "Team A" },
          { id: "team-c", name: "Team C" },
        ],
        standings: [],
      })
    );
    expect(merged.teams.map((t) => t.id).sort()).toEqual(["team-a", "team-b", "team-c"]);
    expect(merged.standings).toEqual(standings);
  });
});
