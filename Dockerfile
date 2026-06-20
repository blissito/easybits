# syntax=docker/dockerfile:1

# Download Typst binary (parallel stage, avoids runner network issues)
FROM debian:bookworm-slim AS typst-dl
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -fSL --retry 3 --retry-delay 2 -o /tmp/typst.tar.xz \
      https://github.com/typst/typst/releases/download/v0.14.0/typst-x86_64-unknown-linux-musl.tar.xz \
    && tar xJf /tmp/typst.tar.xz \
    && mv typst-x86_64-unknown-linux-musl/typst /typst \
    && /typst --version

# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# 1. Copy only dependency files first (cached layer)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# 2. Copy prisma schema and generate (cached if schema unchanged)
COPY prisma ./prisma
RUN npx prisma generate

# 3. Copy source and build (only this runs on code changes)
# CACHEBUST = git SHA (pasado por CI). Cambia en cada push → invalida esta capa
# y el build de abajo SIEMPRE corre fresco, evitando que el gha cache sirva un
# binario viejo (causaba que call_create "desapareciera" tras un deploy del CI).
# npm ci / prisma generate quedan ARRIBA de este ARG → siguen cacheados.
ARG CACHEBUST=0
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# 4. Prune dev dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Install Chromium for document screenshots (playwright-core) and
# poppler-utils (pdftoppm) for memory-bounded PDF rasterization.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    poppler-utils \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    curl \
    && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install Typst binary (downloaded in builder stage to avoid runner network issues)
COPY --from=typst-dl /typst /usr/local/bin/typst

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/app/content ./app/content
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
