"use client";

import Link from "next/link";
import { useTournamentPath } from "@/hooks/useTournamentPath";
import { HomeSummary } from "@/components/HomeSummary";
import { RefreshControl } from "@/components/RefreshControl";

export default function HomePage() {
  const { data, error, loading, refreshing, refresh } = useTournamentPath();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="mb-8 flex items-center justify-between border-b border-turf/40 pb-4">
        <h1 className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-chalk/60">
          Road to the Final
        </h1>
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
      {data && <HomeSummary data={data} />}

      {data && (
        <Link
          href="/path"
          className="mt-6 inline-block font-mono text-sm uppercase tracking-wider text-floodlight hover:underline"
        >
          View full path to the final →
        </Link>
      )}

      <p className="mt-8">
        <Link
          href="/competitions"
          className="font-mono text-xs uppercase tracking-wider text-chalk/60 hover:text-chalk"
        >
          Change competition or team →
        </Link>
      </p>
    </main>
  );
}
