import { describe, expect, it } from 'vitest';

import { GATEWAY_PROPOSAL_TYPES, InvalidProposalError, parseGatewayProposal, type GatewayProposal } from './gateway-proposal.js';

const CHAOS = { latencyMs: 1200, jitterMs: 0, errorRate: 0, isDown: false };
const INSTANCE = { serviceSlug: 'orders', instanceId: 'i2', instanceName: 'orders-2' };

const VALID: readonly GatewayProposal[] = [
	{ type: 'drain_instance', ...INSTANCE, reason: 'r' },
	{ type: 'enable_instance', ...INSTANCE, reason: 'r' },
	{ type: 'set_instance_weight', ...INSTANCE, weight: 3, reason: 'r' },
	{ type: 'set_lb_strategy', serviceSlug: 'orders', strategy: 'least_connections', reason: 'r' },
	{ type: 'set_service_timeout', serviceSlug: 'orders', timeoutMs: 2000, reason: 'r' },
	{ type: 'set_service_retries', serviceSlug: 'orders', retryMaxAttempts: 3, reason: 'r' },
	{ type: 'set_route_timeout', routeId: 'r1', routeName: 'Pedidos', timeoutMs: null, reason: 'r' },
	{ type: 'set_route_rate_limit', routeId: 'r1', routeName: 'Pedidos', rateLimitPerMinute: 600, reason: 'r' },
	{ type: 'set_consumer_rate_limit', consumerSlug: 'web', consumerName: 'Web', rateLimitPerMinute: 100, reason: 'r' },
	{ type: 'revoke_api_key', consumerSlug: 'web', keyId: 'k1', keyPrefix: 'pyle_live_ab', reason: 'r' },
	{ type: 'create_consumer', slug: 'cli', name: 'CLI', rateLimitPerMinute: 60, reason: 'r' },
	{ type: 'create_route', name: 'V2', pathPrefix: '/api/v2', serviceSlug: 'orders', isAuthRequired: true, reason: 'r' },
	{ type: 'update_alert_rule', kind: 'route_p95_latency', isEnabled: true, threshold: 900, sustainedWindows: 3, reason: 'r' },
	{ type: 'generate_analysis', scope: 'route', subjectId: 'r1', subjectName: 'Pedidos', windowMinutes: 60, reason: 'r' },
	{ type: 'set_instance_chaos', ...INSTANCE, chaos: CHAOS, reason: 'r' },
	{ type: 'scale_service', serviceSlug: 'orders', serviceName: 'Pedidos', managedReplicas: 3, currentManagedReplicas: 1, reason: 'r' },
];

describe('parseGatewayProposal', () => {
	it('covers every type', () => {
		expect(VALID.map((proposal) => proposal.type)).toEqual(GATEWAY_PROPOSAL_TYPES);
	});

	it.each(VALID)('reads a valid $type', (proposal) => {
		expect(parseGatewayProposal({ ...proposal, extra: 'ignored' })).toEqual(proposal);
	});

	it('fills optional fields left out with null', () => {
		expect(parseGatewayProposal({ type: 'generate_analysis', scope: 'platform', reason: 'r' })).toEqual({
			type: 'generate_analysis',
			scope: 'platform',
			subjectId: null,
			subjectName: null,
			windowMinutes: null,
			reason: 'r',
		});
	});

	it.each([
		['not an object', 'x', 'not an object'],
		['no reason', { type: 'drain_instance', ...INSTANCE }, '"reason"'],
		['an unknown type', { type: 'reboot', reason: 'r' }, 'unknown "type"'],
		['an unknown strategy', { type: 'set_lb_strategy', serviceSlug: 'orders', strategy: 'fastest', reason: 'r' }, 'unknown "strategy"'],
		['a text number', { type: 'set_service_timeout', serviceSlug: 'orders', timeoutMs: '2000', reason: 'r' }, 'non-numeric'],
		['a missing number', { type: 'set_service_retries', serviceSlug: 'orders', reason: 'r' }, 'missing "retryMaxAttempts"'],
		['no chaos', { type: 'set_instance_chaos', ...INSTANCE, reason: 'r' }, 'missing "chaos"'],
		['a partial chaos', { type: 'set_instance_chaos', ...INSTANCE, chaos: { latencyMs: 1 }, reason: 'r' }, 'missing "jitterMs"'],
		[
			'a text flag',
			{ type: 'create_route', name: 'x', pathPrefix: '/x', serviceSlug: 'orders', isAuthRequired: 'yes', reason: 'r' },
			'boolean "isAuthRequired"',
		],
		['a numeric subject', { type: 'generate_analysis', scope: 'route', subjectId: 1, reason: 'r' }, 'non-string "subjectId"'],
	])('rejects %s', (_name, raw, message) => {
		expect(() => parseGatewayProposal(raw)).toThrow(InvalidProposalError);
		expect(() => parseGatewayProposal(raw)).toThrow(message);
	});
});
