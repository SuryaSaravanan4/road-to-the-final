"use client";

import { useState } from "react";
import type { Difficulty, RankedScenario } from "@/types/domain";
import { DifficultyBadge } from "./DifficultyBadge";
import { SplitFlap } from "./SplitFlap";

/**
 * A ranked opponent scenario, plus — for model-assessed scenarios only — a
 * lightweight agree/disagree control (ADR 0002). Disagreement optionally
 * refines into a corrected difficulty band and a note. Bracket-confirmed
 * scenarios carry no reasoning to judge, so they show no control.
 */

type Verdict = "agree" | "disagree";
type SaveState = "idle" | "saving" | "saved" | "error";

const LABEL = "font-mono text-[0.6rem] font-bold uppercase tracking-wider text-chalk/50";
const INPUT =
  "w-full rounded-sm border border-turf bg-ink px-2 py-1.5 font-mono text-sm text-chalk focus:border-floodlight focus:outline-none";

function verdictButtonClass(active: boolean): string {
  return [
    "inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:border-floodlight disabled:opacity-50",
    active
      ? "border-floodlight bg-floodlight/10 text-floodlight"
      : "border-turf text-chalk/60 hover:border-floodlight hover:text-chalk",
  ].join(" ");
}

export function ScenarioCard({
  scenario,
  providerKey,
  teamId,
  stage,
}: {
  scenario: RankedScenario;
  providerKey: string;
  teamId: string;
  stage: string;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [correction, setCorrection] = useState<Difficulty | "">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<SaveState>("idle");

  const submit = async (
    v: Verdict,
    extra?: { difficultyCorrection?: Difficulty; note?: string }
  ) => {
    setVerdict(v);
    setState("saving");
    try {
      const res = await fetch("/api/path/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerKey,
          teamId,
          stage,
          opponentId: scenario.opponentId,
          opponentName: scenario.opponentName,
          source: scenario.source,
          difficulty: scenario.difficulty,
          likelihood: scenario.likelihood,
          reasoning: scenario.reasoning,
          verdict: v,
          difficultyCorrection: extra?.difficultyCorrection,
          note: extra?.note,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not save");
      }
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const onDisagree = () => {
    setShowRefine(true);
    submit("disagree");
  };

  const saveDetails = () => {
    submit("disagree", {
      difficultyCorrection: correction || undefined,
      note: note.trim() || undefined,
    });
  };

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

      {scenario.source === "model" && (
        <div className="mt-3 border-t border-turf/40 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>This call looks…</span>
            <button
              type="button"
              className={verdictButtonClass(verdict === "agree")}
              aria-pressed={verdict === "agree"}
              disabled={state === "saving"}
              onClick={() => {
                setShowRefine(false);
                submit("agree");
              }}
            >
              <span aria-hidden>👍</span> Right
            </button>
            <button
              type="button"
              className={verdictButtonClass(verdict === "disagree")}
              aria-pressed={verdict === "disagree"}
              disabled={state === "saving"}
              onClick={onDisagree}
            >
              <span aria-hidden>👎</span> Off
            </button>
            <span aria-live="polite" className={LABEL}>
              {state === "saving" && "Saving…"}
              {state === "saved" && "Thanks — saved"}
              {state === "error" && (
                <span className="text-live-red">Couldn&apos;t save — try again</span>
              )}
            </span>
          </div>

          {showRefine && (
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor={`fix-${stage}-${scenario.opponentId}`} className={LABEL}>
                  Difficulty should be (optional)
                </label>
                <select
                  id={`fix-${stage}-${scenario.opponentId}`}
                  className={`mt-1 ${INPUT}`}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value as Difficulty | "")}
                >
                  <option value="">— leave as {scenario.difficulty} —</option>
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </div>
              <div>
                <label htmlFor={`note-${stage}-${scenario.opponentId}`} className={LABEL}>
                  What&apos;s off? (optional)
                </label>
                <input
                  id={`note-${stage}-${scenario.opponentId}`}
                  className={`mt-1 ${INPUT}`}
                  value={note}
                  maxLength={500}
                  placeholder="e.g. likelihood far too high; they're clearly the tougher side"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={saveDetails}
                disabled={state === "saving"}
                className="rounded-sm border border-floodlight px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-wider text-floodlight transition-colors hover:bg-floodlight/10 disabled:opacity-50"
              >
                Save details
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
