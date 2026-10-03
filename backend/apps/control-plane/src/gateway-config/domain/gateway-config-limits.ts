// Capped instead of paginated: these lists are read whole by the console and by every
// gateway reload.
export const MAX_SERVICES = 200;
export const MAX_INSTANCES_PER_SERVICE = 50;
export const MAX_ROUTES = 500;
export const MAX_ACTIVE_KEYS_PER_CONSUMER = 10;
// How long a revocation can be undone: the console offers it right after revoking. Past
// this, a key is gone for good and a new one has to be issued.
export const KEY_RESTORE_WINDOW_MS = 60_000;
