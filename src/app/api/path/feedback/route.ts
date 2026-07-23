import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/security";
import { SCENARIO_PROMPT_VERSION } from "@/reasoning/buildScenarioPrompt";

/**
 * Records a human verdict on one Claude-assessed scenario (ADR 0002). Because
 * a scenario is ephemeral — regenerated every cache TTL and never persisted —
 * the client echoes back the assessment exactly as it was shown, and this
 * endpoint snapshots it next to the verdict. There is no ground truth to check
 * against; the corpus feeds an agreement rate, not an error rate.
 *
 * Last-write-wins per scenario slot: Phase 1 has no user model, so this is one
 * opinion per scenario, not one per user (same unauthenticated gap as the rest
 * of the write paths).
 */

const Difficulty = z.enum(["easy", "medium", "hard"]);

const FeedbackSchema = z.object({
  // Identity of the scenario slot — echoed from the path result.
  providerKey: z.string().min(1),
  teamId: z.string().min(1),
  stage: z.string().min(1),
  opponentId: z.string().min(1),
  opponentName: z.string().min(1),
  // The assessment as shown — the frozen "raw" side. Reasoning is capped since
  // it is client-supplied and stored verbatim.
  source: z.enum(["model", "bracket"]),
  difficulty: Difficulty,
  likelihood: z.number().int().min(0).max(100),
  reasoning: z.string().max(2000),
  // The verdict — the "corrected" side.
  verdict: z.enum(["agree", "disagree"]),
  difficultyCorrection: Difficulty.optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  let body;
  try {
    body = FeedbackSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? `Feedback is invalid: ${z.prettifyError(err)}`
            : "Expected a JSON scenario-feedback body.",
      },
      { status: 400 }
    );
  }

  // A corrected band only means something when the user disagreed; drop it
  // otherwise so "agree + correction" can't produce a contradictory row.
  const difficultyCorrection =
    body.verdict === "disagree" ? body.difficultyCorrection ?? null : null;
  const note = body.note && body.note !== "" ? body.note : null;

  // model + promptVersion are server-side provenance. The scenario was drawn
  // from at most a TTL-old cache, so the current env model and prompt version
  // are the ones that produced it in all but a deploy-boundary race — an
  // acceptable approximation for Phase A (ADR 0002).
  const provenance = {
    model: process.env.ANTHROPIC_MODEL ?? null,
    promptVersion: SCENARIO_PROMPT_VERSION,
  };

  const snapshot = {
    opponentName: body.opponentName,
    source: body.source,
    difficulty: body.difficulty,
    likelihood: body.likelihood,
    reasoning: body.reasoning,
    verdict: body.verdict,
    difficultyCorrection,
    note,
    ...provenance,
  };

  await prisma.scenarioFeedback.upsert({
    where: {
      providerKey_teamId_stage_opponentId: {
        providerKey: body.providerKey,
        teamId: body.teamId,
        stage: body.stage,
        opponentId: body.opponentId,
      },
    },
    create: {
      providerKey: body.providerKey,
      teamId: body.teamId,
      stage: body.stage,
      opponentId: body.opponentId,
      ...snapshot,
    },
    update: snapshot,
  });

  return NextResponse.json({ ok: true, verdict: body.verdict });
}
