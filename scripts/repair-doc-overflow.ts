import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const docId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!docId) {
  console.error("usage: tsx repair-doc-overflow.ts <docId> [--apply]");
  process.exit(1);
}

const db = new PrismaClient();

const replacements: Array<{ from: string; to: string; note: string }> = [
  {
    note: "MercadoPago body: tighter padding + gap",
    from: '<div class="flex items-center gap-6 px-6 py-3" style="background:#F0F2F8">',
    to: '<div class="flex items-center gap-4 px-5 py-2" style="background:#F0F2F8">',
  },
  {
    note: "MercadoPago: smaller QR (w-24→w-20)",
    from: 'class="w-24 h-24" />\n          <p style="font-size:9px;color:#2B3659">Escanea para pagar</p>',
    to: 'class="w-20 h-20" />\n          <p style="font-size:9px;color:#2B3659">Escanea para pagar</p>',
  },
  {
    note: "MercadoPago: smaller total (text-2xl→text-xl) so button fits",
    from: '<p class="text-2xl font-black" style="color:#2B3659">$ 1,582.00</p>',
    to: '<p class="text-xl font-black" style="color:#2B3659">$ 1,582.00</p>',
  },
  {
    note: "MercadoPago: tighter right column (gap-2→gap-1)",
    from: '<div class="shrink-0 flex flex-col items-end gap-2">',
    to: '<div class="shrink-0 flex flex-col items-end gap-1">',
  },
  {
    note: "MercadoPago: smaller button padding (9px 22px → 6px 18px)",
    from: 'padding:9px 22px;border-radius:8px',
    to: 'padding:6px 18px;border-radius:8px',
  },
];

(async () => {
  const doc = await db.landing.findUnique({ where: { id: docId } });
  if (!doc) {
    console.error("Doc not found");
    process.exit(1);
  }
  const sections = (doc.sections as any[]) || [];
  const page1 = sections.find((s) => s.id === "page1");
  if (!page1) {
    console.error("page1 not found");
    process.exit(1);
  }

  const original = page1.html as string;
  let updated = original;
  const applied: string[] = [];
  const missing: string[] = [];

  for (const r of replacements) {
    if (updated.includes(r.from)) {
      updated = updated.replace(r.from, r.to);
      applied.push(r.note);
    } else {
      missing.push(r.note);
    }
  }

  console.log(`Document: ${doc.name}`);
  console.log(`page1 HTML length: ${original.length} → ${updated.length}`);
  console.log(`\nApplied (${applied.length}):`);
  applied.forEach((n) => console.log(`  ✓ ${n}`));
  if (missing.length) {
    console.log(`\nMissing (string not found):`);
    missing.forEach((n) => console.log(`  ✗ ${n}`));
  }

  if (!apply) {
    console.log(`\n[dry-run] use --apply to write to DB`);
    await db.$disconnect();
    return;
  }

  // Backup
  const backupDir = path.resolve("scripts", "_backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${docId}_page1_${stamp}.html`);
  fs.writeFileSync(backupPath, original);
  console.log(`\nBackup saved: ${backupPath}`);

  // Update sections
  const newSections = sections.map((s) =>
    s.id === "page1" ? { ...s, html: updated } : s
  );
  await db.landing.update({
    where: { id: docId },
    data: { sections: newSections, updatedAt: new Date() },
  });
  console.log(`✓ Doc updated`);

  await db.$disconnect();
})();
