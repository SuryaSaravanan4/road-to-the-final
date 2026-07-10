import { DEFAULT_PROVIDER_KEY } from "@/providers/registry";

export function getTrackedTeamConfig() {
  return {
    providerKey: process.env.TRACKED_PROVIDER_KEY ?? DEFAULT_PROVIDER_KEY,
    teamId: process.env.TRACKED_TEAM_ID ?? "",
    teamName: process.env.TRACKED_TEAM_NAME ?? "United States",
  };
}

/**
 * Resolves which competition/team a request tracks: explicit query params
 * (the client-side competition picker) win; the env-var config is the
 * default. When a provider is given explicitly, the env team is NOT used as
 * a fallback — it belongs to a different competition.
 */
export function resolveTrackedSelection(searchParams: URLSearchParams) {
  const env = getTrackedTeamConfig();
  const provider = searchParams.get("provider");
  if (!provider) return env;

  const teamId = searchParams.get("teamId") ?? "";
  return {
    providerKey: provider,
    teamId,
    teamName: searchParams.get("teamName") ?? teamId,
  };
}
