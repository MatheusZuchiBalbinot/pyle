#!/bin/sh
# Writes, from the container's environment, what depends on where this
# deployment's backend lives: the runtime configuration nginx serves at
# /config.js, and the security headers whose Content-Security-Policy must
# name the API and the realtime broker. One built image can then point at
# any backend — Vite's VITE_* variables are baked in at build time, which a
# deployable artifact cannot rely on.
set -eu

: "${ADMIN_API_BASE_URL:=http://localhost:3000}"
: "${REALTIME_PUBLIC_URL:=ws://localhost:48000}"

cat > /usr/share/nginx/html/config.js <<CONFIG
window.__PYLE_CONFIG__ = { adminApiBaseUrl: '${ADMIN_API_BASE_URL}' };
CONFIG

# Styles allow 'unsafe-inline' for the style attributes React sets (chart
# geometry, avatar hues); scripts do not — the bundle and config.js are
# both served from this origin.
CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${ADMIN_API_BASE_URL} ${REALTIME_PUBLIC_URL}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/security-headers.conf <<HEADERS
add_header Content-Security-Policy "${CSP}" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
HEADERS
