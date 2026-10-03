// Stands for a missing route, instance or consumer in keys.
const NONE_KEY = 'none';

type SampleKeyInput = {
	readonly gatewayId: string;
	readonly bucketStartMs: number;
	readonly routeId: string | null;
	// The instance (route × instance samples) or the consumer (route ×
	// consumer samples).
	readonly dimensionId: string | null;
};

// Unique per sample row: flushing the same bucket twice (a retried flush)
// writes nothing new.
export function flushKey(input: SampleKeyInput): string {
	return `${input.gatewayId}:${input.bucketStartMs}:${input.routeId ?? NONE_KEY}:${input.dimensionId ?? NONE_KEY}`;
}

export function dimensionKey(routeId: string | null, dimensionId: string | null): string {
	return `${routeId ?? NONE_KEY}|${dimensionId ?? NONE_KEY}`;
}
