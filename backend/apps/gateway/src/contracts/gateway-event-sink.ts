import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';

// Fire and forget: never throws.
export interface GatewayEventSink {
	emit(event: GatewayEvent): void;
}

export class NoopGatewayEventSink implements GatewayEventSink {
	emit(): void {}
}
