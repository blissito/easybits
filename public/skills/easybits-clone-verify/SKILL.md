---
name: easybits-clone-verify
description: Verify that an HTML clone of a PDF (a document, deck or slide exported to PDF) looks the same as the original, page by page, with a deterministic score from EasyBits - layout difference, pixel difference, how much text stayed editable, and where the differences are - and iterate until every page passes. Use when cloning, converting or recreating a PDF or presentation as HTML, when the user asks for a pixel-perfect or faithful copy, or before saying a clone "looks right".
license: MIT
compatibility: Needs Node 18+ (or any HTTP client), network access to https://www.easybits.cloud and an EasyBits API key with WRITE scope
metadata:
  author: easybits
  version: "1.0"
---

# Verify a PDF clone until it passes

Don't judge a clone by eye. Measure it, fix the worst spot, measure again. The number is
deterministic, so you can keep iterating without a human in the loop.

## The loop

1. Put the clone in a folder, one self-contained HTML file per page: `page-1.html`, `page-2.html`…
   Design each page **at 1200 px wide** with the PDF page's aspect ratio (a US-letter page is
   1200×1553): that is the exact size it gets rendered at.
2. Measure:

   ```bash
   node scripts/compare.mjs --pdf <fileId or https URL of the original PDF> --dir ./clone
   ```

   Exit code 0 = every page passes, 1 = keep iterating, 2 = usage or network error.
3. Take the **worst page** (highest `layout`) and fix its **first region** (`x y w×h`, in page
   pixels). If the region doesn't tell you enough, open that page's `diffUrl` in
   `compare-report.json`: original | clone | differences in red.
4. Go back to 2. Stop when it exits 0.

No script handy? It is one call: `POST https://www.easybits.cloud/api/v2/render/compare` with
`{ fileId | pdfUrl, pages: [{ page, html }] }`, the SDK's `eb.compareRender(...)`, or the MCP tool
`compare_render` (fleet agents have it on their `render` MCP).

## Reading the numbers

| Field | Meaning |
|---|---|
| `layout` | Composition difference, ignoring letter anti-aliasing. **This one decides.** Passes at ≤ 0.02. |
| `pixel` | Full-resolution difference, font noise included. Informative only. |
| `textCoverage` | Share of the PDF's words present as real text in the HTML. Passes at ≥ 0.95. `null` = scanned PDF. |
| `trusted` | The HTML rendered identically twice. If `false`, no number means anything yet. |
| `regions` | Where the difference is, worst first. |

## Rules

- **Never paste the PDF (or a screenshot of it) as an image to win.** It scores `layout≈0` but
  `textCoverage≈0` and fails: a clone nobody can edit is not a clone.
- `trusted: false` means your page is not deterministic: remove animations and transitions, inline
  or preload web fonts, or pass `--wait 800`. Fix that before chasing the score.
- A residue that is only a slightly different version of the same font is not worth chasing. Say
  so and stop.
- Each page costs 1 credit per run. Compare only the pages you changed (`--pages 2,5`) while
  iterating, and run all of them once at the end.
