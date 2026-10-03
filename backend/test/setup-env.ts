import '@pyle/shared/config/load-backend-env.js';

// A test app must never create or remove real containers on the developer's
// Docker (the dev server's reconciler owns those). The scaling e2e turns it
// back on for itself.
process.env.SCALING_ALLOWED = 'false';
