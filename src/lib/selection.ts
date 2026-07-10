/**
 * Client-side persistence of which competition/team this browser tracks.
 * Phase 1 has no user accounts, so the selection lives in localStorage and
 * rides to the API as query params (see resolveTrackedSelection); the
 * env-var config remains the server-side default.
 */

export interface TrackedSelection {
  providerKey: string;
  teamId: string;
  teamName: string;
}

const STORAGE_KEY = "rtf:selection";

export function readSelection(): TrackedSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrackedSelection>;
    if (
      typeof parsed.providerKey === "string" &&
      typeof parsed.teamId === "string" &&
      typeof parsed.teamName === "string"
    ) {
      return parsed as TrackedSelection;
    }
  } catch {
    // Corrupt storage — behave as if nothing is selected.
  }
  return null;
}

export function writeSelection(selection: TrackedSelection): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}

export function clearSelection(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Query string for /api/path and /api/refresh; empty when using the
 * server's env-var default. */
export function selectionQuery(selection: TrackedSelection | null): string {
  if (!selection) return "";
  const params = new URLSearchParams({
    provider: selection.providerKey,
    teamId: selection.teamId,
    teamName: selection.teamName,
  });
  return `?${params.toString()}`;
}
