/**
 * One-shot: borra los leads de prueba (fixtergeek@gmail.com / Héctor BlisS)
 * de los forms del quiz "¿Cuánto cuesta mi agente?".
 *
 * Run: npx tsx scripts/delete-test-quiz-leads.ts
 *      Add --dry-run flag to preview without deleting.
 */
import { db } from "../app/.server/db";

const QUIZ_FORM_IDS = [
  "69efaea1fa87b78d893a311e", // v1 (deprecated, sin campo integrations)
  "69efd203ad74435521a74b34", // v2 (current)
];

const TEST_EMAILS = ["fixtergeek@gmail.com"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `\n${dryRun ? "🔍 DRY RUN — nothing will be deleted" : "⚠️  LIVE — submissions will be permanently deleted"}\n`
  );

  for (const formId of QUIZ_FORM_IDS) {
    const matches = await db.formSubmission.findMany({
      where: {
        formConfigId: formId,
        OR: TEST_EMAILS.map((email) => ({
          data: { path: ["email"], equals: email },
        })),
      },
      select: {
        id: true,
        createdAt: true,
        data: true,
      },
    });

    console.log(`Form ${formId}: ${matches.length} test submissions found`);
    matches.forEach((m) => {
      const data = m.data as Record<string, unknown>;
      console.log(
        `  - ${m.id} · ${m.createdAt.toISOString()} · ${data?.email} · "${data?.business || "—"}"`
      );
    });

    if (!dryRun && matches.length > 0) {
      const result = await db.formSubmission.deleteMany({
        where: { id: { in: matches.map((m) => m.id) } },
      });
      console.log(`  ✅ Deleted ${result.count} records\n`);
    } else {
      console.log("");
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
