import { describe, expect, it } from 'vitest';

import type { InstanceRuntimeState, InstanceStateSource } from '../contracts/instance-state-source.js';
import type { CompletedRequest } from '../contracts/request-observer.js';
import { RouteTable } from '../routing/route-table.js';
import { buildInstance, buildTestSnapshot } from '../testing/build-test-snapshot.js';
import { GatewayMetrics, type GatewayMetricsSources } from './gateway-metrics.js';

const STARTED_AT_MS = 1_000_000;

function request(overrides: Partial<CompletedRequest> = {}): CompletedRequest {
	return {
		requestId: 'r',
		startedAtMs: 0,
		finishedAtMs: 20,
		method: 'GET',
		path: '/api/orders',
		routeId: 'route-orders',
		routeName: 'Pedidos',
		consumerId: null,
		consumerSlug: null,
		instanceId: 'id-orders-1',
		instanceName: 'orders-1',
		status: 200,
		attempts: 1,
		gatewayError: null,
		...overrides,
	};
}

function sourceOf(states: readonly InstanceRuntimeState[]): InstanceStateSource {
	return { list: () => states, onChange: () => () => undefined };
}

function state(instanceId: string, overrides: Partial<InstanceRuntimeState> = {}): InstanceRuntimeState {
	return {
		instanceId,
		health: 'healthy',
		circuit: 'closed',
		inFlight: 0,
		consecutiveFailures: 0,
		lastCheckAt: null,
		lastCheckLatencyMs: null,
		...overrides,
	};
}

function build(sources: Partial<GatewayMetricsSources> = {}): GatewayMetrics {
	const defaults: GatewayMetricsSources = {
		gatewayId: 'gw-1',
		startedAtMs: STARTED_AT_MS,
		now: () => STARTED_AT_MS + 90_500,
		configVersion: () => 7,
		isRateLimitDegraded: () => false,
		instanceStates: () => sourceOf([]),
	};

	return new GatewayMetrics({ ...defaults, ...sources });
}

function samples(metrics: GatewayMetrics): readonly string[] {
	return metrics
		.render()
		.split('\n')
		.filter((line) => line !== '' && !line.startsWith('#'));
}

describe('GatewayMetrics', () => {
	it('counts requests by route and status class, cumulatively', () => {
		const metrics = build();

		metrics.onRequestCompleted(request());
		metrics.onRequestCompleted(request());
		metrics.onRequestCompleted(request({ status: 503, gatewayError: 'no_healthy_instance' }));
		metrics.onRequestCompleted(request({ routeId: null, routeName: null, status: 404, gatewayError: 'route_not_found' }));

		expect(samples(metrics)).toEqual(
			expect.arrayContaining([
				'pyle_gateway_requests_total{route="Pedidos",status_class="2xx"} 2',
				'pyle_gateway_requests_total{route="Pedidos",status_class="5xx"} 1',
				'pyle_gateway_requests_total{route="(none)",status_class="4xx"} 1',
				'pyle_gateway_errors_total{code="no_healthy_instance"} 1',
				'pyle_gateway_errors_total{code="route_not_found"} 1',
			]),
		);
	});

	it('keeps a cumulative latency histogram per route, in seconds', () => {
		const metrics = build();

		metrics.onRequestCompleted(request({ finishedAtMs: 8 }));
		metrics.onRequestCompleted(request({ finishedAtMs: 40 }));
		metrics.onRequestCompleted(request({ finishedAtMs: 20_000 }));

		const lines = samples(metrics).filter((line) => line.startsWith('pyle_gateway_request_duration_seconds'));

		expect(lines).toEqual(
			expect.arrayContaining([
				'pyle_gateway_request_duration_seconds_bucket{route="Pedidos",le="0.005"} 0',
				'pyle_gateway_request_duration_seconds_bucket{route="Pedidos",le="0.01"} 1',
				'pyle_gateway_request_duration_seconds_bucket{route="Pedidos",le="0.05"} 2',
				'pyle_gateway_request_duration_seconds_bucket{route="Pedidos",le="10"} 2',
				'pyle_gateway_request_duration_seconds_bucket{route="Pedidos",le="+Inf"} 3',
				'pyle_gateway_request_duration_seconds_sum{route="Pedidos"} 20.048',
				'pyle_gateway_request_duration_seconds_count{route="Pedidos"} 3',
			]),
		);
	});

	it('counts the extra attempts of retried requests', () => {
		const metrics = build();

		metrics.onRequestCompleted(request({ attempts: 3 }));
		metrics.onRequestCompleted(request({ attempts: 1 }));

		expect(samples(metrics)).toContain('pyle_gateway_retries_total{route="Pedidos"} 2');
	});

	it('escapes label values the format would otherwise break on', () => {
		const metrics = build();

		metrics.onRequestCompleted(request({ routeName: 'a "quoted" \\ name\nnext' }));

		expect(samples(metrics)).toContain('pyle_gateway_requests_total{route="a \\"quoted\\" \\\\ name\\nnext",status_class="2xx"} 1');
	});

	it('reports instance state under service and instance names, leaving out what the configuration no longer has', () => {
		const states = [
			state('id-orders-1'),
			state('id-orders-2', { health: 'unhealthy', circuit: 'open', inFlight: 3 }),
			state('id-orders-3', { health: 'unknown' }),
			state('id-removed'),
		];
		const metrics = build({ instanceStates: () => sourceOf(states) });
		const instances = ['orders-1', 'orders-2', 'orders-3'].map((name) => buildInstance(name));

		metrics.onConfigApplied(new RouteTable(buildTestSnapshot({ instances })));

		const lines = samples(metrics);

		expect(lines).toEqual(
			expect.arrayContaining([
				'pyle_gateway_instance_healthy{service="orders",instance="orders-1"} 1',
				'pyle_gateway_instance_healthy{service="orders",instance="orders-2"} 0',
				'pyle_gateway_instance_circuit_state{service="orders",instance="orders-2",state="open"} 1',
				'pyle_gateway_instance_circuit_state{service="orders",instance="orders-2",state="closed"} 0',
				'pyle_gateway_instance_in_flight{service="orders",instance="orders-2"} 3',
			]),
		);
		expect(lines.some((line) => line.includes('instance="orders-3"') && line.startsWith('pyle_gateway_instance_healthy'))).toBe(false);
		expect(lines.some((line) => line.includes('id-removed'))).toBe(false);
	});

	it('reports the process: configuration version, rate limit fallback and uptime', () => {
		const metrics = build({ isRateLimitDegraded: () => true });

		expect(samples(metrics)).toEqual(
			expect.arrayContaining([
				'pyle_gateway_config_version{gateway="gw-1"} 7',
				'pyle_gateway_rate_limit_degraded{gateway="gw-1"} 1',
				'pyle_gateway_uptime_seconds{gateway="gw-1"} 90',
			]),
		);
	});

	it('leaves the configuration version out before the first load, and declares every metric it may emit', () => {
		const metrics = build({ configVersion: () => null });

		const rendered = metrics.render();

		expect(rendered).not.toContain('pyle_gateway_config_version{');
		expect(rendered).toContain('# TYPE pyle_gateway_request_duration_seconds histogram');
		expect(rendered).toContain('# TYPE pyle_gateway_requests_total counter');
		expect(rendered.endsWith('\n')).toBe(true);
	});
});
