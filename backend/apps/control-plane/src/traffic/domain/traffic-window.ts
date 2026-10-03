import { ConfigValidationError } from '../../gateway-config/domain/config-errors.js';

export const TRAFFIC_WINDOW_NAMES = ['15m', '1h', '6h', '24h'] as const;
export type TrafficWindowName = (typeof TRAFFIC_WINDOW_NAMES)[number];

export const DEFAULT_TRAFFIC_WINDOW: TrafficWindowName = '1h';
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MAX_TRAFFIC_WINDOW_MS = 24 * MS_PER_HOUR;

const WINDOW_DURATION_MS: Readonly<Record<TrafficWindowName, number>> = {
	'15m': 15 * MS_PER_MINUTE,
	'1h': MS_PER_HOUR,
	'6h': 6 * MS_PER_HOUR,
	'24h': 24 * MS_PER_HOUR,
};

// Series step by window length: 10 s up to 15 min, 60 s up to 6 h, 300 s
// beyond.
const STEP_RULES: readonly { readonly maxDurationMs: number; readonly stepSeconds: number }[] = [
	{ maxDurationMs: 15 * MS_PER_MINUTE, stepSeconds: 10 },
	{ maxDurationMs: 6 * MS_PER_HOUR, stepSeconds: 60 },
	{ maxDurationMs: MAX_TRAFFIC_WINDOW_MS, stepSeconds: 300 },
];

export type TrafficWindowInput =
	{ readonly kind: 'named'; readonly window: TrafficWindowName } | { readonly kind: 'range'; readonly from: Date; readonly to: Date };

export type ResolvedTrafficWindow = {
	readonly from: Date;
	readonly to: Date;
	readonly stepSeconds: number;
};

type WindowLimits = {
	readonly nowMs: number;
	readonly retentionHours: number;
};

// At most 24 h and within retention; anything else is a 400.
export function resolveTrafficWindow(input: TrafficWindowInput, limits: WindowLimits): ResolvedTrafficWindow {
	const { from, to } = resolveRange(input, limits.nowMs);
	const durationMs = to.getTime() - from.getTime();

	if (durationMs <= 0) {
		throw new ConfigValidationError('"from" must be before "to"');
	}

	if (durationMs > MAX_TRAFFIC_WINDOW_MS) {
		throw new ConfigValidationError('A traffic window spans at most 24 hours');
	}

	const oldestKeptMs = limits.nowMs - limits.retentionHours * MS_PER_HOUR;

	if (from.getTime() < oldestKeptMs) {
		throw new ConfigValidationError(`Traffic is kept for ${limits.retentionHours} hours; "from" is older than that`);
	}

	const stepSeconds = stepSecondsFor(durationMs);

	return { from: alignDown(from, stepSeconds), to, stepSeconds };
}

function stepSecondsFor(durationMs: number): number {
	const rule = STEP_RULES.find((candidate) => durationMs <= candidate.maxDurationMs);

	return rule?.stepSeconds ?? STEP_RULES[STEP_RULES.length - 1].stepSeconds;
}

// The first step starts whole: a series point never covers half a step.
function alignDown(date: Date, stepSeconds: number): Date {
	const stepMs = stepSeconds * MS_PER_SECOND;

	return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

function resolveRange(input: TrafficWindowInput, nowMs: number): { readonly from: Date; readonly to: Date } {
	if (input.kind === 'range') {
		return input;
	}

	return { from: new Date(nowMs - WINDOW_DURATION_MS[input.window]), to: new Date(nowMs) };
}
