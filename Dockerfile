# syntax=docker/dockerfile:1

# Download Typst binary (parallel stage, avoids runner network issues)
FROM debian:bookworm-slim AS typst-dl
RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -fSL --retry 3 --retry-delay 2 -o /tmp/typst.tar.xz \
      https://github.com/typst/typst/releases/download/v0.14.0/typst-x86_64-unknown-linux-musl.tar.xz \
    && tar xJf /tmp/typst.tar.xz \
    && mv typst-x86_64-unknown-linux-musl/typst /typst \
    && /typst --version

# MuPDF's mutool, built from source (parallel stage, cached as a layer).
# compare_render needs per-character text with the Type 3 font OBJECT
# ("Type3 (8 0 R)") to read each font's real weight from its descriptor —
# Chrome names every weight of a variable font "Inter-Regular". Debian
# bookworm's mupdf-tools (1.21) prints "Unnamed-T3" instead, which silently
# disables the typography check. Third-party libs are bundled: the binary only
# links libc/libm. Bump version + sha256 together.
FROM debian:bookworm-slim AS mutool
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config curl ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*
ARG MUPDF_VERSION=1.28.5
ARG MUPDF_SHA256=98a5c10cda20c3992cdf76ff6b2a1149c32bd79cc796d3f703230b1185b7e934
RUN curl -fsSL --retry 3 --retry-delay 2 -o /tmp/mupdf.tgz \
      https://github.com/ArtifexSoftware/mupdf-downloads/releases/download/${MUPDF_VERSION}/mupdf-${MUPDF_VERSION}-source.tar.gz \
    && echo "${MUPDF_SHA256}  /tmp/mupdf.tgz" | sha256sum -c - \
    && tar -xzf /tmp/mupdf.tgz -C /tmp \
    && cd /tmp/mupdf-${MUPDF_VERSION}-source \
    && make -j"$(nproc)" HAVE_X11=no HAVE_GLUT=no HAVE_CURL=no HAVE_LEPTONICA=no HAVE_TESSERACT=no build=release tools \
    && install -m 755 build/release/mutool /usr/local/bin/mutool \
    && rm -rf /tmp/mupdf* \
    && mutool -v

# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# 1. Copy only dependency files first (cached layer). `patches/` DEBE llegar antes
#    de `npm ci` porque el postinstall (patch-package) se corre DURANTE npm ci y
#    necesita los .patch presentes (si no, los aplica sobre nada → dumps de libsignal
#    vuelven). Ver patches/libsignal+6.0.0.patch (silencia el volcado de sesión).
COPY package.json package-lock.json .npmrc ./
COPY patches ./patches
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
# BuildKit cache mount: persists Vite's transform cache across builds even though
# CACHEBUST invalidates this layer → warm incremental builds (faster than cold).
RUN --mount=type=cache,target=/app/node_modules/.vite npm run build

# 4. Prune dev dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Install Chromium for document screenshots (playwright-core) and
# poppler-utils (pdftoppm, pdffonts) for memory-bounded PDF rasterization.
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
COPY --from=mutool /usr/local/bin/mutool /usr/local/bin/mutool

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/app/content ./app/content
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
