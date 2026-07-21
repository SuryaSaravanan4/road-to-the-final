import { prisma } from "@/lib/db";
import { CONFIDENCE_CONFIRM_THRESHOLD } from "@/lib/ingestion";
import { BracketExtractionSchema } from "@/reasoning/bracketExtractionSchema";
import { CorrectedExtractionSchema } from "@/lib/draft-to-state";
import {
  calibrationBins,
  counted,
  discrimination,
  observeIngestion,
  summarizeByField,
  thresholdReport,
  type FieldObservation,
} from "@/lib/calibration";

/**
 * Prints what the confirmed ingestions say about extraction confidence:
 * whether it predicts human correction, how the live review threshold
 * performs, and which fields Claude gets wrong most.
 *
 *   npm run calibration            summary
 *   npm run calibration -- --edits also list every correction
 */

const pct = (value: number | null, digits = 1) =>
  value === null ? "     —" : `${(value * 100).toFixed(digits)}%`.padStart(6);

const num = (value: number, width = 5) => String(value).padStart(width);

async function main() {
  const showEdits = process.argv.includes("--edits");

  const ingestions = await prisma.ingestion.findMany({
    where: { status: "CONFIRMED", corrections: { not: null } },
    orderBy: { confirmedAt: "asc" },
    select: {
      id: true,
      rawExtraction: true,
      corrections: true,
      competition: { select: { name: true } },
    },
  });

  if (ingestions.length === 0) {
    console.log(
      "No confirmed ingestions with corrections yet — nothing to calibrate.\n" +
        "Confirm a screenshot at /competitions to start collecting evidence."
    );
    return;
  }

  const observations: FieldObservation[] = [];
  const structural: string[] = [];
  const skipped: string[] = [];

  for (const row of ingestions) {
    // Schemas are re-validated rather than trusted: these rows may predate the
    // current shape, and a silently-misparsed row would skew every number.
    const raw = BracketExtractionSchema.safeParse(JSON.parse(row.rawExtraction));
    const corrected = CorrectedExtractionSchema.safeParse(JSON.parse(row.corrections!));
    if (!raw.success || !corrected.success) {
      skipped.push(
        `${row.id} (${raw.success ? "corrections" : "rawExtraction"} does not match the current schema)`
      );
      continue;
    }

    // The name fallback only fires when the screenshot had no readable title,
    // and that case is excluded as auto-filled either way — so passing the
    // competition's current name is safe for first ingestions too.
    const result = observeIngestion(row.id, raw.data, corrected.data, row.competition?.name);
    observations.push(...result.observations);
    structural.push(...result.structural.map((note) => `${row.id}: ${note}`));
  }

  const pool = counted(observations);
  const edits = pool.filter((o) => o.edited);
  const { auc, nEdited, nClean } = discrimination(observations);
  const threshold = thresholdReport(observations);

  console.log(`\nExtraction calibration — ${ingestions.length} confirmed ingestion(s)`);
  console.log("=".repeat(64));
  console.log(`  Comparable fields   ${num(pool.length)}`);
  console.log(`  Human edit rate     ${pct(pool.length === 0 ? null : edits.length / pool.length)}   (${edits.length} corrected)`);
  console.log(
    `  Confidence AUC      ${auc === null ? "    —" : auc.toFixed(3)}   ` +
      `(0.5 = confidence predicts nothing; ${nEdited} edited vs ${nClean} clean)`
  );

  console.log(`\nReview threshold (flags confidence < ${CONFIDENCE_CONFIRM_THRESHOLD})`);
  console.log("-".repeat(64));
  console.log(
    `  Flagged             ${num(threshold.flagged)} fields, ${threshold.flaggedEdits} actually wrong` +
      `   precision ${pct(threshold.precision)}`
  );
  console.log(
    `  Not flagged         ${num(threshold.unflagged)} fields, ${threshold.unflaggedEdits} wrong anyway` +
      `   recall    ${pct(threshold.recall)}`
  );
  console.log(
    `  Unflagged error rate ${pct(threshold.unflaggedEditRate)}   ` +
      "(errors the preview did not ask anyone to check)"
  );

  console.log("\nCalibration by confidence");
  console.log("-".repeat(64));
  console.log("  band            n   implied   observed   gap");
  for (const bin of calibrationBins(observations)) {
    if (bin.n === 0) continue;
    const gap = bin.observedEditRate - bin.expectedEditRate;
    console.log(
      `  ${bin.lower.toFixed(2)}–${bin.upper.toFixed(2)} ${num(bin.n)}   ` +
        `${pct(bin.expectedEditRate)}    ${pct(bin.observedEditRate)}   ` +
        `${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(1)}pp${gap > 0.05 ? "  overconfident" : ""}`
    );
  }

  console.log("\nMost-corrected fields");
  console.log("-".repeat(64));
  console.log("  field                 n  edits    rate   conf(ok)  conf(edited)");
  for (const summary of summarizeByField(observations)) {
    console.log(
      `  ${summary.field.padEnd(18)}${num(summary.n)}  ${num(summary.edits, 5)}  ${pct(summary.editRate)}   ` +
        `${summary.meanConfidenceClean?.toFixed(2).padStart(6) ?? "     —"}    ` +
        `${summary.meanConfidenceEdited?.toFixed(2).padStart(6) ?? "     —"}`
    );
  }

  const excluded = observations.filter((o) => o.excluded);
  if (excluded.length > 0) {
    const byReason = new Map<string, number>();
    for (const o of excluded) byReason.set(o.excluded!, (byReason.get(o.excluded!) ?? 0) + 1);
    console.log(
      `\nExcluded as not-human-authored: ` +
        Array.from(byReason, ([reason, n]) => `${reason} ${n}`).join(", ")
    );
  }
  if (structural.length > 0) {
    console.log(`\nStructural mismatches (unpaired):\n  ${structural.join("\n  ")}`);
  }
  if (skipped.length > 0) {
    console.log(`\nSkipped ingestions:\n  ${skipped.join("\n  ")}`);
  }

  if (showEdits && edits.length > 0) {
    console.log("\nEvery correction");
    console.log("-".repeat(64));
    for (const o of edits) {
      console.log(
        `  [${o.confidence.toFixed(2)}] ${o.path}\n      ${o.extracted}  ->  ${o.corrected}`
      );
    }
  } else if (edits.length > 0) {
    console.log(`\nRun with --edits to list all ${edits.length} corrections.`);
  }

  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
