import type { Difficulty } from "@/types/domain";
import { SplitFlap } from "./SplitFlap";

// live-red is reserved for the LIVE/next-match indicator only — difficulty
// reads through floodlight brightness instead: easy is lit up, hard recedes
// into the turf/shadow.
const STYLES: Record<Difficulty, string> = {
  easy: "border-floodlight bg-floodlight/15",
  medium: "border-chalk/30 bg-chalk/5",
  hard: "border-turf/50 bg-turf/10",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-1 ${STYLES[difficulty]}`}>
      <SplitFlap
        value={difficulty.toUpperCase()}
        width={6}
        className="text-[0.6rem] font-display tracking-[0.15em]"
      />
    </span>
  );
}
