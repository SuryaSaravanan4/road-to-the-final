import { z } from "zod";

export const ScenarioSchema = z.object({
  opponentId: z.string(),
  opponentName: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  likelihood: z.number().min(0).max(100),
  reasoning: z.string(),
});

export const RoundScenariosSchema = z.object({
  stage: z.string(),
  scenarios: z.array(ScenarioSchema),
});

export const ScenarioResponseSchema = z.object({
  rounds: z.array(RoundScenariosSchema),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type RoundScenarios = z.infer<typeof RoundScenariosSchema>;
export type ScenarioResponse = z.infer<typeof ScenarioResponseSchema>;
