# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 1. Copy only dependency files first (cached layer)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# 2. Copy prisma schema and generate (cached if schema unchanged)
COPY prisma ./prisma
RUN npx prisma generate

# 3. Copy source and build (only this runs on code changes)
COPY . .
RUN npm run build

# 4. Prune dev dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
