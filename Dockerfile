# syntax=docker/dockerfile:1

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
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# 4. Prune dev dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Install Chromium for document screenshots (playwright-core)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    curl xz-utils \
    && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install Typst for fast PDF generation
RUN curl -sL https://github.com/typst/typst/releases/download/v0.14.0/typst-x86_64-unknown-linux-musl.tar.xz | tar xJ \
    && mv typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
    && rm -rf typst-x86_64-unknown-linux-musl \
    && typst --version

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/app/content ./app/content
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
