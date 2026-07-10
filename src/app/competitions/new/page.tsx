"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { BracketExtraction } from "@/reasoning/bracketExtractionSchema";
import type { CorrectedExtraction } from "@/lib/draft-to-state";
import type { ExistingState } from "@/lib/state-diff";
import { IngestReview } from "@/components/IngestReview";

interface Draft {
  ingestionId: string;
  extraction: BracketExtraction;
}

function NewCompetitionInner() {
  const router = useRouter();
  const intoId = useSearchParams().get("into");

  const [existing, setExisting] = useState<ExistingState | null>(null);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!intoId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/competitions/${intoId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load competition");
        if (!cancelled) setExisting(json);
      } catch (err) {
        if (!cancelled)
          setExistingError(err instanceof Error ? err.message : "Failed to load competition");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intoId]);

  const extract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Choose a screenshot first.");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", file);
      if (intoId) form.set("competitionId", intoId);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Extraction failed");
      setDraft({ ingestionId: json.ingestionId, extraction: json.extraction });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async (corrected: CorrectedExtraction) => {
    if (!draft) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/ingest/${draft.ingestionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corrected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Confirm failed");
      router.push(`/competitions?select=${encodeURIComponent(json.providerKey)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
      setConfirming(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-10 border-b border-turf/40 pb-4">
        <Link
          href="/competitions"
          className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-chalk/60 hover:text-chalk"
        >
          ← Competitions
        </Link>
        <h1 className="mt-3 font-display text-4xl uppercase tracking-wide text-chalk">
          {intoId ? "Update from a new screenshot" : "New competition from a screenshot"}
        </h1>
        {existing && (
          <p className="mt-1 font-mono text-sm text-chalk/70">
            Updating <span className="text-chalk">{existing.name}</span> — changes are shown as a
            diff before anything applies.
          </p>
        )}
        {existingError && (
          <p role="alert" className="mt-2 font-mono text-sm text-live-red">
            {existingError}
          </p>
        )}
      </div>

      {!draft && (
        <form onSubmit={extract} className="rounded border border-turf/50 bg-turf/[0.06] p-6">
          <label
            htmlFor="screenshot"
            className="font-mono text-[0.65rem] font-bold uppercase tracking-wider text-chalk/60"
          >
            Bracket screenshot (PNG, JPEG, WebP, or GIF — max 5 MB)
          </label>
          <input
            id="screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="mt-2 block w-full font-mono text-sm text-chalk file:mr-3 file:rounded-sm file:border file:border-turf file:bg-ink file:px-3 file:py-1.5 file:font-mono file:text-xs file:font-bold file:uppercase file:tracking-wider file:text-chalk"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-2 font-body text-sm text-chalk/60">
            Claude reads the bracket from the image; you review and correct every field before it
            becomes this competition&apos;s data.
          </p>
          <button
            type="submit"
            disabled={extracting}
            className="mt-4 rounded-sm border border-floodlight px-4 py-2 font-mono text-sm font-bold uppercase tracking-wider text-floodlight transition-colors hover:bg-floodlight/10 disabled:opacity-50"
          >
            {extracting ? "Extracting…" : "Extract bracket"}
          </button>
          <p aria-live="polite" className="mt-3 font-mono text-xs uppercase tracking-wider text-chalk/50">
            {extracting && "Reading the screenshot — this can take a few seconds…"}
          </p>
        </form>
      )}

      {draft && (
        <IngestReview
          extraction={draft.extraction}
          existing={existing}
          confirming={confirming}
          serverError={error}
          onConfirm={confirm}
        />
      )}

      {!draft && (
        <div aria-live="assertive">
          {error && (
            <p
              role="alert"
              className="mt-4 rounded border border-live-red bg-live-red/10 p-3 font-mono text-sm text-chalk"
            >
              <span className="mr-2 font-bold uppercase tracking-widest text-live-red">Error</span>
              {error}
            </p>
          )}
        </div>
      )}
    </main>
  );
}

export default function NewCompetitionPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          <p className="font-mono text-sm uppercase tracking-wider text-chalk/50">Loading…</p>
        </main>
      }
    >
      <NewCompetitionInner />
    </Suspense>
  );
}
