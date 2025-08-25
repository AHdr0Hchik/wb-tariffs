# --- build stage ---
FROM node:20-slim AS builder
ENV NODE_ENV=development
# Чуть больше памяти для tsc, чтобы избежать OOM на slim-образе
ENV NODE_OPTIONS=--max-old-space-size=1536

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm i --no-audit --no-fund

COPY src ./src

# Собираем TS -> dist
RUN npm run build

# Переносим миграции в dist, чтобы рантайм видел их в прод-образе
RUN mkdir -p dist/db && cp -r src/db/migrations dist/db/migrations || true

# --- runtime stage ---
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

CMD ["node", "dist/app.js"]