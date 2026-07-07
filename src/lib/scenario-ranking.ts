import type { Difficulty, ScenarioInput, RankedScenario } from "@/types/domain";

const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * Sorts scenarios easiest -> hardest (difficulty is the primary key, since
 * that's what "easiest to hardest" means for the path view), breaking ties
 * within a tier by likelihood descending, and assigns a 1-based rank.
 *
 * Difficulty/likelihood themselves come from the Claude reasoning step —
 * this function only orders and ranks what it's given.
 */
export function rankScenarios(scenarios: ScenarioInput[]): RankedScenario[] {
  const sorted = [...scenarios].sort((a, b) => {
    const byDifficulty = DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
    if (byDifficulty !== 0) return byDifficulty;
    return b.likelihood - a.likelihood;
  });

  return sorted.map((scenario, index) => ({ ...scenario, rank: index + 1 }));
}
