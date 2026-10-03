import type { GatewayErrorCode } from '@pyle/shared/contracts/gateway-error.js';

export type CompletedRequest = {
	readonly requestId: string;
	readonly startedAtMs: number;
	readonly finishedAtMs: number;
	readonly method: string;
	// Without the query string.
	readonly path: string;
	readonly routeId: string | null;
	readonly routeName: string | null;
	readonly consumerId: string | null;
	readonly consumerSlug: string | null;
	// The instance that produced the final response.
	readonly instanceId: string | null;
	readonly instanceName: string | null;
	readonly status: number;
	readonly attempts: number;
	readonly gatewayError: GatewayErrorCode | null;
};

// Called once per request when it ends; must never throw or block.
export interface RequestObserver {
	onRequestCompleted(request: CompletedRequest): void;
}

export class NoopRequestObserver implements RequestObserver {
	onRequestCompleted(): void {}
}

// Several observers behind one: each is isolated, so one throwing does not
// starve the others (or the response).
export function composeRequestObservers(observers: readonly RequestObserver[], onError: (error: unknown) => void): RequestObserver {
	return {
		onRequestCompleted(request: CompletedRequest): void {
			for (const observer of observers) {
				try {
					observer.onRequestCompleted(request);
				} catch (error) {
					onError(error);
				}
			}
		},
	};
}
