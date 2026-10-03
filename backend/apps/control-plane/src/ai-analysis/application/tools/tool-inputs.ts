import { TRAFFIC_WINDOW_NAMES, type TrafficWindowName } from '../../../traffic/domain/traffic-window.js';
import { readNumberInput, readStringInput, type JsonSchemaProperty } from '../ai-tool.js';

type ToolInput = Readonly<Record<string, unknown>>;

const DEFAULT_TOOL_WINDOW: TrafficWindowName = '1h';

export const WINDOW_PROPERTY: JsonSchemaProperty = {
	type: 'string',
	enum: TRAFFIC_WINDOW_NAMES,
	description: 'Traffic window ending now; default 1h',
};

type IntegerBounds = { readonly min: number; readonly max: number; readonly fallback: number };

export function readWindow(input: ToolInput): TrafficWindowName {
	const window = readStringInput(input, 'window');

	if (window === undefined) {
		return DEFAULT_TOOL_WINDOW;
	}

	const known = TRAFFIC_WINDOW_NAMES.find((name) => name === window);

	if (!known) {
		throw new Error(`window must be one of ${TRAFFIC_WINDOW_NAMES.join(', ')}`);
	}

	return known;
}

export function readBoundedInteger(input: ToolInput, key: string, bounds: IntegerBounds): number {
	const value = readNumberInput(input, key);

	if (value === undefined) {
		return bounds.fallback;
	}

	const rounded = Math.round(value);

	if (rounded < bounds.min || rounded > bounds.max) {
		throw new Error(`${key} must be between ${bounds.min} and ${bounds.max}`);
	}

	return rounded;
}

export function readRequiredString(input: ToolInput, key: string): string {
	const value = readStringInput(input, key)?.trim();

	if (!value) {
		throw new Error(`${key} is required`);
	}

	return value;
}

export function readOptionalString(input: ToolInput, key: string): string | undefined {
	const value = readStringInput(input, key)?.trim();

	return value === '' ? undefined : value;
}

export function toJson(value: unknown): string {
	return JSON.stringify(value);
}

const PERCENT = 100;

export function toPercent(fraction: number): number {
	return Math.round(fraction * PERCENT * 100) / 100;
}
