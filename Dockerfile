# --- build stage ---
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm i

COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./


CMD ["node", "dist/app.js"]