# EasyBits

Agentic-first file storage — AI agents store, manage, and consume files via SDK, MCP, and REST API.

[easybits.cloud](https://www.easybits.cloud)

## MCP Server

```bash
npx -y @easybits.cloud/mcp
```

30+ tools for uploading, transforming, optimizing and serving files — images, documents, websites, presentations, landing pages and more.

## SDK

```bash
npm install @easybits.cloud/sdk
```

## AI Landing Generator

```bash
npm install @easybits.cloud/html-tailwind-generator
```

AI-powered landing page generator with Tailwind CSS — canvas editor, streaming generation (Claude), image enrichment (DALL-E / Pexels), one-click deploy. [README →](./packages/html-tailwind-generator/README.md)

```typescript
import { EasyBits } from "@easybits.cloud/sdk";
const eb = new EasyBits({ apiKey: "eb_..." });
const file = await eb.files.upload({ name: "photo.jpg", contentType: "image/jpeg" });
```

## Features

- **File management** — upload, transform, optimize, soft-delete with trash retention
- **Websites** — deploy static sites to `slug.easybits.cloud` with custom domains
- **Presentations** — AI-generated reveal.js slides with 3D scenes, deploy to subdomain
- **Landing pages v2** — AI-generated block-based pages with streaming SSE, stock photos, visual variants
- **Landing pages v3** — free-form HTML canvas editor, Sonnet generation, Haiku refine, semantic color themes, code editor. **Production-ready**, exported as [`@easybits.cloud/html-tailwind-generator`](https://www.npmjs.com/package/@easybits.cloud/html-tailwind-generator) npm package — used by [Denik](https://denik.me)
- **Webhooks** — real-time event notifications with HMAC signatures
- **IAM** — scoped API keys (READ, WRITE, DELETE, ADMIN), file-level sharing

## Stack

React Router v7 · Prisma (MongoDB) · Stripe · Fly.io

## Getting started

```bash
npx prisma generate
npm run dev
```

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck   # TypeScript check
npm test           # vitest
npm run e2e        # Playwright e2e tests
```

## Authors

Built by [Bliss](https://github.com/blissito) & [Brenda](https://github.com/BrendaOrtega) at [fixter.org](https://fixter.org)
