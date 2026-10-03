export type AttemptOutcome =
	| { readonly kind: 'response'; readonly status: number }
	| { readonly kind: 'connection_error'; readonly errorCode: string }
	| { readonly kind: 'timeout' }
	// The client went away before the instance answered.
	| { readonly kind: 'aborted' };

export interface AttemptObserver {
	onAttemptStart(instanceId: string): void;
	onAttemptEnd(instanceId: string, outcome: AttemptOutcome): void;
}

export class NoopAttemptObserver implements AttemptObserver {
	onAttemptStart(): void {}

	onAttemptEnd(): void {}
}
