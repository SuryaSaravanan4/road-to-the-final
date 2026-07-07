import { NextResponse } from "next/server";
import { getTournamentPath } from "@/lib/road-to-final";
import { getTrackedTeamConfig } from "@/lib/tracked-team";

/**
 * Meant to be pinged periodically by an external scheduler (Vercel Cron on a
 * paid plan, or a free GitHub Actions schedule — see README) to keep the
 * cache warm. If CRON_SECRET is set, callers must send it as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { providerKey, teamId, teamName } = getTrackedTeamConfig();
  if (!teamId) {
    return NextResponse.json(
      { error: "TRACKED_TEAM_ID is not configured. Set it in .env.local." },
      { status: 500 }
    );
  }

  try {
    const result = await getTournamentPath({ providerKey, teamId, teamName, forceRefresh: true });
    return NextResponse.json({ ok: true, dataFetchedAt: result.dataFetchedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron refresh failed" },
      { status: 502 }
    );
  }
}
