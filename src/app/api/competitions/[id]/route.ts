import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCompetitionState } from "@/providers/screenshot-bracket/state";

/** Full confirmed state of one screenshot competition — the re-ingestion
 * preview diffs the new extraction against this client-side. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = await prisma.competition.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: `Competition "${id}" not found.` }, { status: 404 });
  }
  return NextResponse.json(parseCompetitionState(row));
}
