# Dockerfile - Production Multi-Stage Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Production Stage
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Security hardening
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser && \
    mkdir -p /home/pptruser/Downloads && \
    chown -R pptruser:pptruser /home/pptruser && \
    chown -R pptruser:pptruser /app

COPY --from=builder --chown=pptruser:pptruser /app/dist ./dist
COPY --from=builder --chown=pptruser:pptruser /app/package*.json ./
COPY --from=builder --chown=pptruser:pptruser /app/prisma ./prisma

USER pptruser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/server.js"]