"use client";

export function RefreshControl({
  onRefresh,
  refreshing,
  dataFetchedAt,
  stale,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  dataFetchedAt?: string;
  stale?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider text-chalk/50">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded-sm border border-turf/60 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-chalk transition-colors hover:border-floodlight hover:text-floodlight disabled:opacity-50"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      {dataFetchedAt && (
        <span>
          {stale ? "Stale, last " : "Updated "}
          {new Date(dataFetchedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
