export type ProbeResult = {
	readonly isSuccess: boolean;
	readonly latencyMs: number;
	// "HTTP 503", "ECONNREFUSED", "timeout": what the log and the state
	// change reason say.
	readonly detail: string;
};
