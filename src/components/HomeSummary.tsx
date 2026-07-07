import type { TournamentPathResult } from "@/lib/road-to-final";
import { SplitFlap } from "./SplitFlap";

export function HomeSummary({ data }: { data: TournamentPathResult }) {
  const nextRound = data.rounds.find((r) => !r.completed);
  // Scenarios are ranked easiest-to-hardest, not most-to-least likely, so
  // the "Next" teaser needs its own pick: the single most probable opponent,
  // not necessarily the easiest one.
  const nextOpponent = nextRound?.scenarios?.reduce((most, s) =>
    s.likelihood > most.likelihood ? s : most
  );

  return (
    <div className="rounded border border-turf/50 bg-turf/[0.06] p-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-chalk/50">
        {data.currentStage.replace(/_/g, " ")}
      </p>
      <h1 className="mt-1 font-display text-5xl uppercase tracking-wide text-chalk">
        {data.teamName}
      </h1>
      <p className="mt-2 font-mono text-chalk/80">
        {data.record.won}W &ndash; {data.record.draw}D &ndash; {data.record.lost}L
      </p>

      {nextOpponent && (
        <div className="mt-5 flex items-center gap-3 border-t border-turf/30 pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-live-red px-1.5 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-widest text-live-red">
            <span className="h-1.5 w-1.5 rounded-full bg-live-red" aria-hidden />
            Next
          </span>
          <span className="font-display text-xl uppercase tracking-wide text-chalk">
            {nextOpponent.opponentName}
          </span>
          <SplitFlap
            value={`${nextOpponent.likelihood}%`}
            width={4}
            align="right"
            className="text-base font-mono text-floodlight"
          />
        </div>
      )}
    </div>
  );
}
