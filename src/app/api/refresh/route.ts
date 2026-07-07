import { NextResponse } from "next/server";
import { getTournamentPath } from "@/lib/road-to-final";
import { getTrackedTeamConfig } from "@/lib/tracked-team";

export async function POST() {
  const { providerKey, teamId, teamName } = getTrackedTeamConfig();

  if (!teamId) {
    return NextResponse.json(
      { error: "TRACKED_TEAM_ID is not configured. Set it in .env.local." },
      { status: 500 }
    );
  }

  try {
    const result = await getTournamentPath({ providerKey, teamId, teamName, forceRefresh: true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 502 }
    );
  }
}
