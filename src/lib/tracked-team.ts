import { DEFAULT_PROVIDER_KEY } from "@/providers/registry";

export function getTrackedTeamConfig() {
  return {
    providerKey: process.env.TRACKED_PROVIDER_KEY ?? DEFAULT_PROVIDER_KEY,
    teamId: process.env.TRACKED_TEAM_ID ?? "",
    teamName: process.env.TRACKED_TEAM_NAME ?? "United States",
  };
}
