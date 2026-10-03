import type { GatewayStatus } from '@/app/api/adminApiTypes';

type Gateway = GatewayStatus['gateways'][number];

// A gateway picks a change up in about a second (pyle:gw:config-changed).
const APPLY_GRACE_MS = 2000;

// The config version is the newest change's time. A heartbeat sent before it (they come every
// 5 s) cannot know about it yet, so only a heartbeat sent well after the change and still on an
// older version means the gateway is behind.
export function isGatewayBehind(gateway: Gateway, currentVersion: number): boolean {
	const isOlderVersion = gateway.configVersion < currentVersion;
	const hasReportedSinceChange = Date.parse(gateway.updatedAt) - currentVersion > APPLY_GRACE_MS;

	return isOlderVersion && hasReportedSinceChange;
}
