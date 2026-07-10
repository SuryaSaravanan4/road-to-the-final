import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OFFICIAL_PROVIDERS, SCREENSHOT_PROVIDER_PREFIX } from "@/providers/registry";
import { parseCompetitionState } from "@/providers/screenshot-bracket/state";

/** Lists everything the competition picker can offer: static official
 * providers plus the user's confirmed screenshot competitions. */
export async function GET() {
  let screenshot: {
    id: string;
    key: string;
    name: string;
    format: string;
    teams: { id: string; name: string }[];
    updatedAt: string;
  }[] = [];
  let warning: string | undefined;

  try {
    const rows = await prisma.competition.findMany({ orderBy: { updatedAt: "desc" } });
    screenshot = rows.map((row) => {
      const state = parseCompetitionState(row);
      return {
        id: row.id,
        key: `${SCREENSHOT_PROVIDER_PREFIX}${row.id}`,
        name: state.name,
        format: state.format,
        teams: state.teams,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  } catch {
    // No Competition table (e.g. ephemeral /tmp database) — the official
    // providers still work; surface why the screenshot list is empty.
    warning =
      "Screenshot competitions are unavailable: the database has no Competition table (see README on Vercel /tmp storage).";
  }

  return NextResponse.json({ official: OFFICIAL_PROVIDERS, screenshot, warning });
}
