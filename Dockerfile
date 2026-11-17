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
ENV HOSTNAME=0.0.0.0
# Railway provides PORT; the standalone server binds 0.0.0.0 by default in prod.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
# SQLite lives on a Railway volume mounted at /data (DATABASE_URL=file:/data/custom.db).
# First boot creates the schema; later boots are no-ops. The push is time-boxed and
# uses the local Prisma binary so a slow registry can never block the server start.
CMD ["sh", "-c", "mkdir -p /data && (timeout 60 ./node_modules/.bin/prisma db push --skip-generate || true) && bun server.js"]
