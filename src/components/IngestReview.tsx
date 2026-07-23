"use client";

import { useMemo, useState } from "react";
import type { BracketExtraction } from "@/reasoning/bracketExtractionSchema";
import { CONFIDENCE_CONFIRM_THRESHOLD } from "@/lib/ingestion";
import { draftToState, type CorrectedExtraction } from "@/lib/draft-to-state";
import { diffStates, type ExistingState } from "@/lib/state-diff";
import { COMPETITION_FORMATS, type CompetitionFormat } from "@/providers/screenshot-bracket/state";

/**
 * Editable preview of an extraction draft — the mandatory human gate between
 * Claude vision output and ground truth. Every field is a real, labeled,
 * keyboard-operable control; low-confidence reads are flagged with icon+text
 * (never color alone); re-ingestions show a live diff with contradictions
 * called out before anything can be confirmed.
 */

const FORMAT_LABELS: Record<CompetitionFormat, string> = {
  SINGLE_ELIM: "Single elimination",
  DOUBLE_ELIM: "Double elimination (winners/losers bracket)",
  ROUND_ROBIN: "Round robin / league table",
  GROUPS_KNOCKOUT: "Group stage + knockout",
};

const INPUT =
  "w-full rounded-sm border border-turf bg-ink px-2 py-1.5 font-mono text-sm text-chalk focus:border-floodlight focus:outline-none disabled:opacity-40";
const SMALL_BUTTON =
  "rounded-sm border border-turf px-2 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider text-chalk/70 transition-colors hover:border-live-red hover:text-live-red focus:outline-none focus-visible:border-floodlight";
const LABEL = "font-mono text-[0.65rem] font-bold uppercase tracking-wider text-chalk/60";

type WinnerSide = "" | "home" | "away";

interface MatchupEdit {
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  winner: WinnerSide;
  date: string;
  flags: Record<"home" | "away" | "homeScore" | "awayScore" | "winner" | "date", boolean>;
}

interface RoundEdit {
  name: string;
  nameFlagged: boolean;
  bracketSide: "MAIN" | "WINNERS" | "LOSERS";
  matchups: MatchupEdit[];
}

interface GroupRowEdit {
  team: string;
  played: string;
  won: string;
  draw: string;
  lost: string;
  points: string;
  teamFlagged: boolean;
}

interface GroupEdit {
  name: string;
  rows: GroupRowEdit[];
}

function lowConfidence(field: { confidence: number }): boolean {
  return field.confidence < CONFIDENCE_CONFIRM_THRESHOLD;
}

function asText(field: { value: string | null }): string {
  return field.value ?? "";
}

function asNumberText(field: { value: number | null }): string {
  return field.value === null ? "" : String(field.value);
}

function initRounds(extraction: BracketExtraction): RoundEdit[] {
  return extraction.rounds.map((round, i) => ({
    name: asText(round.name) || `Round ${i + 1}`,
    nameFlagged: lowConfidence(round.name),
    bracketSide: round.bracketSide,
    matchups: round.matchups.map((m) => {
      const home = asText(m.homeTeamName);
      const away = asText(m.awayTeamName);
      const winnerName = asText(m.winnerTeamName).trim().toLowerCase();
      const winner: WinnerSide =
        winnerName && winnerName === home.trim().toLowerCase()
          ? "home"
          : winnerName && winnerName === away.trim().toLowerCase()
            ? "away"
            : "";
      return {
        home,
        away,
        homeScore: asNumberText(m.homeScore),
        awayScore: asNumberText(m.awayScore),
        winner,
        date: asText(m.date),
        flags: {
          home: lowConfidence(m.homeTeamName),
          away: lowConfidence(m.awayTeamName),
          homeScore: lowConfidence(m.homeScore),
          awayScore: lowConfidence(m.awayScore),
          // An extracted winner that matches neither team also needs eyes.
          winner: lowConfidence(m.winnerTeamName) || (!!winnerName && winner === ""),
          date: lowConfidence(m.date),
        },
      };
    }),
  }));
}

function initGroups(extraction: BracketExtraction): GroupEdit[] {
  return extraction.groups.map((group, i) => ({
    name: asText(group.name) || (extraction.groups.length > 1 ? `Group ${i + 1}` : ""),
    rows: group.rows.map((row) => ({
      team: asText(row.teamName),
      played: asNumberText(row.played),
      won: asNumberText(row.won),
      draw: asNumberText(row.draw),
      lost: asNumberText(row.lost),
      points: asNumberText(row.points),
      teamFlagged: lowConfidence(row.teamName),
    })),
  }));
}

function parseScore(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) ? n : null;
}

function ReviewFlag({ label = "needs review" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-floodlight bg-floodlight/10 px-1 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-wider text-floodlight">
      <span aria-hidden>⚠</span> {label}
    </span>
  );
}

function ConflictFlag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-live-red bg-live-red/10 px-1 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-wider text-live-red">
      <span aria-hidden>≠</span> conflicts with confirmed data
    </span>
  );
}

export function IngestReview({
  extraction,
  existing,
  confirming,
  discarding,
  serverError,
  onConfirm,
  onDiscard,
}: {
  extraction: BracketExtraction;
  existing: ExistingState | null;
  confirming: boolean;
  discarding: boolean;
  serverError: string | null;
  onConfirm: (corrected: CorrectedExtraction) => void;
  onDiscard: (reason: string) => void;
}) {
  const formatUncertain = lowConfidence({ confidence: extraction.formatConfidence });
  const [format, setFormat] = useState<CompetitionFormat | "">(
    formatUncertain ? "" : extraction.format
  );
  const [name, setName] = useState(asText(extraction.competitionName) || existing?.name || "");
  const nameFlagged = lowConfidence(extraction.competitionName);
  const [rounds, setRounds] = useState<RoundEdit[]>(() => initRounds(extraction));
  const [groups, setGroups] = useState<GroupEdit[]>(() => initGroups(extraction));
  const [localError, setLocalError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [discardReason, setDiscardReason] = useState("");

  const patchMatchup = (r: number, m: number, patch: Partial<MatchupEdit>) => {
    setRounds((prev) =>
      prev.map((round, ri) =>
        ri === r
          ? {
              ...round,
              matchups: round.matchups.map((mu, mi) => (mi === m ? { ...mu, ...patch } : mu)),
            }
          : round
      )
    );
  };

  const buildCorrected = (): CorrectedExtraction => {
    if (!format) throw new Error("Choose the competition format before confirming.");
    if (!name.trim()) throw new Error("The competition needs a name.");
    for (const round of rounds) {
      if (!round.name.trim()) throw new Error("Every round needs a name.");
    }
    return {
      competitionName: name.trim(),
      format,
      rounds: rounds.map((round) => ({
        name: round.name.trim(),
        bracketSide: format === "DOUBLE_ELIM" ? round.bracketSide : "MAIN",
        matchups: round.matchups.map((m) => ({
          homeTeamName: m.home.trim() || null,
          awayTeamName: m.away.trim() || null,
          homeScore: parseScore(m.homeScore),
          awayScore: parseScore(m.awayScore),
          winnerTeamName:
            m.winner === "home" ? m.home.trim() || null : m.winner === "away" ? m.away.trim() || null : null,
          date: m.date.trim() || null,
        })),
      })),
      groups: groups
        .filter((g) => g.rows.length > 0)
        .map((g) => ({
          name: g.name.trim() || null,
          rows: g.rows.map((row) => ({
            teamName: row.team.trim(),
            played: parseScore(row.played),
            won: parseScore(row.won),
            draw: parseScore(row.draw),
            lost: parseScore(row.lost),
            points: parseScore(row.points),
          })),
        })),
    };
  };

  // Live diff against the confirmed state (re-ingestion only): recomputed
  // from the current edits so what the user approves is exactly what applies.
  const preview = useMemo(() => {
    if (!existing || !format) return null;
    try {
      const proposed = draftToState(buildCorrected(), existing.teams);
      return { diff: diffStates(existing, proposed), error: null };
    } catch (err) {
      return { diff: null, error: err instanceof Error ? err.message : "Invalid bracket" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildCorrected reads exactly these
  }, [existing, format, name, rounds, groups]);

  const handleConfirm = () => {
    setLocalError(null);
    try {
      onConfirm(buildCorrected());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Bracket is not ready to confirm.");
    }
  };

  const error = localError ?? serverError;

  return (
    <div className="space-y-6">
      {extraction.ambiguities.length > 0 && (
        <section className="rounded border border-floodlight/60 bg-floodlight/5 p-4">
          <h2 className={LABEL}>What the extraction could not read</h2>
          <ul className="mt-2 list-disc pl-5 font-body text-sm text-chalk/80">
            {extraction.ambiguities.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-turf/50 bg-turf/[0.06] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="competition-name" className={LABEL}>
              Competition name {nameFlagged && <ReviewFlag />}
            </label>
            <input
              id="competition-name"
              className={`mt-1 ${INPUT}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="competition-format" className={LABEL}>
              Format {formatUncertain && <ReviewFlag label="uncertain — choose one" />}
            </label>
            <select
              id="competition-format"
              className={`mt-1 ${INPUT}`}
              value={format}
              onChange={(e) => setFormat(e.target.value as CompetitionFormat | "")}
            >
              <option value="" disabled>
                Choose a format…
              </option>
              {COMPETITION_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!format && (
          <p className="mt-3 font-body text-sm text-chalk/70">
            The extraction wasn&apos;t sure of this competition&apos;s format, so nothing below can
            be confirmed until you pick it.
          </p>
        )}
      </section>

      <fieldset disabled={!format} className="space-y-6">
        {rounds.map((round, r) => (
          <section key={r} className="rounded border border-turf/50 bg-turf/[0.06] p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label htmlFor={`round-${r}-name`} className={LABEL}>
                  Round name {round.nameFlagged && <ReviewFlag />}
                </label>
                <input
                  id={`round-${r}-name`}
                  className={`mt-1 ${INPUT}`}
                  value={round.name}
                  onChange={(e) =>
                    setRounds((prev) =>
                      prev.map((x, i) => (i === r ? { ...x, name: e.target.value } : x))
                    )
                  }
                />
              </div>
              {format === "DOUBLE_ELIM" && (
                <div>
                  <label htmlFor={`round-${r}-side`} className={LABEL}>
                    Bracket
                  </label>
                  <select
                    id={`round-${r}-side`}
                    className={`mt-1 ${INPUT}`}
                    value={round.bracketSide}
                    onChange={(e) =>
                      setRounds((prev) =>
                        prev.map((x, i) =>
                          i === r ? { ...x, bracketSide: e.target.value as RoundEdit["bracketSide"] } : x
                        )
                      )
                    }
                  >
                    <option value="WINNERS">Winners</option>
                    <option value="LOSERS">Losers</option>
                    <option value="MAIN">Grand final</option>
                  </select>
                </div>
              )}
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() => setRounds((prev) => prev.filter((_, i) => i !== r))}
              >
                Remove round
              </button>
            </div>

            <ul className="mt-4 space-y-4">
              {round.matchups.map((m, mi) => (
                <li key={mi} className="rounded border border-turf/50 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`r${r}-m${mi}-home`} className={LABEL}>
                        Home team {m.flags.home && <ReviewFlag />}
                      </label>
                      <input
                        id={`r${r}-m${mi}-home`}
                        className={`mt-1 ${INPUT}`}
                        value={m.home}
                        placeholder="TBD"
                        onChange={(e) => patchMatchup(r, mi, { home: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`r${r}-m${mi}-away`} className={LABEL}>
                        Away team {m.flags.away && <ReviewFlag />}
                      </label>
                      <input
                        id={`r${r}-m${mi}-away`}
                        className={`mt-1 ${INPUT}`}
                        value={m.away}
                        placeholder="TBD"
                        onChange={(e) => patchMatchup(r, mi, { away: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div>
                      <label htmlFor={`r${r}-m${mi}-hs`} className={LABEL}>
                        Home score {m.flags.homeScore && <ReviewFlag />}
                      </label>
                      <input
                        id={`r${r}-m${mi}-hs`}
                        className={`mt-1 ${INPUT}`}
                        type="number"
                        inputMode="numeric"
                        value={m.homeScore}
                        onChange={(e) => patchMatchup(r, mi, { homeScore: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`r${r}-m${mi}-as`} className={LABEL}>
                        Away score {m.flags.awayScore && <ReviewFlag />}
                      </label>
                      <input
                        id={`r${r}-m${mi}-as`}
                        className={`mt-1 ${INPUT}`}
                        type="number"
                        inputMode="numeric"
                        value={m.awayScore}
                        onChange={(e) => patchMatchup(r, mi, { awayScore: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`r${r}-m${mi}-winner`} className={LABEL}>
                        Winner {m.flags.winner && <ReviewFlag />}
                      </label>
                      <select
                        id={`r${r}-m${mi}-winner`}
                        className={`mt-1 ${INPUT}`}
                        value={m.winner}
                        onChange={(e) => patchMatchup(r, mi, { winner: e.target.value as WinnerSide })}
                      >
                        <option value="">Undecided</option>
                        <option value="home" disabled={!m.home.trim()}>
                          {m.home.trim() || "Home"}
                        </option>
                        <option value="away" disabled={!m.away.trim()}>
                          {m.away.trim() || "Away"}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`r${r}-m${mi}-date`} className={LABEL}>
                        Date {m.flags.date && <ReviewFlag />}
                      </label>
                      <input
                        id={`r${r}-m${mi}-date`}
                        className={`mt-1 ${INPUT}`}
                        value={m.date}
                        placeholder="YYYY-MM-DD"
                        onChange={(e) => patchMatchup(r, mi, { date: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`mt-3 ${SMALL_BUTTON}`}
                    onClick={() =>
                      setRounds((prev) =>
                        prev.map((x, i) =>
                          i === r ? { ...x, matchups: x.matchups.filter((_, j) => j !== mi) } : x
                        )
                      )
                    }
                  >
                    Remove matchup
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {groups.map((group, g) => (
          <section key={g} className="rounded border border-turf/50 bg-turf/[0.06] p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label htmlFor={`group-${g}-name`} className={LABEL}>
                  Group / table name
                </label>
                <input
                  id={`group-${g}-name`}
                  className={`mt-1 ${INPUT}`}
                  value={group.name}
                  placeholder="e.g. Group A (optional)"
                  onChange={(e) =>
                    setGroups((prev) =>
                      prev.map((x, i) => (i === g ? { ...x, name: e.target.value } : x))
                    )
                  }
                />
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {group.rows.map((row, ri) => (
                <li key={ri} className="rounded border border-turf/50 p-3">
                  <div className="grid gap-3 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <label htmlFor={`g${g}-r${ri}-team`} className={LABEL}>
                        Team {row.teamFlagged && <ReviewFlag />}
                      </label>
                      <input
                        id={`g${g}-r${ri}-team`}
                        className={`mt-1 ${INPUT}`}
                        value={row.team}
                        onChange={(e) =>
                          setGroups((prev) =>
                            prev.map((x, i) =>
                              i === g
                                ? {
                                    ...x,
                                    rows: x.rows.map((y, j) =>
                                      j === ri ? { ...y, team: e.target.value } : y
                                    ),
                                  }
                                : x
                            )
                          )
                        }
                      />
                    </div>
                    {(["played", "won", "draw", "lost", "points"] as const).map((stat) => (
                      <div key={stat}>
                        <label htmlFor={`g${g}-r${ri}-${stat}`} className={LABEL}>
                          {stat === "points" ? "Pts" : stat[0].toUpperCase()}
                        </label>
                        <input
                          id={`g${g}-r${ri}-${stat}`}
                          className={`mt-1 ${INPUT}`}
                          type="number"
                          inputMode="numeric"
                          value={row[stat]}
                          onChange={(e) =>
                            setGroups((prev) =>
                              prev.map((x, i) =>
                                i === g
                                  ? {
                                      ...x,
                                      rows: x.rows.map((y, j) =>
                                        j === ri ? { ...y, [stat]: e.target.value } : y
                                      ),
                                    }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`mt-3 ${SMALL_BUTTON}`}
                    onClick={() =>
                      setGroups((prev) =>
                        prev.map((x, i) =>
                          i === g ? { ...x, rows: x.rows.filter((_, j) => j !== ri) } : x
                        )
                      )
                    }
                  >
                    Remove row
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {preview && (
          <section className="rounded border border-turf/50 bg-turf/[0.06] p-4">
            <h2 className={LABEL}>Changes vs. confirmed bracket</h2>
            {preview.error && <p className="mt-2 font-body text-sm text-chalk/80">{preview.error}</p>}
            {preview.diff && (
              <div className="mt-2 space-y-3 font-body text-sm text-chalk/80">
                <p>
                  {preview.diff.addedFixtures.length} new · {preview.diff.changedFixtures.length}{" "}
                  conflicting · {preview.diff.unchangedFixtureCount} unchanged
                  {preview.diff.addedTeams.length > 0 &&
                    ` · new teams: ${preview.diff.addedTeams.map((t) => t.name).join(", ")}`}
                </p>
                {preview.diff.changedFixtures.map((change, i) => (
                  <div key={i} className="rounded border border-live-red/70 p-3">
                    <p className="font-mono text-sm text-chalk">
                      {change.before.homeTeamName ?? "TBD"} vs {change.before.awayTeamName ?? "TBD"}{" "}
                      <span className="text-chalk/50">({change.before.stage})</span> <ConflictFlag />
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {change.changedFields.map((field) => (
                        <li key={field}>
                          {field}:{" "}
                          <span className="line-through decoration-live-red/70">
                            {String(change.before[field as keyof typeof change.before] ?? "—")}
                          </span>{" "}
                          → {String(change.after[field as keyof typeof change.after] ?? "—")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {preview.diff.changedFixtures.length > 0 && (
                  <p>
                    Confirming replaces the crossed-out confirmed values. To keep one, edit the
                    field above back to its confirmed value.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </fieldset>

      <div aria-live="assertive">
        {error && (
          <p role="alert" className="rounded border border-live-red bg-live-red/10 p-3 font-mono text-sm text-chalk">
            <span className="mr-2 font-bold uppercase tracking-widest text-live-red">Error</span>
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || discarding || !format}
          className="rounded-sm border border-floodlight px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-floodlight transition-colors hover:bg-floodlight/10 disabled:opacity-50"
        >
          {confirming ? "Confirming…" : existing ? "Approve changes" : "Confirm bracket"}
        </button>
        {!showDiscard && (
          <button
            type="button"
            onClick={() => setShowDiscard(true)}
            disabled={confirming || discarding}
            className="font-mono text-xs font-bold uppercase tracking-wider text-chalk/50 underline decoration-dotted underline-offset-4 transition-colors hover:text-live-red disabled:opacity-50"
          >
            Discard this read
          </button>
        )}
      </div>
      <p className="font-body text-xs text-chalk/60">
        Nothing is saved as this competition&apos;s truth until you confirm.
      </p>

      {showDiscard && (
        <section className="rounded border border-live-red/60 bg-live-red/[0.06] p-4">
          <h2 className={LABEL}>Discard this extraction</h2>
          <p className="mt-2 font-body text-sm text-chalk/80">
            Use this when the read is too wrong to be worth correcting. Nothing becomes competition
            data, but the draft is kept as a signal that the extraction failed here — an optional
            note helps say why.
          </p>
          <label htmlFor="discard-reason" className={`mt-3 block ${LABEL}`}>
            Reason (optional)
          </label>
          <input
            id="discard-reason"
            className={`mt-1 ${INPUT}`}
            value={discardReason}
            maxLength={500}
            placeholder="e.g. wrong tournament, unreadable, half the bracket cropped off"
            onChange={(e) => setDiscardReason(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onDiscard(discardReason.trim())}
              disabled={confirming || discarding}
              className="rounded-sm border border-live-red px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-live-red transition-colors hover:bg-live-red/10 disabled:opacity-50"
            >
              {discarding ? "Discarding…" : "Discard draft"}
            </button>
            <button
              type="button"
              onClick={() => setShowDiscard(false)}
              disabled={discarding}
              className={SMALL_BUTTON}
            >
              Keep editing
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
