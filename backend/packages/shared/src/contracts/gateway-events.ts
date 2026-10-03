import {
	CONFIG_CHANGE_ACTION_NAMES,
	INSTANCE_STATE_KIND_NAMES,
	INSTANCE_STATE_NAMES,
	isOneOf,
	type ConfigChangeActionName,
	type InstanceStateKindName,
	type InstanceStateName,
} from './names.js';

// Parsed defensively: they cross a process boundary.
export type GatewayEvent =
	| { readonly type: 'traffic.flushed'; readonly gatewayId: string; readonly bucketStart: string; readonly routeIds: readonly string[] }
	| {
			readonly type: 'instance.state.changed';
			readonly gatewayId: string;
			readonly instanceId: string;
			readonly kind: InstanceStateKindName;
			readonly fromState: InstanceStateName;
			readonly toState: InstanceStateName;
			readonly reason: string;
			readonly occurredAt: string;
	  }
	| { readonly type: 'gateway.started'; readonly gatewayId: string; readonly occurredAt: string }
	| { readonly type: 'gateway.config.applied'; readonly gatewayId: string; readonly version: number; readonly occurredAt: string };

export const CONFIG_CHANGED_ENTITY_NAMES = ['service', 'instance', 'route', 'consumer', 'api_key'] as const;
export type ConfigChangedEntityName = (typeof CONFIG_CHANGED_ENTITY_NAMES)[number];

export type ConfigChangedMessage = {
	readonly entity: ConfigChangedEntityName;
	readonly id: string;
	readonly action: ConfigChangeActionName;
};

type UnknownRecord = Readonly<Record<string, unknown>>;

function parseJsonRecord(raw: string): UnknownRecord | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		const isRecord = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);

		if (!isRecord) {
			return null;
		}

		return parsed as UnknownRecord;
	} catch {
		// Garbage on a shared channel is reported by the caller (null), not thrown.
		return null;
	}
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(isString);
}

function parseTrafficFlushed(record: UnknownRecord): GatewayEvent | null {
	const { gatewayId, bucketStart, routeIds } = record;
	const isValid = isString(gatewayId) && isString(bucketStart) && isStringArray(routeIds);

	if (!isValid) {
		return null;
	}

	return { type: 'traffic.flushed', gatewayId, bucketStart, routeIds };
}

function parseInstanceStateChanged(record: UnknownRecord): GatewayEvent | null {
	const { gatewayId, instanceId, kind, fromState, toState, reason, occurredAt } = record;
	const hasValidStrings = isString(gatewayId) && isString(instanceId) && isString(reason) && isString(occurredAt);
	const hasValidStates =
		isOneOf(INSTANCE_STATE_KIND_NAMES, kind) && isOneOf(INSTANCE_STATE_NAMES, fromState) && isOneOf(INSTANCE_STATE_NAMES, toState);

	if (!hasValidStrings || !hasValidStates) {
		return null;
	}

	return { type: 'instance.state.changed', gatewayId, instanceId, kind, fromState, toState, reason, occurredAt };
}

function parseGatewayStarted(record: UnknownRecord): GatewayEvent | null {
	const { gatewayId, occurredAt } = record;

	if (!isString(gatewayId) || !isString(occurredAt)) {
		return null;
	}

	return { type: 'gateway.started', gatewayId, occurredAt };
}

function parseConfigApplied(record: UnknownRecord): GatewayEvent | null {
	const { gatewayId, version, occurredAt } = record;
	const isValid = isString(gatewayId) && typeof version === 'number' && isString(occurredAt);

	if (!isValid) {
		return null;
	}

	return { type: 'gateway.config.applied', gatewayId, version, occurredAt };
}

const GATEWAY_EVENT_PARSERS: Readonly<Record<GatewayEvent['type'], (record: UnknownRecord) => GatewayEvent | null>> = {
	'traffic.flushed': parseTrafficFlushed,
	'instance.state.changed': parseInstanceStateChanged,
	'gateway.started': parseGatewayStarted,
	'gateway.config.applied': parseConfigApplied,
};

// Null on invalid JSON, an unknown type or a malformed field.
export function parseGatewayEvent(raw: string): GatewayEvent | null {
	const record = parseJsonRecord(raw);

	if (!record) {
		return null;
	}

	const { type } = record;

	if (!isGatewayEventType(type)) {
		return null;
	}

	return GATEWAY_EVENT_PARSERS[type](record);
}

export function parseConfigChangedMessage(raw: string): ConfigChangedMessage | null {
	const record = parseJsonRecord(raw);

	if (!record) {
		return null;
	}

	const { entity, id, action } = record;
	const isValid = isOneOf(CONFIG_CHANGED_ENTITY_NAMES, entity) && isString(id) && isOneOf(CONFIG_CHANGE_ACTION_NAMES, action);

	if (!isValid) {
		return null;
	}

	return { entity, id, action };
}

function isGatewayEventType(value: unknown): value is GatewayEvent['type'] {
	return typeof value === 'string' && Object.hasOwn(GATEWAY_EVENT_PARSERS, value);
}
