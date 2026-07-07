import { FootballDataOrgProvider } from "./football-data-org";
import type { SportsProvider } from "./SportsProvider";

/**
 * Maps a stable "sport/league" key to a provider instance. Adding a new
 * sport/league (NBA playoffs, NFL playoffs, ...) means writing one new
 * SportsProvider implementation and registering it here — nothing else in
 * the app needs to change.
 */
const PROVIDER_FACTORIES: Record<string, () => SportsProvider> = {
  "soccer/world-cup-2026": () => new FootballDataOrgProvider("WC"),
};

export const DEFAULT_PROVIDER_KEY = "soccer/world-cup-2026";

export function getProvider(key: string): SportsProvider {
  const factory = PROVIDER_FACTORIES[key];
  if (!factory) {
    throw new Error(
      `Unknown provider key "${key}". Registered providers: ${Object.keys(PROVIDER_FACTORIES).join(", ")}`
    );
  }
  return factory();
}
