import type { ScalingProfile } from '@prisma/control-plane-client';

// The demo-service's SERVICE_NAME each profile runs.
export const DEMO_SERVICE_NAME_BY_PROFILE: Readonly<Record<ScalingProfile, string>> = {
	demo_orders: 'orders',
	demo_users: 'users',
	demo_catalog: 'catalog',
};
