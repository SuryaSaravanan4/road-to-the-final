import type { RankedScenario } from "@/types/domain";
import { DifficultyBadge } from "./DifficultyBadge";
import { SplitFlap } from "./SplitFlap";

export function ScenarioCard({ scenario }: { scenario: RankedScenario }) {
  return (
    <div className="rounded border border-turf/50 bg-turf/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl uppercase tracking-wide text-chalk">
          {scenario.opponentName}
        </h3>
        <DifficultyBadge difficulty={scenario.difficulty} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <SplitFlap
          value={`${scenario.likelihood}%`}
          width={4}
          align="right"
          className="text-lg font-mono text-floodlight"
        />
        <span className="font-mono text-xs uppercase tracking-wider text-chalk/50">likely</span>
      </div>

      <p className="mt-2 font-body text-sm leading-relaxed text-chalk/70">{scenario.reasoning}</p>
    </div>
  );
}
