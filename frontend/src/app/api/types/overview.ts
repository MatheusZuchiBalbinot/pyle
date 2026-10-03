import type { ConfigChangeEvent } from './activity';
import type { GatewayAlert } from './alerts';
import type { SystemHealthComponentStatus } from './platform';
import type { Service } from './services';
import type { GatewayStatus, TrafficOverview } from './traffic';

export type AdminOverview = {
	readonly generatedAt: string;
	readonly systemHealth: readonly SystemHealthComponentStatus[];
	readonly gateway: GatewayStatus;
	// 1 h window.
	readonly traffic: TrafficOverview;
	// With live instance state.
	readonly services: readonly Service[];
	readonly openAlerts: readonly GatewayAlert[];
	// Last 20.
	readonly recentChanges: readonly ConfigChangeEvent[];
};
