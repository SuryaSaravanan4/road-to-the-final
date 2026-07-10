import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCached } from "@/lib/cache";
import { getProvider, SCREENSHOT_PROVIDER_PREFIX } from "@/providers/registry";
import { parseCompetitionState } from "@/providers/screenshot-bracket/state";

const TEAMS_TTL_MS = 15 * 60 * 1000;

/** Teams available in a competition, for the tracked-team picker. */
export async function GET(request: Request) {
  const providerKey = new URL(request.url).searchParams.get("provider");
  if (!providerKey) {
    return NextResponse.json({ error: "Missing \"provider\" query parameter." }, { status: 400 });
  }

  try {
    // Screenshot competitions know their teams even when they have no
    // standings (pure knockout); everything else derives from standings.
    if (providerKey.startsWith(SCREENSHOT_PROVIDER_PREFIX)) {
      const id = providerKey.slice(SCREENSHOT_PROVIDER_PREFIX.length);
      const row = await prisma.competition.findUnique({ where: { id } });
      if (!row) {
        return NextResponse.json({ error: `Competition "${id}" not found.` }, { status: 404 });
      }
      return NextResponse.json({
        teams: parseCompetitionState(row).teams.map((t) => ({ teamId: t.id, teamName: t.name })),
      });
    }

    const provider = getProvider(providerKey);
    const standings = await getCached(`${providerKey}:standings`, TEAMS_TTL_MS, () =>
      provider.getStandings()
    );
    const seen = new Set<string>();
    const teams = standings.data
      .filter((s) => (seen.has(s.teamId) ? false : (seen.add(s.teamId), true)))
      .map((s) => ({ teamId: s.teamId, teamName: s.teamName }));
    return NextResponse.json({ teams });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load teams" },
      { status: 502 }
    );
  }
}
