# Whoparmy — Railway deployment (Bun + Next.js standalone + Prisma/SQLite)
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx prisma generate
RUN bun run build

# Runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Railway provides PORT; the standalone server binds 0.0.0.0 by default in prod.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# SQLite lives on a Railway volume mounted at /data (DATABASE_URL=file:/data/custom.db).
# First boot creates the schema; later boots are no-ops.
CMD ["sh", "-c", "mkdir -p /data && (bunx prisma db push --skip-generate --accept-data-loss || true) && bun server.js"]
