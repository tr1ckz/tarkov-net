ARG GIT_SHA=local-dev

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG GIT_SHA
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ARG GIT_SHA
ENV NODE_ENV=production
ENV PORT=3000
ENV GIT_SHA=$GIT_SHA
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma /opt/prisma

# Verify schema is present at build time — fail loudly if not
RUN test -f /opt/prisma/schema.prisma || (echo "ERROR: /opt/prisma/schema.prisma missing from image" && exit 1)
RUN chmod +x /app/scripts/start-tarkovnet.sh

EXPOSE 3000
CMD ["sh", "/app/scripts/start-tarkovnet.sh"]
