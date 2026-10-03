# syntax=docker/dockerfile:1

# ---- build ------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time. The API base URL is the
# only one left (the admin token is gone — operators log in), and it is
# deliberately *not* baked in: the runtime config below wins, so one image
# can serve any deployment.
RUN npm run build

# ---- runtime ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Rewrites /config.js on every start, so the same image can point at a
# different API without a rebuild.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-write-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-runtime-config.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
