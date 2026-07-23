import { describe, expect, it } from "vitest";
import { rankScenarios } from "@/lib/scenario-ranking";
import type { ScenarioInput } from "@/types/domain";

function scenario(overrides: Partial<ScenarioInput>): ScenarioInput {
  return {
    opponentId: "1",
    opponentName: "Opponent",
    difficulty: "medium",
    likelihood: 50,
    reasoning: "test",
    source: "model",
    ...overrides,
  };
}

describe("rankScenarios", () => {
  it("sorts easiest to hardest by difficulty tier", () => {
    const result = rankScenarios([
      scenario({ opponentId: "hard", difficulty: "hard" }),
      scenario({ opponentId: "easy", difficulty: "easy" }),
      scenario({ opponentId: "medium", difficulty: "medium" }),
    ]);

    expect(result.map((s) => s.opponentId)).toEqual(["easy", "medium", "hard"]);
  });

  it("breaks ties within a difficulty tier by likelihood descending", () => {
    const result = rankScenarios([
      scenario({ opponentId: "less-likely", difficulty: "easy", likelihood: 20 }),
      scenario({ opponentId: "more-likely", difficulty: "easy", likelihood: 60 }),
    ]);

    expect(result.map((s) => s.opponentId)).toEqual(["more-likely", "less-likely"]);
  });

  it("assigns a 1-based rank in sorted order", () => {
    const result = rankScenarios([
      scenario({ opponentId: "hard", difficulty: "hard" }),
      scenario({ opponentId: "easy", difficulty: "easy" }),
    ]);

    expect(result.find((s) => s.opponentId === "easy")?.rank).toBe(1);
    expect(result.find((s) => s.opponentId === "hard")?.rank).toBe(2);
  });

  it("does not mutate the input array", () => {
    const input = [scenario({ opponentId: "a", difficulty: "hard" }), scenario({ opponentId: "b", difficulty: "easy" })];
    const inputCopy = [...input];

    rankScenarios(input);

    expect(input).toEqual(inputCopy);
  });

  it("returns an empty array for no scenarios", () => {
    expect(rankScenarios([])).toEqual([]);
  });
});
