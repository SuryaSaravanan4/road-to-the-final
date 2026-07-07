"use client";

import { useCallback, useEffect, useState } from "react";
import type { TournamentPathResult } from "@/lib/road-to-final";

const AUTO_REFRESH_MS = 15 * 60 * 1000;

export function useTournamentPath() {
  const [data, setData] = useState<TournamentPathResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/path");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Refresh failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not derived from props/state
    load();
    const timer = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { data, error, loading, refreshing, refresh };
}
