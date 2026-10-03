import { describe, expect, it } from 'vitest';

import {
	evaluateAlertRules,
	windowsNeeded,
	type AlertEvaluationInput,
	type AlertRules,
	type OpenAlert,
	type RouteWindow,
} from './evaluate-alert-rules.js';

const RULES: AlertRules = {
	route_p95_latency: { isEnabled: true, threshold: 800, sustainedWindows: 3 },
	route_error_rate: { isEnabled: true, threshold: 5, sustainedWindows: 2 },
	instance_unhealthy: { isEnabled: true, threshold: null, sustainedWindows: 1 },
	circuit_open: { isEnabled: true, threshold: null, sustainedWindows: 1 },
};

function window(p95Ms: number | null, errorRatePercent = 0, requestCount = 100): RouteWindow {
	return { requestCount, p95Ms, errorRatePercent };
}

function input(overrides: Partial<AlertEvaluationInput>): AlertEvaluationInput {
	return { rules: RULES, routes: [], instances: [], openAlerts: [], ...overrides };
}

function route(windows: readonly RouteWindow[]) {
	return { routeId: 'r1', routeName: 'Pedidos', windows };
}

const OPEN_P95: OpenAlert = { id: 'a1', kind: 'route_p95_latency', subjectType: 'route', subjectId: 'r1' };
const OPEN_UNHEALTHY: OpenAlert = { id: 'a2', kind: 'instance_unhealthy', subjectType: 'instance', subjectId: 'i1' };
const OPEN_CIRCUIT: OpenAlert = { id: 'a3', kind: 'circuit_open', subjectType: 'instance', subjectId: 'i1' };

describe('evaluateAlertRules: routes', () => {
	it('opens when every sustained window breaches, with the newest value', () => {
		const result = evaluateAlertRules(input({ routes: [route([window(100), window(900), window(1000), window(1200)])] }));

		expect(result.toOpen).toEqual([
			{
				kind: 'route_p95_latency',
				severity: 'warning',
				subjectType: 'route',
				subjectId: 'r1',
				subjectName: 'Pedidos',
				message: 'p95 latency 1200 ms for 3 consecutive windows (limit 800 ms)',
			},
		]);
	});

	it.each([
		{ name: 'one window below the limit', windows: [window(900), window(700), window(1000)] },
		{ name: 'a window without traffic', windows: [window(900), null, window(1000)] },
		{ name: 'fewer windows than required', windows: [window(900), window(1000)] },
		{ name: 'no latency figure', windows: [window(900), window(900), window(null)] },
	])('does not open with $name', ({ windows }) => {
		expect(evaluateAlertRules(input({ routes: [route(windows)] })).toOpen).toEqual([]);
	});

	it('is critical past twice the limit', () => {
		const result = evaluateAlertRules(input({ routes: [route([window(1700), window(1700), window(1700)])] }));

		expect(result.toOpen[0].severity).toBe('critical');
	});

	it('does not open twice, resolves when the newest window recovers, and waits through silence', () => {
		const stillBad = evaluateAlertRules(input({ routes: [route([window(900), window(900), window(900)])], openAlerts: [OPEN_P95] }));
		const quiet = evaluateAlertRules(input({ routes: [route([window(900), window(900), null])], openAlerts: [OPEN_P95] }));
		const recovered = evaluateAlertRules(input({ routes: [route([window(900), window(900), window(200)])], openAlerts: [OPEN_P95] }));

		expect(stillBad).toEqual({ toOpen: [], toResolve: [] });
		expect(quiet).toEqual({ toOpen: [], toResolve: [] });
		expect(recovered.toResolve).toEqual([OPEN_P95]);
	});

	it('opens on the error rate, which ignores windows without requests', () => {
		const breaching = evaluateAlertRules(input({ routes: [route([window(10, 12), window(10, 20)])] }));
		const empty = evaluateAlertRules(input({ routes: [route([window(10, 12), window(null, 0, 0)])] }));

		expect(breaching.toOpen).toEqual([
			expect.objectContaining({
				kind: 'route_error_rate',
				severity: 'critical',
				message: '20.0% of requests failed with 5xx for 2 consecutive windows (limit 5%)',
			}),
		]);
		expect(empty.toOpen).toEqual([]);
	});

	it('resolves every open alert of a disabled rule, or of a route that is gone', () => {
		const disabled = { ...RULES, route_p95_latency: { ...RULES.route_p95_latency, isEnabled: false } };

		expect(
			evaluateAlertRules(input({ rules: disabled, routes: [route([window(900), window(900), window(900)])], openAlerts: [OPEN_P95] })).toResolve,
		).toEqual([OPEN_P95]);
		expect(evaluateAlertRules(input({ openAlerts: [OPEN_P95] })).toResolve).toEqual([OPEN_P95]);
	});

	it('needs as many windows as the longest rule asks for', () => {
		expect(windowsNeeded(RULES)).toBe(3);
	});
});

describe('evaluateAlertRules: instances', () => {
	const instance = { instanceId: 'i1', instanceName: 'orders/orders-1' };

	it('opens from the live state it missed events for', () => {
		const result = evaluateAlertRules(input({ instances: [{ ...instance, health: 'unhealthy', circuit: 'open' }] }));

		expect(result.toOpen).toEqual([
			expect.objectContaining({
				kind: 'instance_unhealthy',
				severity: 'critical',
				subjectType: 'instance',
				subjectId: 'i1',
				message: 'Instance orders/orders-1 is failing its health checks',
			}),
			expect.objectContaining({ kind: 'circuit_open', severity: 'warning' }),
		]);
	});

	it('resolves once the instance is fine again, and not while its state is unknown', () => {
		const fine = evaluateAlertRules(
			input({ instances: [{ ...instance, health: 'healthy', circuit: 'closed' }], openAlerts: [OPEN_UNHEALTHY, OPEN_CIRCUIT] }),
		);
		const unknown = evaluateAlertRules(
			input({ instances: [{ ...instance, health: 'unknown', circuit: null }], openAlerts: [OPEN_UNHEALTHY, OPEN_CIRCUIT] }),
		);
		const halfOpen = evaluateAlertRules(input({ instances: [{ ...instance, health: null, circuit: 'half_open' }], openAlerts: [OPEN_CIRCUIT] }));

		expect(fine.toResolve).toEqual([OPEN_UNHEALTHY, OPEN_CIRCUIT]);
		expect(unknown.toResolve).toEqual([]);
		expect(halfOpen.toResolve).toEqual([]);
	});

	it('resolves alerts of removed instances and of disabled rules', () => {
		const disabled = { ...RULES, circuit_open: { ...RULES.circuit_open, isEnabled: false } };

		expect(evaluateAlertRules(input({ openAlerts: [OPEN_UNHEALTHY] })).toResolve).toEqual([OPEN_UNHEALTHY]);
		expect(
			evaluateAlertRules(input({ rules: disabled, instances: [{ ...instance, health: 'healthy', circuit: 'open' }], openAlerts: [OPEN_CIRCUIT] }))
				.toResolve,
		).toEqual([OPEN_CIRCUIT]);
	});
});
