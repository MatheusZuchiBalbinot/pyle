import type { ReactNode } from 'react';

import { buildGatewayHarness, type GatewayHarness } from './gatewayHarness';
import { buildRealtimeHarness, type RealtimeHarness } from './realtimeHarness';

export type ConsoleHarness = GatewayHarness & {
	readonly emit: RealtimeHarness['emit'];
	readonly subscriberCount: RealtimeHarness['subscriberCount'];
	readonly events: RealtimeHarness['events'];
};

export function buildConsoleHarness(): ConsoleHarness {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return realtime.wrapper({ children: gateway.wrapper({ children }) });
	}

	return { ...gateway, wrapper, emit: realtime.emit, subscriberCount: realtime.subscriberCount, events: realtime.events };
}
