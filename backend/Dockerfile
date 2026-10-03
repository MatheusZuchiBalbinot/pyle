# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/control-plane/package.json ./apps/control-plane/
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared/package.json ./packages/shared/
# No postinstall here: the Prisma client is generated in the build stage.
RUN npm ci --ignore-scripts

# ---- build ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig*.json ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps ./apps
ENV CONTROL_PLANE_DATABASE_URL="postgresql://placeholder/placeholder"
RUN npx prisma generate --schema prisma/control-plane \
	&& npm run build

# ---- runtime ----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY scripts ./scripts
# Each workspace's dist, plus its sources: the load bot runs from source (tsx) and imports
# the seed client and the shared contracts.
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps

USER node
EXPOSE 3000
# Liveness only: an outage must not restart the container; load balancers use
# /health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/control-plane/dist/main.js"]
