"use client";

import Link from "next/link";
import { useTournamentPath } from "@/hooks/useTournamentPath";
import { RoundSection } from "@/components/RoundSection";
import { RefreshControl } from "@/components/RefreshControl";

export default function PathPage() {
  const { data, error, loading, refreshing, refresh } = useTournamentPath();
  const currentIndex = data?.rounds.findIndex((r) => !r.completed) ?? -1;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-10 flex items-center justify-between border-b border-turf/40 pb-4">
        <Link
          href="/"
          className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-chalk/60 hover:text-chalk"
        >
          ← Road to the Final
        </Link>
        <RefreshControl
          onRefresh={refresh}
          refreshing={refreshing}
          dataFetchedAt={data?.dataFetchedAt}
          stale={data?.stale}
        />
      </div>

      {loading && (
        <p className="font-mono text-sm uppercase tracking-wider text-chalk/50">Loading…</p>
      )}
      {error && (
        <p className="rounded border border-chalk/25 bg-ink p-4 font-mono text-sm text-chalk/70">
          <span className="mr-2 font-bold uppercase tracking-widest text-chalk">Error</span>
          {error}
        </p>
      )}

      {data && (
        <div className="space-y-10">
          {data.rounds.map((round, index) => (
            <RoundSection
              key={round.stage}
              round={round}
              index={index}
              lit={currentIndex === -1 || index <= currentIndex}
              isCurrent={index === currentIndex}
            />
          ))}
        </div>
      )}
    </main>
  );
}
