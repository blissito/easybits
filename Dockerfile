# Build stage
FROM node:20-alpine AS builder

# Instalar dependencias de build
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copiar archivos necesarios y hacer build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copiar solo los archivos necesarios
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Generar Prisma en la imagen final
COPY prisma ./prisma
RUN npx prisma generate

# Limpiar caché de npm
RUN npm cache clean --force

# Configurar variables de entorno
ENV NODE_ENV=production

CMD ["npm", "run", "start"]