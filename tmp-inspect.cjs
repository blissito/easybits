const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const db = new PrismaClient();
(async () => {
  const l = await db.landing.findFirst({ where: { name: "Be the Nerd" }, select: { id: true, sections: true, metadata: true } });
  if (!l) { console.log("Not found"); return; }
  const sections = l.sections || [];
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  // Write a test HTML file identical to what handleExportPdf generates
  const sectionsHtml = sorted.map((s) => `<div class="page-section">${s.html}</div>`).join("\n");
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Be the Nerd - TEST</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0; }
    body { font-family: 'Inter', sans-serif; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section { page-break-after: always; }
    .page-section:last-child { page-break-after: auto; }
  </style>
</head>
<body>
${sectionsHtml}
</body>
</html>`;

  fs.writeFileSync("/Users/bliss/Desktop/test-export.html", html);
  console.log("Written test-export.html with", sorted.length, "sections");

  // Also dump each section HTML for inspection
  for (const [i, s] of sorted.entries()) {
    console.log(`\n=== Section ${i} (${s.label}) ===`);
    console.log("HTML length:", s.html.length);
    // Look for problematic CSS
    const hasAbsoluteBottom = s.html.includes("absolute") && (s.html.includes("bottom-") || s.html.includes("inset-"));
    const hasMinScreen = s.html.includes("min-h-screen");
    const hasFixedHeight = s.html.includes("h-[11in]");
    const hasMinHeight = s.html.includes("min-h-[11in]");
    console.log("absolute+bottom:", hasAbsoluteBottom, "min-h-screen:", hasMinScreen, "h-[11in]:", hasFixedHeight, "min-h-[11in]:", hasMinHeight);
    // Print first line of section tag
    const match = s.html.match(/<section[^>]*>/);
    console.log("Tag:", match ? match[0] : "no section tag");
  }

  await db.$disconnect();
})();
