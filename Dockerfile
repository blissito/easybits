# Build stage
FROM node:20-alpine AS builder

# Instalar dependencias de build
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copiar archivos necesarios y hacer build
COPY . .
# Generar Prisma en la etapa de build
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copiar solo los archivos necesarios
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Limpiar caché de npm
RUN npm cache clean --force

# Configurar variables de entorno
ENV NODE_ENV=production

CMD ["npm", "run", "start"]