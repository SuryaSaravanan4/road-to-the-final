import { describe, expect, it } from "vitest";
import { BracketExtractionSchema } from "@/reasoning/bracketExtractionSchema";

function text(value: string | null, confidence = 0.95) {
  return { value, confidence };
}

function count(value: number | null, confidence = 0.95) {
  return { value, confidence };
}

function matchup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    homeTeamName: text("Team A"),
    awayTeamName: text("Team B"),
    homeScore: count(2),
    awayScore: count(1),
    winnerTeamName: text("Team A"),
    date: text("2026-07-01"),
    ...overrides,
  };
}

function validExtraction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    competitionName: text("DDN Legends"),
    format: "SINGLE_ELIM",
    formatConfidence: 0.9,
    rounds: [
      {
        name: text("Semifinals"),
        bracketSide: "MAIN",
        matchups: [matchup(), matchup({ winnerTeamName: text(null, 0.2) })],
      },
      {
        name: text("Final"),
        bracketSide: "MAIN",
        matchups: [
          matchup({
            homeTeamName: text(null, 0.1),
            awayTeamName: text(null, 0.1),
            homeScore: count(null),
            awayScore: count(null),
            winnerTeamName: text(null),
            date: text(null),
          }),
        ],
      },
    ],
    groups: [],
    ambiguities: ["Bottom-right corner of the bracket is cropped."],
    ...overrides,
  };
}

describe("BracketExtractionSchema", () => {
  it("accepts a complete extraction with TBD slots as null values", () => {
    const parsed = BracketExtractionSchema.parse(validExtraction());
    expect(parsed.format).toBe("SINGLE_ELIM");
    expect(parsed.rounds).toHaveLength(2);
    expect(parsed.rounds[1].matchups[0].homeTeamName.value).toBeNull();
  });

  it("accepts a group-table extraction", () => {
    const parsed = BracketExtractionSchema.parse(
      validExtraction({
        format: "ROUND_ROBIN",
        rounds: [],
        groups: [
          {
            name: text(null),
            rows: [
              {
                teamName: text("Team A"),
                played: count(3),
                won: count(2),
                draw: count(1),
                lost: count(0),
                points: count(7),
              },
            ],
          },
        ],
      })
    );
    expect(parsed.groups[0].rows[0].points.value).toBe(7);
  });

  it("rejects an unknown format", () => {
    expect(() =>
      BracketExtractionSchema.parse(validExtraction({ format: "TRIPLE_ELIM" }))
    ).toThrow();
  });

  it("rejects a missing formatConfidence", () => {
    expect(() =>
      BracketExtractionSchema.parse(validExtraction({ formatConfidence: undefined }))
    ).toThrow();
  });

  it("rejects out-of-range confidence values", () => {
    expect(() =>
      BracketExtractionSchema.parse(
        validExtraction({ competitionName: text("DDN Legends", 1.4) })
      )
    ).toThrow();
    expect(() =>
      BracketExtractionSchema.parse(validExtraction({ formatConfidence: -0.1 }))
    ).toThrow();
  });

  it("rejects a field missing its confidence", () => {
    expect(() =>
      BracketExtractionSchema.parse(
        validExtraction({ competitionName: { value: "DDN Legends" } })
      )
    ).toThrow();
  });

  it("rejects a matchup with missing fields", () => {
    const bad = validExtraction();
    (bad.rounds as Array<{ matchups: unknown[] }>)[0].matchups[0] = {
      homeTeamName: text("Team A"),
      // awayTeamName and everything else missing
    };
    expect(() => BracketExtractionSchema.parse(bad)).toThrow();
  });

  it("rejects an invalid bracketSide", () => {
    const bad = validExtraction();
    (bad.rounds as Array<{ bracketSide: string }>)[0].bracketSide = "UPPER";
    expect(() => BracketExtractionSchema.parse(bad)).toThrow();
  });

  it("rejects non-integer scores", () => {
    expect(() =>
      BracketExtractionSchema.parse(
        validExtraction({
          rounds: [
            { name: text("Final"), bracketSide: "MAIN", matchups: [matchup({ homeScore: count(1.5) })] },
          ],
        })
      )
    ).toThrow();
  });

  it("rejects non-string ambiguities", () => {
    expect(() =>
      BracketExtractionSchema.parse(validExtraction({ ambiguities: [{ note: "x" }] }))
    ).toThrow();
  });
});
