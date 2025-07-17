# Blog Assets Directory

This directory contains static assets (images, videos, documents) referenced by blog posts.

## Structure

```
assets/
├── README.md
├── crear-assets-exitosos.jpg
├── marketing-creadores.jpg
├── monetizar-conocimiento.jpg
├── tendencias-2025.jpg
├── herramientas-creadores.jpg
└── test-image.jpg
```

## Usage

Reference assets in MDX files using the path `/blog/assets/filename.ext`:

```markdown
---
featuredImage: "/blog/assets/example-image.jpg"
---

![Alt text](/blog/assets/example-image.jpg)
```

## Guidelines

- Use descriptive filenames
- Optimize images for web (WebP preferred)
- Keep file sizes reasonable (<500KB for images)
- Use consistent naming conventions (kebab-case)
