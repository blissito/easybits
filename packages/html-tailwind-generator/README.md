# @easybits.cloud/html-tailwind-generator

> **Production Ready** — Used in production by [Denik](https://denik.me) for AI-generated business landing pages.

AI-powered landing page generator with Tailwind CSS. Canvas editor, streaming AI generation, one-click deploy.

Built and maintained by [EasyBits](https://easybits.cloud).

## Features

- **AI Generation** — Streaming landing page creation with Claude or OpenAI GPT-4o
- **Canvas Editor** — iframe-based preview with click-to-select, inline text editing, section reorder
- **Floating Toolbar** — AI prompt input, style presets (Minimal, Cards, Bold, Glass, Dark), reference image support
- **Code Editor** — CodeMirror 6 with HTML syntax, flash highlight on scroll-to-code, format, Cmd+S
- **Theme System** — 5 preset themes (Neutral, Dark, Slate, Midnight, Warm) + custom multi-color picker
- **Image Enrichment** — Auto-replace placeholder images with Pexels stock photos or DALL-E generated images
- **Deploy** — To EasyBits hosting (`slug.easybits.cloud`) or any S3-compatible storage

## Install

```bash
npm install @easybits.cloud/html-tailwind-generator
```

## Environment Variables

All API keys can be set via environment variables instead of passing them explicitly:

| Variable | Used by | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `generateLanding`, `refineLanding`, DALL-E images | OpenAI API key — enables GPT-4o generation + DALL-E 3 images |
| `ANTHROPIC_API_KEY` | `generateLanding`, `refineLanding` | Anthropic API key (auto-read by `@ai-sdk/anthropic`) |
| `PEXELS_API_KEY` | `enrichImages`, `searchImage` | Pexels stock photo API key |

**Priority**: If both keys are set, Anthropic takes precedence for text generation. OpenAI is used as fallback, or for DALL-E image generation when `openaiApiKey` is available.

**Mix providers**: You can use Anthropic for text generation + DALL-E for images (best of both). Denik uses this setup in production — Claude Sonnet for generation, Haiku for refinement, and DALL-E 3 for images.

## Quick Start

### Generate a landing page (server-side)

The simplest usage — set either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (plus `PEXELS_API_KEY` for stock photos) in your `.env`:

```ts
import { generateLanding } from "@easybits.cloud/html-tailwind-generator/generate";

const sections = await generateLanding({
  prompt: "SaaS de gestión de proyectos para equipos remotos",
  onSection(section) {
    console.log("New section:", section.label);
  },
});
```

You can also pass keys explicitly if you prefer:

```ts
const sections = await generateLanding({
  anthropicApiKey: "sk-ant-...",
  pexelsApiKey: "...",
  prompt: "SaaS de gestión de proyectos para equipos remotos",
  onSection(section) {
    console.log("New section:", section.label);
  },
  onImageUpdate(id, html) {
    console.log("Images enriched for", id);
  },
});
```

### Generate with OpenAI + DALL-E

Pass `openaiApiKey` to use GPT-4o for text and DALL-E 3 for images (one key for everything):

```ts
const sections = await generateLanding({
  openaiApiKey: "sk-...",
  prompt: "SaaS de gestión de proyectos para equipos remotos",
  onSection(section) {
    console.log("New section:", section.label);
  },
});
```

When `openaiApiKey` is provided:
- **Generation** uses GPT-4o (or custom `model`)
- **Refinement** uses GPT-4o-mini (GPT-4o when `referenceImage` is provided)
- **Images** use DALL-E 3 with Pexels as fallback

### Refine a section

```ts
import { refineLanding } from "@easybits.cloud/html-tailwind-generator/refine";

const html = await refineLanding({
  currentHtml: sections[0].html,
  instruction: "Make it more minimal with more whitespace",
  onChunk(accumulated) {
    // Stream partial HTML to UI
  },
});
```

### Use the editor components (React)

```tsx
import { Canvas, SectionList, FloatingToolbar, CodeEditor } from "@easybits.cloud/html-tailwind-generator/components";
import type { Section3, IframeMessage } from "@easybits.cloud/html-tailwind-generator";

function MyEditor() {
  const [sections, setSections] = useState<Section3[]>([]);
  const canvasRef = useRef<CanvasHandle>(null);
  const iframeRectRef = useRef<DOMRect | null>(null);

  return (
    <div className="flex h-screen">
      <SectionList
        sections={sections}
        selectedSectionId={null}
        theme="default"
        onThemeChange={(id) => {/* ... */}}
        onSelect={(id) => canvasRef.current?.scrollToSection(id)}
        onOpenCode={(id) => {/* ... */}}
        onReorder={(from, to) => {/* ... */}}
        onDelete={(id) => {/* ... */}}
        onRename={(id, label) => {/* ... */}}
        onAdd={() => {/* ... */}}
      />
      <Canvas
        ref={canvasRef}
        sections={sections}
        theme="default"
        onMessage={(msg: IframeMessage) => {/* ... */}}
        iframeRectRef={iframeRectRef}
      />
    </div>
  );
}
```

### Build HTML for deploy

```ts
import { buildDeployHtml } from "@easybits.cloud/html-tailwind-generator";

const html = buildDeployHtml(sections, "midnight");
// → Complete HTML with Tailwind CDN, theme CSS, all sections
```

### Deploy

```ts
// Option 1: Deploy to EasyBits (zero config)
import { deployToEasyBits } from "@easybits.cloud/html-tailwind-generator/deploy";

const url = await deployToEasyBits({
  apiKey: "eb_...",
  slug: "my-landing",
  sections,
  theme: "midnight",
});
// → https://my-landing.easybits.cloud

// Option 2: Deploy to S3 / R2 / Tigris (bring your own storage)
import { deployToS3 } from "@easybits.cloud/html-tailwind-generator/deploy";

const url = await deployToS3({
  sections,
  theme: "midnight",
  upload: async (html) => {
    await s3.putObject({ Bucket: "my-bucket", Key: "index.html", Body: html });
    return "https://my-bucket.s3.amazonaws.com/index.html";
  },
});
```

## Exports

| Path | Exports |
|------|---------|
| `@easybits.cloud/html-tailwind-generator` | Everything below (re-exported for convenience) |
| `@easybits.cloud/html-tailwind-generator/generate` | `generateLanding`, `extractJsonObjects`, `SYSTEM_PROMPT`, `PROMPT_SUFFIX`, type `GenerateOptions` |
| `@easybits.cloud/html-tailwind-generator/refine` | `refineLanding`, `REFINE_SYSTEM`, type `RefineOptions` |
| `@easybits.cloud/html-tailwind-generator/deploy` | `deployToEasyBits`, `deployToS3`, types `DeployToS3Options`, `DeployToEasyBitsOptions` |
| `@easybits.cloud/html-tailwind-generator/images` | `searchImage`, `enrichImages`, `findImageSlots`, `generateImage`, type `PexelsResult` |
| `@easybits.cloud/html-tailwind-generator/components` | `Canvas`, `SectionList`, `FloatingToolbar`, `CodeEditor`, type `CanvasHandle` |

Types also exported from the root path: `Section3`, `IframeMessage`, `LandingTheme`, `CustomColors`.

## Theme System

The generator uses a semantic color system with CSS custom properties:

- `bg-primary`, `text-primary`, `bg-primary-light`, `bg-primary-dark`
- `bg-surface`, `bg-surface-alt`, `text-on-surface`, `text-on-surface-muted`
- `text-on-primary`, `bg-secondary`, `bg-accent`

5 built-in themes + custom colors with auto-derived light/dark/contrast variants.

## Peer Dependencies

**Required:**
- `react` >= 18
- `ai` >= 4 (Vercel AI SDK)
- `@ai-sdk/anthropic` >= 3 (for Claude)

**Optional (for OpenAI support):**
- `@ai-sdk/openai` >= 1

**Optional (for editor components):**
- `react-dom`, `react-icons`
- CodeMirror packages (required if you use `CodeEditor`):
  ```bash
  npm install @codemirror/lang-html @codemirror/state @codemirror/theme-one-dark @codemirror/view @codemirror/commands @codemirror/search @codemirror/language @codemirror/autocomplete
  ```

## TODO

> These are planned improvements — contributions welcome for noncommercial use.

- [ ] **Inline Tailwind CSS build** — Replace CDN `<script src="tailwindcss.com">` with `@tailwindcss/standalone` or PostCSS to generate only used CSS as `<style>`. Faster load, no external dependency, production-ready.
- [x] **DALL-E image generation** — `openaiApiKey` option generates unique images via DALL-E 3 with Pexels fallback.
- [x] **tsup build** — ESM + types via tsup. Published to npm as `@easybits.cloud/html-tailwind-generator`.
- [ ] **i18n** — Component labels are in Spanish. Add a `locale` prop or i18n system for English and other languages.
- [ ] **Tests** — Unit tests for `extractJsonObjects`, `findImageSlots`, `buildDeployHtml`, `buildCustomTheme`.
- [ ] **Storybook** — Visual stories for Canvas, SectionList, FloatingToolbar, CodeEditor.
- [ ] **Upgrade OpenAI models** — Evaluate GPT-5 / GPT-5-mini as defaults for generation and refinement. Compare quality, latency, and cost vs current GPT-4o/4o-mini. Update `resolveModel()` defaults if better.

## Used in Production

- **[Denik](https://denik.me)** — AI landing page generator for businesses. Uses Claude Sonnet 4.6 for generation, Haiku 4.5 for refinement, DALL-E 3 for images, and Pexels for stock photos. Canvas editor with real-time streaming, semantic color themes, and one-click deploy.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — Free for personal, educational, and noncommercial use. Commercial use requires permission from [EasyBits](https://easybits.cloud).
