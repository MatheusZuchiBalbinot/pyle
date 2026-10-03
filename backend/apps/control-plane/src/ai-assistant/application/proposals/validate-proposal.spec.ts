import { describe, expect, it } from 'vitest';

import { buildService } from './proposal-fixtures.js';
import {
	checkAlertRule,
	checkChanged,
	checkChaos,
	checkDrain,
	checkEnable,
	checkOptionalRange,
	checkRange,
	checkStrategy,
	checkWeight,
	findInstance,
	RANGES,
} from './validate-proposal.js';

describe('checkRange', () => {
	it('accepts integers inside the range, bounds included', () => {
		expect(checkRange('weight', 1, RANGES.weight)).toBeNull();
		expect(checkRange('weight', 100, RANGES.weight)).toBeNull();
	});

	it.each([0, 101, 2.5])('refuses %s', (value) => {
		expect(checkRange('weight', value, RANGES.weight)).toBe('weight must be an integer between 1 and 100');
	});

	it('lets an absent optional value through', () => {
		expect(checkOptionalRange('timeoutMs', null, RANGES.routeTimeoutMs)).toBeNull();
		expect(checkOptionalRange('timeoutMs', 50, RANGES.routeTimeoutMs)).toContain('between 100 and 60000');
	});
});

describe('instance checks', () => {
	const service = buildService();
	const [enabled, drained] = service.instances;

	it('finds an instance by name, or lists the ones there are', () => {
		expect(findInstance(service, 'orders-1')).toBe(enabled);
		expect(findInstance(service, 'orders-9')).toBe('service orders has no instance "orders-9"; its instances are orders-1, orders-2');
	});

	it('drains only an enabled instance and enables only a drained one', () => {
		expect(checkDrain(enabled)).toBeNull();
		expect(checkDrain(drained)).toBe('instance orders-2 is already drained');
		expect(checkEnable(drained)).toBeNull();
		expect(checkEnable(enabled)).toBe('instance orders-1 is already enabled');
	});

	it('changes a weight only when it matters and differs', () => {
		expect(checkWeight(service, enabled, 80)).toBeNull();
		expect(checkWeight(service, enabled, 50)).toBe('instance orders-1 already has weight 50');
		expect(checkWeight(service, enabled, 0)).toContain('between 1 and 100');
		expect(checkWeight(buildService({ lbStrategy: 'round_robin' }), enabled, 80)).toBe(
			'weight only matters with weighted_random; service orders uses round_robin',
		);
	});
});

describe('service and value checks', () => {
	it('refuses the strategy already in use', () => {
		expect(checkStrategy(buildService(), 'least_connections')).toBeNull();
		expect(checkStrategy(buildService(), 'weighted_random')).toBe('service orders already uses weighted_random');
	});

	it('refuses a value that would not change', () => {
		expect(checkChanged('the timeout', 3000, 4000)).toBeNull();
		expect(checkChanged('the timeout', 3000, 3000)).toBe('the timeout is already 3000');
		expect(checkChanged('the limit', null, null)).toBe('the limit is already unset');
	});
});

describe('checkAlertRule', () => {
	const current = { isEnabled: true, threshold: 800, sustainedWindows: 3 };

	it('accepts a real change within bounds', () => {
		expect(checkAlertRule('route_p95_latency', current, { ...current, threshold: 1200 })).toBeNull();
		expect(
			checkAlertRule(
				'circuit_open',
				{ isEnabled: true, threshold: null, sustainedWindows: 1 },
				{ isEnabled: false, threshold: null, sustainedWindows: 1 },
			),
		).toBeNull();
	});

	it('wants a threshold exactly where the kind uses one', () => {
		expect(checkAlertRule('route_p95_latency', current, { ...current, threshold: null })).toBe('the route_p95_latency rule needs a threshold');
		expect(checkAlertRule('circuit_open', current, { ...current, threshold: 5 })).toBe('the circuit_open rule takes no threshold');
		expect(checkAlertRule('route_error_rate', current, { ...current, threshold: 101 })).toBe(
			'the route_error_rate threshold must be between 1 and 100',
		);
	});

	it('checks the sustained windows and refuses no change', () => {
		expect(checkAlertRule('route_p95_latency', current, { ...current, sustainedWindows: 31 })).toContain('sustainedWindows');
		expect(checkAlertRule('route_p95_latency', current, current)).toBe('the route_p95_latency rule already has these settings');
	});
});

describe('checkChaos', () => {
	const none = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };

	it('accepts faults within the demo limits', () => {
		expect(checkChaos({ ...none, latencyMs: 1500, errorRate: 0.3 })).toBeNull();
	});

	it.each([
		[{ latencyMs: 30_001 }, 'latencyMs'],
		[{ jitterMs: -1 }, 'jitterMs'],
		[{ errorRate: 1.5 }, 'errorRate'],
	])('refuses %o', (fault, field) => {
		expect(checkChaos({ ...none, ...fault })).toContain(field);
	});
});
