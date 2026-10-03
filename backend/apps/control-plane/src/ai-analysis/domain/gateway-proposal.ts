import type { AiAnalysisScope } from '@prisma/control-plane-client';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import { LOAD_BALANCING_STRATEGY_NAMES, type LoadBalancingStrategyName } from '@pyle/shared/contracts/config-snapshot.js';
import { GATEWAY_ALERT_KIND_NAMES, isOneOf, type GatewayAlertKindName } from '@pyle/shared/contracts/names.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';

import { ANALYSIS_SCOPES } from './analysis-scope.js';

// Confirmed by the operator, then run through the ordinary admin endpoint. Serves assistant
// proposals and suggested actions alike. Mirrored in the frontend's adminApiTypes.ts.
export type GatewayProposal =
	| {
			readonly type: 'drain_instance';
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly reason: string;
	  }
	| {
			readonly type: 'enable_instance';
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly reason: string;
	  }
	| {
			readonly type: 'set_instance_weight';
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly weight: number;
			readonly reason: string;
	  }
	| { readonly type: 'set_lb_strategy'; readonly serviceSlug: string; readonly strategy: LoadBalancingStrategyName; readonly reason: string }
	| { readonly type: 'set_service_timeout'; readonly serviceSlug: string; readonly timeoutMs: number; readonly reason: string }
	| { readonly type: 'set_service_retries'; readonly serviceSlug: string; readonly retryMaxAttempts: number; readonly reason: string }
	| {
			readonly type: 'set_route_timeout';
			readonly routeId: string;
			readonly routeName: string;
			readonly timeoutMs: number | null;
			readonly reason: string;
	  }
	| {
			readonly type: 'set_route_rate_limit';
			readonly routeId: string;
			readonly routeName: string;
			readonly rateLimitPerMinute: number | null;
			readonly reason: string;
	  }
	| {
			readonly type: 'set_consumer_rate_limit';
			readonly consumerSlug: string;
			readonly consumerName: string;
			readonly rateLimitPerMinute: number;
			readonly reason: string;
	  }
	| { readonly type: 'revoke_api_key'; readonly consumerSlug: string; readonly keyId: string; readonly keyPrefix: string; readonly reason: string }
	| { readonly type: 'create_consumer'; readonly slug: string; readonly name: string; readonly rateLimitPerMinute: number; readonly reason: string }
	| {
			readonly type: 'create_route';
			readonly name: string;
			readonly pathPrefix: string;
			readonly serviceSlug: string;
			readonly isAuthRequired: boolean;
			readonly reason: string;
	  }
	| {
			readonly type: 'update_alert_rule';
			readonly kind: GatewayAlertKindName;
			readonly isEnabled: boolean;
			readonly threshold: number | null;
			readonly sustainedWindows: number;
			readonly reason: string;
	  }
	| {
			readonly type: 'generate_analysis';
			readonly scope: AiAnalysisScope;
			readonly subjectId: string | null;
			readonly subjectName: string | null;
			readonly windowMinutes: number | null;
			readonly reason: string;
	  }
	| {
			readonly type: 'set_instance_chaos';
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly chaos: ChaosState;
			readonly reason: string;
	  }
	| {
			readonly type: 'scale_service';
			readonly serviceSlug: string;
			readonly serviceName: string;
			readonly managedReplicas: number;
			// The count when proposed: fewer is destructive (the console asks
			// for the slug to be typed).
			readonly currentManagedReplicas: number;
			readonly reason: string;
	  };

type GatewayProposalType = GatewayProposal['type'];

export const GATEWAY_PROPOSAL_TYPES: readonly GatewayProposalType[] = [
	'drain_instance',
	'enable_instance',
	'set_instance_weight',
	'set_lb_strategy',
	'set_service_timeout',
	'set_service_retries',
	'set_route_timeout',
	'set_route_rate_limit',
	'set_consumer_rate_limit',
	'revoke_api_key',
	'create_consumer',
	'create_route',
	'update_alert_rule',
	'generate_analysis',
	'set_instance_chaos',
	'scale_service',
];

type RawRecord = Readonly<Record<string, unknown>>;

export class InvalidProposalError extends Error {}

// A proposal becomes a button, so a malformed one is rejected here, not when pressed.
export function parseGatewayProposal(raw: unknown): GatewayProposal {
	if (!isRecord(raw)) {
		throw new InvalidProposalError('Proposal is not an object');
	}

	const reason = text(raw, 'reason');
	const type = oneOf(raw, 'type', GATEWAY_PROPOSAL_TYPES);

	return parseTyped(type, raw, reason);
}

function isRecord(value: unknown): value is RawRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(raw: RawRecord, key: string): string {
	const value = raw[key];
	const isValid = typeof value === 'string' && value.trim().length > 0;

	if (!isValid) {
		throw new InvalidProposalError(`Proposal is missing a non-empty "${key}"`);
	}

	return value;
}

function optionalText(raw: RawRecord, key: string): string | null {
	const value = raw[key];

	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'string') {
		throw new InvalidProposalError(`Proposal has a non-string "${key}"`);
	}

	return value;
}

function optionalNumber(raw: RawRecord, key: string): number | null {
	const value = raw[key];

	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new InvalidProposalError(`Proposal has a non-numeric "${key}"`);
	}

	return value;
}

function number(raw: RawRecord, key: string): number {
	const value = optionalNumber(raw, key);

	if (value === null) {
		throw new InvalidProposalError(`Proposal is missing "${key}"`);
	}

	return value;
}

function flag(raw: RawRecord, key: string): boolean {
	const value = raw[key];

	if (typeof value !== 'boolean') {
		throw new InvalidProposalError(`Proposal is missing a boolean "${key}"`);
	}

	return value;
}

function oneOf<T extends string>(raw: RawRecord, key: string, values: readonly T[]): T {
	const value = raw[key];

	if (!isOneOf(values, value)) {
		throw new InvalidProposalError(`Proposal has an unknown "${key}": ${String(value)}`);
	}

	return value;
}

function chaosOf(raw: RawRecord): ChaosState {
	const chaos = raw.chaos;

	if (!isRecord(chaos)) {
		throw new InvalidProposalError('Proposal is missing "chaos"');
	}

	return {
		latencyMs: number(chaos, 'latencyMs'),
		jitterMs: number(chaos, 'jitterMs'),
		errorRate: number(chaos, 'errorRate'),
		isDown: flag(chaos, 'isDown'),
	};
}

function instanceTarget(raw: RawRecord): { readonly serviceSlug: string; readonly instanceId: string; readonly instanceName: string } {
	return { serviceSlug: text(raw, 'serviceSlug'), instanceId: text(raw, 'instanceId'), instanceName: text(raw, 'instanceName') };
}

function parseTyped(type: GatewayProposalType, raw: RawRecord, reason: string): GatewayProposal {
	switch (type) {
		case 'drain_instance':
		case 'enable_instance':
			return { type, ...instanceTarget(raw), reason };
		case 'set_instance_weight':
			return { type, ...instanceTarget(raw), weight: number(raw, 'weight'), reason };
		case 'set_lb_strategy':
			return { type, serviceSlug: text(raw, 'serviceSlug'), strategy: oneOf(raw, 'strategy', LOAD_BALANCING_STRATEGY_NAMES), reason };
		case 'set_service_timeout':
			return { type, serviceSlug: text(raw, 'serviceSlug'), timeoutMs: number(raw, 'timeoutMs'), reason };
		case 'set_service_retries':
			return { type, serviceSlug: text(raw, 'serviceSlug'), retryMaxAttempts: number(raw, 'retryMaxAttempts'), reason };
		case 'set_route_timeout':
			return { type, routeId: text(raw, 'routeId'), routeName: text(raw, 'routeName'), timeoutMs: optionalNumber(raw, 'timeoutMs'), reason };
		case 'set_route_rate_limit':
			return {
				type,
				routeId: text(raw, 'routeId'),
				routeName: text(raw, 'routeName'),
				rateLimitPerMinute: optionalNumber(raw, 'rateLimitPerMinute'),
				reason,
			};
		case 'set_consumer_rate_limit':
			return {
				type,
				consumerSlug: text(raw, 'consumerSlug'),
				consumerName: text(raw, 'consumerName'),
				rateLimitPerMinute: number(raw, 'rateLimitPerMinute'),
				reason,
			};
		case 'revoke_api_key':
			return { type, consumerSlug: text(raw, 'consumerSlug'), keyId: text(raw, 'keyId'), keyPrefix: text(raw, 'keyPrefix'), reason };
		case 'create_consumer':
			return { type, slug: text(raw, 'slug'), name: text(raw, 'name'), rateLimitPerMinute: number(raw, 'rateLimitPerMinute'), reason };
		case 'create_route':
			return {
				type,
				name: text(raw, 'name'),
				pathPrefix: text(raw, 'pathPrefix'),
				serviceSlug: text(raw, 'serviceSlug'),
				isAuthRequired: flag(raw, 'isAuthRequired'),
				reason,
			};
		case 'update_alert_rule':
			return {
				type,
				kind: oneOf(raw, 'kind', GATEWAY_ALERT_KIND_NAMES),
				isEnabled: flag(raw, 'isEnabled'),
				threshold: optionalNumber(raw, 'threshold'),
				sustainedWindows: number(raw, 'sustainedWindows'),
				reason,
			};
		case 'generate_analysis':
			return {
				type,
				scope: oneOf(raw, 'scope', ANALYSIS_SCOPES),
				subjectId: optionalText(raw, 'subjectId'),
				subjectName: optionalText(raw, 'subjectName'),
				windowMinutes: optionalNumber(raw, 'windowMinutes'),
				reason,
			};
		case 'set_instance_chaos':
			return { type, ...instanceTarget(raw), chaos: chaosOf(raw), reason };
		case 'scale_service':
			return {
				type,
				serviceSlug: text(raw, 'serviceSlug'),
				serviceName: text(raw, 'serviceName'),
				managedReplicas: number(raw, 'managedReplicas'),
				currentManagedReplicas: number(raw, 'currentManagedReplicas'),
				reason,
			};
		default:
			return assertUnreachable(type);
	}
}
