import { FootballDataOrgProvider } from "./football-data-org";
import { ScreenshotBracketProvider } from "./screenshot-bracket";
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

/** Static, official-API-backed providers, for the competition picker. */
export const OFFICIAL_PROVIDERS: { key: string; label: string }[] = [
  { key: "soccer/world-cup-2026", label: "FIFA World Cup 2026" },
];

/**
 * Screenshot-ingested competitions are user-created, so they can't be a
 * finite static list: any key of the form `screenshot/<competitionId>`
 * resolves to a ScreenshotBracketProvider for that stored competition.
 */
export const SCREENSHOT_PROVIDER_PREFIX = "screenshot/";

export const DEFAULT_PROVIDER_KEY = "soccer/world-cup-2026";

export function getProvider(key: string): SportsProvider {
  const factory = PROVIDER_FACTORIES[key];
  if (factory) return factory();

  if (key.startsWith(SCREENSHOT_PROVIDER_PREFIX)) {
    const competitionId = key.slice(SCREENSHOT_PROVIDER_PREFIX.length);
    if (competitionId) return new ScreenshotBracketProvider(competitionId);
  }

  throw new Error(
    `Unknown provider key "${key}". Registered providers: ${Object.keys(PROVIDER_FACTORIES).join(", ")}, ${SCREENSHOT_PROVIDER_PREFIX}<competitionId>`
  );
}
