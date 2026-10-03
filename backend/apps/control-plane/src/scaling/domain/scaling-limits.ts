// Managed replicas per service: enough to watch the balancer spread traffic,
// few enough that a laptop runs them.
export const MAX_MANAGED_REPLICAS = 10;

// The static demo instances use 48101-48122.
export const MANAGED_PORT_RANGE = { min: 48200, max: 48299 } as const;

// Time a draining instance gets to finish its in-flight requests before its
// container goes.
export const SCALE_DOWN_DRAIN_MS = 10_000;

// A new container must answer its health check within this, or it fails.
export const PROVISION_HEALTH_TIMEOUT_MS = 30_000;
