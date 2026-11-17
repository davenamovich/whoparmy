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
RUN bun ./node_modules/prisma/build/index.js generate || bunx prisma generate
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
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
# SQLite lives on a Railway volume mounted at /data (DATABASE_URL=file:/data/custom.db).
# Boot: (1) apply prisma/schema.sql through bun:sqlite — needs no Prisma engine
# binary, so tables get created even if the image's engines are missing;
# (2) prisma db push as a best-effort step for additive schema changes;
# (3) start the server no matter what the first two printed.
CMD ["sh", "-c", "mkdir -p /data; echo '[boot] apply-schema:'; bun scripts/apply-schema.ts; echo '[boot] prisma db push (best effort):'; timeout 60 bun ./node_modules/prisma/build/index.js db push --skip-generate || true; echo '[boot] starting server'; bun server.js"]
