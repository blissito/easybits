---
name: easybits-clone-verify
description: Verify that an HTML clone of a PDF (a document, deck or slide exported to PDF) matches the original page by page with EasyBits' compare_render - every word as live text in its place, same fonts, sizes, weights, colors and letter spacing, nothing baked into images, no overflow - and iterate on the reasons it returns until every page passes. Use when cloning, converting or recreating a PDF or presentation as HTML, when the user asks for a pixel-perfect or faithful copy, or before saying a clone "looks right".
license: MIT
compatibility: Needs Node 18+ (or any HTTP client), network access to https://www.easybits.cloud and an EasyBits API key with WRITE scope
metadata:
  author: easybits
  version: "2.1"
---

# Verify a PDF clone until it passes

Don't judge a clone by eye. Measure it, fix what `reasons` says, measure again. The verdict
is deterministic and measured on what the browser **paints**, so iterating against it works.

## The loop

1. One self-contained HTML file per page: `page-1.html`, `page-2.html`… Size each page to the
   PDF page's **CSS size = points × 4/3** (US letter = 816×1056 px). The first run tells you the
   exact size in `pageCss`; anything outside it counts as overflow.
2. Measure:

   ```bash
   node scripts/compare.mjs --pdf <fileId or https URL of the original PDF> --dir ./clone
   ```

   Exit code 0 = every page passes, 1 = keep iterating, 2 = usage or network error.
3. Fix the **first reason** of the first failing page (they come in Spanish, with the word, its
   position and what differs). For visual differences open that page's `diffUrl` in
   `compare-report.json`: original | clone | differences in red.
4. Back to 2 until it exits 0.

No script handy? It is one call: `POST https://www.easybits.cloud/api/v2/render/compare` with
`{ fileId | pdfUrl, pages: [{ page, html }] }`, the SDK's `eb.compareRender(...)`, or the MCP tool
`compare_render` (fleet agents have it on their `render` MCP).

## What passes

| Check | Rule |
|---|---|
| `text` | Every word of the PDF exists as DOM text, within 1.5 pt of its place. **None may be missing.** |
| `text.typography` | Same font family, size, weight, italic, color and word **width**. `originalFonts` names the fonts. |
| `liveText` | Text is not inside an image or canvas, nor hidden on top of an image of the PDF. |
| `overflow` | Nothing sticks out of `pageCss`. |
| `trusted` | The page renders identically twice. |
| `layout` | Backgrounds, colors, tables and shapes match. `regions` says where. |
| `screen` | It looks the same on screen as printed. |
| `violations` | The HTML is static: no scripts, `@media`, external CSS (Google/Bunny Fonts OK) or CSS `content` text. |
| visible & shape | Every word is visible (not covered) and drawn with the original's glyphs. |
| `invented` | No letters or digits the original doesn't have. |

Thresholds are fixed; you cannot relax them.

## How to get there

- **Fonts:** use the families in `originalFonts` (Google Fonts has most; Arial/Times/Calibri may be
  replaced by Liberation Sans/Serif or Carlito, which measure the same). Load web fonts in `<head>`
  with `display=block`. Weight is read from the PDF's font descriptor, not the name — match it.
- **Width:** PDFs exported from Word often tighten letters. If a reason says `ancho X→Y pt`, add
  `letter-spacing` to that text: `(X − Y) × 4/3 ÷ (letters − 1)` px.
- **Position:** `misplaced` gives `dx`/`dy` in pt (× 4/3 for px). Fix the container, not word by word.
- **Superscripts and symbols** are compared literally: `m²` is not `m2`.

## The page is evaluated as a static document

It runs **without JavaScript**, is printed to PDF and screenshotted. So: write every word in the
HTML (not via CSS `content`), inline your CSS (web fonts from Google/Bunny Fonts are the only
external stylesheet allowed), and don't use `@media`, `backdrop-filter` or `mix-blend-mode`
(rejected: Chrome prints them differently than it shows them). Anything else that renders
differently in print than on screen fails `screen`.

Every rule is zero-tolerance: one missing, misplaced, recolored, covered or invented word fails the
page, and `reasons` names it with its position. A faithful clone scores exactly 1.0 / 0.

## Never

- Paste the PDF (or a screenshot of it) as an image — with or without text on top, shifted, blurred
  or transparent. `liveText` catches it.
- Draw text on `<canvas>` or use SVG paths for text.
- Hide overflow with `overflow:hidden` to make it "fit": cut text is missing text.
- Cover, recolor or overlay text, or use a font that draws other glyphs: every word is checked for
  visibility and glyph shape against the original.
- Chase a residue that is only anti-aliasing. If every check passes but `pixel` is not 0, you are done.

Each page costs 1 credit per run. While iterating compare only the pages you changed
(`--pages 2,5`); run all of them once at the end.
