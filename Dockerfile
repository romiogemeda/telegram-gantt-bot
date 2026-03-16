# ============================================================================
# Dockerfile – Telegram Gantt Bot (Single Container Deployment)
# ============================================================================
# Builds both the Node.js backend and the React Mini App frontend,
# then serves everything from a single container (ADR-001, ADR-002).
# ============================================================================

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Stage 2: Generate Prisma client ────────────────────────────────────────
FROM deps AS prisma
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# ── Stage 3: Build backend ─────────────────────────────────────────────────
FROM prisma AS build-backend
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Stage 4: Build frontend (Mini App) ────────────────────────────────────
FROM deps AS build-frontend
COPY webapp ./webapp
RUN cd webapp && npx vite build

# ── Stage 5: Production image ─────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build-backend /app/dist ./dist
COPY --from=build-frontend /app/webapp/dist ./webapp/dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma ./

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/app.js"]