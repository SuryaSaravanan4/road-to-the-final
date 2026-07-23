import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/security";

/**
 * Discards a DRAFT ingestion: the human looked at the extraction and judged it
 * not worth correcting. No Competition is created or touched — but unlike
 * silently navigating away, this records the strongest negative signal the
 * pipeline has ("this read was too wrong to fix") plus an optional reason, so
 * the calibration report can count it. Confirm and discard are the only two
 * terminal transitions out of DRAFT.
 */

// A short free-text note; capped so a discard reason can't smuggle in bulk
// data. Optional — an empty/absent reason is a valid "just bad" discard.
const DiscardBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const { id } = await params;

  // The body is optional; only a present-but-malformed one is a 400.
  let reason: string | undefined;
  try {
    const text = await request.text();
    if (text.trim() !== "") {
      reason = DiscardBodySchema.parse(JSON.parse(text)).reason;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? `Discard reason is invalid: ${z.prettifyError(err)}`
            : "Expected a JSON body like { \"reason\": \"…\" }.",
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
      { error: `Ingestion "${id}" is ${ingestion.status}, not a discardable draft.` },
      { status: 409 }
    );
  }

  await prisma.ingestion.update({
    where: { id: ingestion.id },
    data: {
      status: "DISCARDED",
      discardReason: reason && reason !== "" ? reason : null,
      discardedAt: new Date(),
    },
  });

  return NextResponse.json({ ingestionId: ingestion.id, status: "DISCARDED" });
}
