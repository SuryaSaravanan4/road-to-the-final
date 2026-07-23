import type { RoundPath } from "@/types/domain";
import { ScenarioCard } from "./ScenarioCard";

const STAGE_LABELS: Record<string, string> = {
  LAST_32: "Round of 32",
  ROUND_OF_32: "Round of 32",
  LAST_16: "Round of 16",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINALS: "Quarterfinal",
  SEMI_FINALS: "Semifinal",
  FINAL: "Final",
};

// Progressive inset/scale per round is what creates the "tunnel walkout"
// perspective — the rail and its markers stay on a single fixed vertical
// line (see the two absolutely-positioned divs below); only the content
// block shifts inward and shrinks.
const TUNNEL_INSET_REM = 1.1;
const TUNNEL_SCALE_STEP = 0.035;
const TUNNEL_MIN_SCALE = 0.88;

export function RoundSection({
  round,
  index,
  lit,
  isCurrent,
  providerKey,
  teamId,
}: {
  round: RoundPath;
  index: number;
  lit: boolean;
  isCurrent: boolean;
  providerKey: string;
  teamId: string;
}) {
  const label = STAGE_LABELS[round.stage] ?? round.stage;
  const contentStyle = {
    marginLeft: `${index * TUNNEL_INSET_REM}rem`,
    transform: `scale(${Math.max(1 - index * TUNNEL_SCALE_STEP, TUNNEL_MIN_SCALE)})`,
    transformOrigin: "top left",
  };

  return (
    <section className="relative pl-8">
      <div
        className={`absolute left-[7px] top-1 bottom-[-2.5rem] w-px ${lit ? "bg-floodlight" : "bg-turf/30"}`}
        aria-hidden
      />
      <div
        className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 bg-ink ${
          lit ? "border-floodlight shadow-[0_0_10px_var(--floodlight)]" : "border-turf/50"
        }`}
        aria-hidden
      />

      <div className="flex items-center gap-2">
        <h2 className="font-display text-3xl uppercase tracking-wide text-chalk">{label}</h2>
        {isCurrent && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-live-red px-1.5 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-widest text-live-red">
            <span className="h-1.5 w-1.5 rounded-full bg-live-red" aria-hidden />
            Next
          </span>
        )}
      </div>

      <div style={contentStyle}>
        {round.completed && round.result ? (
          <div className="mt-3 rounded border border-turf/50 bg-turf/[0.06] p-4 font-mono text-chalk">
            {round.result.homeTeamName} {round.result.homeScore} – {round.result.awayScore}{" "}
            {round.result.awayTeamName}
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {round.scenarios?.map((scenario) => (
              <ScenarioCard
                key={scenario.opponentId}
                scenario={scenario}
                providerKey={providerKey}
                teamId={teamId}
                stage={round.stage}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
