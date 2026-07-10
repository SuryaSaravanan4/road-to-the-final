import { NextResponse } from "next/server";
import { getTournamentPath } from "@/lib/road-to-final";
import { resolveTrackedSelection } from "@/lib/tracked-team";

export async function POST(request: Request) {
  const { providerKey, teamId, teamName } = resolveTrackedSelection(
    new URL(request.url).searchParams
  );

  if (!teamId) {
    return NextResponse.json(
      { error: "No tracked team: pick one at /competitions or set TRACKED_TEAM_ID in .env.local." },
      { status: 400 }
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
