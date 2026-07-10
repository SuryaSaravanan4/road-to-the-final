import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_SCREENSHOT_BYTES } from "@/lib/ingestion";
import { sniffImage, validateScreenshot } from "@/lib/image-validation";
import { createRateLimiter, clientKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { extractBracket } from "@/reasoning/claude-client";

// Every accepted upload is a paid Claude vision call, so /api/ingest is a
// cost-abuse vector: per-client and global fixed windows bound the spend.
const perClientLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5 });
const globalLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 });

/**
 * Uploads a bracket screenshot and runs Claude vision extraction. The result
 * is stored as a DRAFT Ingestion and returned for the confirmation preview —
 * no Competition is created or modified here. Send multipart/form-data with
 * an "image" file, plus "competitionId" when re-ingesting into an existing
 * competition.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an \"image\" file field." },
      { status: 400 }
    );
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Missing \"image\" file field." }, { status: 400 });
  }

  // The client-declared MIME type is never trusted — the bytes are sniffed
  // and the header-declared dimensions are capped (decompression bombs).
  const bytes = new Uint8Array(await image.arrayBuffer());
  const rejection = validateScreenshot(bytes, MAX_SCREENSHOT_BYTES);
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 400 });
  }
  const mediaType = sniffImage(bytes)!.mediaType;

  const competitionIdRaw = form.get("competitionId");
  const competitionId =
    typeof competitionIdRaw === "string" && competitionIdRaw ? competitionIdRaw : null;
  if (competitionId) {
    const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
    if (!competition) {
      return NextResponse.json(
        { error: `Competition "${competitionId}" not found — cannot re-ingest into it.` },
        { status: 404 }
      );
    }
  }

  // The limit gates the paid Claude call specifically, so it sits after the
  // free validations — a rejected junk upload must not consume budget slots.
  if (!globalLimiter.allow("global") || !perClientLimiter.allow(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many extraction requests — try again in a few minutes." },
      { status: 429 }
    );
  }

  const imageData = Buffer.from(bytes).toString("base64");

  let extraction;
  try {
    extraction = await extractBracket({ data: imageData, mediaType });
  } catch (err) {
    // Covers both API failures and schema-invalid model output — either way
    // there is no draft to review, and nothing was persisted as truth.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bracket extraction failed" },
      { status: 502 }
    );
  }

  const ingestion = await prisma.ingestion.create({
    data: {
      competitionId,
      imageData,
      imageMediaType: mediaType,
      rawExtraction: JSON.stringify(extraction),
      status: "DRAFT",
    },
  });

  return NextResponse.json({ ingestionId: ingestion.id, competitionId, extraction });
}
