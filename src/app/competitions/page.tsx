"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { readSelection, writeSelection } from "@/lib/selection";

interface CompetitionOption {
  key: string;
  label: string;
  format?: string;
  id?: string;
  teams?: { id: string; name: string }[];
}

interface TeamOption {
  teamId: string;
  teamName: string;
}

function screenshotTeams(option: CompetitionOption | undefined): TeamOption[] | null {
  return option?.teams ? option.teams.map((t) => ({ teamId: t.id, teamName: t.name })) : null;
}

function CompetitionsInner() {
  const router = useRouter();
  const preselect = useSearchParams().get("select");

  const [options, setOptions] = useState<CompetitionOption[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState("");
  const current = readSelection();

  const selectKey = useCallback((key: string, all: CompetitionOption[] | null) => {
    setSelectedKey(key);
    setTeamId("");
    setTeamsError(null);
    // Screenshot competitions ship their team list; officials fetch below.
    setTeams(screenshotTeams(all?.find((o) => o.key === key)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/competitions");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load competitions");
        if (cancelled) return;
        const all: CompetitionOption[] = [
          ...json.official.map((o: { key: string; label: string }) => ({
            key: o.key,
            label: o.label,
          })),
          ...json.screenshot.map(
            (s: { key: string; name: string; format: string; id: string; teams: { id: string; name: string }[] }) => ({
              key: s.key,
              label: s.name,
              format: s.format,
              id: s.id,
              teams: s.teams,
            })
          ),
        ];
        setOptions(all);
        setWarning(json.warning ?? null);
        const initialKey = preselect ?? readSelection()?.providerKey ?? "";
        if (initialKey) selectKey(initialKey, all);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load competitions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preselect, selectKey]);

  // Fetch teams for official providers (screenshot teams are set directly in
  // selectKey); all state updates happen in async callbacks.
  const option = options?.find((o) => o.key === selectedKey);
  const teamsLoading = !!option && !option.teams && teams === null && !teamsError;

  useEffect(() => {
    if (!selectedKey || !options) return;
    const selected = options.find((o) => o.key === selectedKey);
    if (!selected || selected.teams) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teams?provider=${encodeURIComponent(selectedKey)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load teams");
        if (!cancelled) setTeams(json.teams);
      } catch (err) {
        if (!cancelled) setTeamsError(err instanceof Error ? err.message : "Failed to load teams");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedKey, options]);

  const track = () => {
    const team = teams?.find((t) => t.teamId === teamId);
    if (!team) return;
    writeSelection({ providerKey: selectedKey, teamId: team.teamId, teamName: team.teamName });
    router.push("/");
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-10 flex items-center justify-between border-b border-turf/40 pb-4">
        <Link
          href="/"
          className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-chalk/60 hover:text-chalk"
        >
          ← Road to the Final
        </Link>
        <Link
          href="/competitions/new"
          className="rounded-sm border border-floodlight px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-floodlight transition-colors hover:bg-floodlight/10"
        >
          + From screenshot
        </Link>
      </div>

      <h1 className="font-display text-4xl uppercase tracking-wide text-chalk">Competitions</h1>
      {current && (
        <p className="mt-2 font-mono text-sm text-chalk/70">
          Currently tracking <span className="text-chalk">{current.teamName}</span>
        </p>
      )}

      <div aria-live="polite" className="mt-4 space-y-2">
        {!options && !loadError && (
          <p className="font-mono text-sm uppercase tracking-wider text-chalk/50">Loading…</p>
        )}
        {warning && <p className="font-body text-sm text-chalk/70">{warning}</p>}
        {loadError && (
          <p role="alert" className="font-mono text-sm text-live-red">
            {loadError}
          </p>
        )}
      </div>

      {options && (
        <div className="mt-6 space-y-8">
          <fieldset>
            <legend className="font-mono text-[0.65rem] font-bold uppercase tracking-wider text-chalk/60">
              Competition
            </legend>
            <ul className="mt-3 space-y-2">
              {options.map((option) => (
                <li
                  key={option.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-turf/50 bg-turf/[0.06] p-3"
                >
                  <label className="flex grow cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="competition"
                      value={option.key}
                      checked={selectedKey === option.key}
                      onChange={() => selectKey(option.key, options)}
                      className="h-4 w-4 accent-[var(--floodlight)]"
                    />
                    <span className="font-display text-xl uppercase tracking-wide text-chalk">
                      {option.label}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-wider text-chalk/50">
                      {option.format ? option.format.replace(/_/g, " ").toLowerCase() : "official"}
                    </span>
                  </label>
                  {option.id && (
                    <Link
                      href={`/competitions/new?into=${encodeURIComponent(option.id)}`}
                      className="font-mono text-xs uppercase tracking-wider text-floodlight hover:underline"
                    >
                      Update from screenshot →
                    </Link>
                  )}
                </li>
              ))}
              {options.length === 0 && (
                <li className="font-body text-sm text-chalk/70">
                  No competitions yet — add one from a screenshot.
                </li>
              )}
            </ul>
          </fieldset>

          {selectedKey && (
            <div>
              <label
                htmlFor="team"
                className="font-mono text-[0.65rem] font-bold uppercase tracking-wider text-chalk/60"
              >
                Team to track
              </label>
              <div aria-live="polite">
                {teamsLoading && (
                  <p className="mt-2 font-mono text-sm uppercase tracking-wider text-chalk/50">
                    Loading teams…
                  </p>
                )}
                {teamsError && (
                  <p role="alert" className="mt-2 font-mono text-sm text-live-red">
                    {teamsError}
                  </p>
                )}
              </div>
              {teams && (
                <select
                  id="team"
                  className="mt-2 w-full max-w-md rounded-sm border border-turf bg-ink px-2 py-1.5 font-mono text-sm text-chalk focus:border-floodlight focus:outline-none"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a team…
                  </option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={track}
                  disabled={!teamId}
                  className="rounded-sm border border-floodlight px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-floodlight transition-colors hover:bg-floodlight/10 disabled:opacity-50"
                >
                  Track this team
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function CompetitionsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <p className="font-mono text-sm uppercase tracking-wider text-chalk/50">Loading…</p>
        </main>
      }
    >
      <CompetitionsInner />
    </Suspense>
  );
}
