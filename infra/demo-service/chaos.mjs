// Faults injected from the console (PUT /__chaos), for showing the gateway
// eject an instance, open its circuit or retry elsewhere.
export const NO_CHAOS = Object.freeze({ latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false });

const MAX_LATENCY_MS = 30_000;
const MAX_JITTER_MS = 10_000;

function isIntegerIn(value, max) {
	return Number.isInteger(value) && value >= 0 && value <= max;
}

// Null when the body is not a valid chaos state.
export function parseChaos(body) {
	if (typeof body !== 'object' || body === null) return null;
	const { latencyMs, jitterMs, errorRate, isDown } = body;
	const isValid =
		isIntegerIn(latencyMs, MAX_LATENCY_MS) &&
		isIntegerIn(jitterMs, MAX_JITTER_MS) &&
		typeof errorRate === 'number' &&
		errorRate >= 0 &&
		errorRate <= 1 &&
		typeof isDown === 'boolean';
	if (!isValid) return null;
	return { latencyMs, jitterMs, errorRate, isDown };
}

export function extraDelayMs(chaos, random) {
	return chaos.latencyMs + Math.round(random() * chaos.jitterMs);
}

export function shouldFail(chaos, random) {
	return chaos.errorRate > 0 && random() < chaos.errorRate;
}
