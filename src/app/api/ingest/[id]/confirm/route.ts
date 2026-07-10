import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CorrectedExtractionSchema, draftToState } from "@/lib/draft-to-state";
import { diffStates, mergeStates, type ExistingState, type StateDiff } from "@/lib/state-diff";
import { parseCompetitionState } from "@/providers/screenshot-bracket/state";
import { SCREENSHOT_PROVIDER_PREFIX } from "@/providers/registry";
import { isSameOriginRequest } from "@/lib/security";

/**
 * Confirms a DRAFT ingestion: the human-reviewed, corrected extraction
 * becomes (or updates) a Competition's confirmed state. This is the only
 * write path to screenshot ground truth — and it is pure deterministic code
 * over the user-approved payload; no model output reaches here unreviewed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const { id } = await params;

  let corrected;
  try {
    const body = await request.json();
    corrected = CorrectedExtractionSchema.parse(body?.corrected);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? `Corrected bracket is invalid: ${z.prettifyError(err)}`
            : "Expected a JSON body with a \"corrected\" bracket payload.",
      },
      { status: 400 }
    );
  }

  const ingestion = await prisma.ingestion.findUnique({ where: { id } });
  if (!ingestion) {
    return NextResponse.json({ error: `Ingestion "${id}" not found.` }, { status: 404 });
  }
  if (ingestion.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Ingestion "${id}" is ${ingestion.status}, not a confirmable draft.` },
      { status: 409 }
    );
  }

  let existingState: ExistingState | null = null;
  if (ingestion.competitionId) {
    const row = await prisma.competition.findUnique({ where: { id: ingestion.competitionId } });
    if (!row) {
      return NextResponse.json(
        { error: `Competition "${ingestion.competitionId}" no longer exists.` },
        { status: 404 }
      );
    }
    existingState = parseCompetitionState(row);
  }

  let proposed;
  try {
    proposed = draftToState(corrected, existingState?.teams ?? []);
  } catch (err) {
    // Deterministic conversion rejects incoherent corrections (e.g. a winner
    // that is neither listed team) — a user-fixable 400, not a server error.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Corrected bracket could not be converted." },
      { status: 400 }
    );
  }

  let diff: StateDiff;
  let merged: ExistingState;
  if (existingState) {
    diff = diffStates(existingState, proposed);
    merged = mergeStates(existingState, proposed);
  } else {
    // First ingestion: the "diff" is everything-added, recorded against an
    // empty state so appliedDiff is uniform across first and re-ingestions.
    const empty: ExistingState = {
      name: proposed.name,
      format: proposed.format,
      teams: [],
      fixtures: [],
      standings: [],
      stageOrder: [],
    };
    diff = diffStates(empty, proposed);
    merged = proposed;
  }

  const stateColumns = {
    name: merged.name,
    format: merged.format,
    teams: JSON.stringify(merged.teams),
    fixtures: JSON.stringify(merged.fixtures),
    standings: JSON.stringify(merged.standings),
    stageOrder: JSON.stringify(merged.stageOrder),
  };

  const competitionId = await prisma.$transaction(async (tx) => {
    const competition = ingestion.competitionId
      ? await tx.competition.update({ where: { id: ingestion.competitionId }, data: stateColumns })
      : await tx.competition.create({ data: stateColumns });

    await tx.ingestion.update({
      where: { id: ingestion.id },
      data: {
        competitionId: competition.id,
        corrections: JSON.stringify(corrected),
        appliedDiff: JSON.stringify(diff),
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    return competition.id;
  });

  // Confirmed data changed, so any cached Claude scenarios reasoned from the
  // old state are invalid — drop them rather than serving them for a TTL.
  try {
    await prisma.cacheEntry.deleteMany({
      where: { key: { startsWith: `${SCREENSHOT_PROVIDER_PREFIX}${competitionId}:` } },
    });
  } catch {
    // Cache table may not exist yet (it's created lazily) — nothing to drop.
  }

  return NextResponse.json({
    competitionId,
    providerKey: `${SCREENSHOT_PROVIDER_PREFIX}${competitionId}`,
    diff,
  });
}
