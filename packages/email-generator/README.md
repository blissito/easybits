# @easybits.cloud/email-generator

Turn [EasyBits](https://easybits.cloud) document sections into **email-safe HTML** — inline
styles, no Tailwind classes, no `<script>`, wrapped in a centered table shell. Built for
Gmail / Outlook.

It consumes the same `Section3[]` the document editor
([`@easybits.cloud/html-tailwind-generator/document`](https://www.npmjs.com/package/@easybits.cloud/html-tailwind-generator))
produces — so "edit a document → send it as an email" is one call.

## Install

```bash
npm install @easybits.cloud/email-generator
# peer (only needed for the Section3 type): @easybits.cloud/html-tailwind-generator >= 0.3.0
```

## Usage (server-side)

```ts
import { buildEmailHtml } from "@easybits.cloud/email-generator";
import { buildSingleThemeCss } from "@easybits.cloud/html-tailwind-generator";

const { css: themeCss } = buildSingleThemeCss("minimal"); // or your custom :root vars

const html = await buildEmailHtml(sections, {
  title: "Tu reporte mensual",
  themeCss,            // literal --color-* values → drives semantic classes + var() flattening
  maxWidth: 600,       // classic safe email width
  preheader: "Resumen de mayo — ábrelo para ver los números.",
});

// → complete inlined HTML; hand it to your mailer (Resend, SES, Nodemailer, …)
```

`buildEmailHtml` is **async** (it runs a Tailwind/PostCSS pass).

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `"Documento"` | `<title>` text |
| `themeCss` | neutral light theme | `:root { --color-*: <hex> }` with literal values. Both compiles semantic color classes (`bg-primary`, `text-on-surface`…) and flattens `var()` to hex. |
| `maxWidth` | `600` | Email body max width (px) |
| `preheader` | — | Hidden inbox-preview snippet |
| `backgroundColor` | `"#f4f4f4"` | Page background behind the centered card |

## How it works

1. Assemble section HTML in flow order (scripts stripped).
2. Compile the Tailwind utilities the sections use into real CSS.
3. Flatten `var(--color-*)` to literal hex (Outlook has no CSS custom properties).
4. Inline every rule onto `style=` attributes with [`juice`](https://github.com/Automattic/juice).
5. Wrap in a centered table shell.

## Caveats (best-effort)

Email clients ignore `position:absolute`, CSS grid, and most flexbox. Documents authored with
**absolute cover layouts degrade** — compose email content in flow (stacked blocks). Fixed pixel
widths wider than `maxWidth` overflow on mobile. This is an accepted limitation: faithful
pixel-fidelity in Outlook is a different (much larger) effort.

## License

PolyForm Noncommercial 1.0.0
