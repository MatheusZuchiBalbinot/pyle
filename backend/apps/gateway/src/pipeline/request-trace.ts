import type { GatewayErrorCode } from '@pyle/shared/contracts/gateway-error.js';

import type { CompletedRequest } from '../contracts/request-observer.js';

// Status recorded for a client that went away before its response
// finished (nginx's convention); counted as a 4xx.
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

type TraceStart = { readonly requestId: string; readonly startedAtMs: number; readonly method: string; readonly path: string };

type RouteFacts = { readonly routeId: string; readonly routeName: string };
type ConsumerFacts = { readonly consumerId: string; readonly consumerSlug: string };
type InstanceFacts = { readonly instanceId: string; readonly instanceName: string };

export class RequestTrace {
	private route: RouteFacts | null = null;
	private consumer: ConsumerFacts | null = null;
	private instance: InstanceFacts | null = null;
	private attempts = 0;
	private gatewayError: GatewayErrorCode | null = null;

	constructor(private readonly start: TraceStart) {}

	recordRoute(route: RouteFacts): void {
		this.route = route;
	}

	recordConsumer(consumer: ConsumerFacts): void {
		this.consumer = consumer;
	}

	recordAttempts(attempts: number, instance: InstanceFacts | null): void {
		this.attempts = attempts;
		this.instance = instance;
	}

	recordGatewayError(code: GatewayErrorCode): void {
		this.gatewayError = code;
	}

	complete(status: number, finishedAtMs: number): CompletedRequest {
		return {
			...this.start,
			finishedAtMs,
			routeId: this.route?.routeId ?? null,
			routeName: this.route?.routeName ?? null,
			consumerId: this.consumer?.consumerId ?? null,
			consumerSlug: this.consumer?.consumerSlug ?? null,
			instanceId: this.instance?.instanceId ?? null,
			instanceName: this.instance?.instanceName ?? null,
			status,
			attempts: this.attempts,
			gatewayError: this.gatewayError,
		};
	}
}
