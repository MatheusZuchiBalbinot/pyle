import { TRAFFIC_LATENCY_BUCKET_BOUNDS_MS } from '@pyle/shared/contracts/latency-histogram.js';

import type { InstanceStateSource } from '../contracts/instance-state-source.js';
import type { CompletedRequest, RequestObserver } from '../contracts/request-observer.js';
import type { RouteTable } from '../routing/route-table.js';

// The gateway's own numbers in the Prometheus text format, on the admin port's
// /metrics. Counters are cumulative since the process started, as Prometheus
// expects; series are keyed by route name, status class, error code and
// instance, all bounded by the configuration, not by the traffic.

export type GatewayMetricsSources = {
	readonly gatewayId: string;
	readonly startedAtMs: number;
	readonly now: () => number;
	readonly configVersion: () => number | null;
	readonly isRateLimitDegraded: () => boolean;
	readonly instanceStates: () => InstanceStateSource;
};

type Labels = Readonly<Record<string, string>>;
type LatencySeries = { readonly buckets: number[]; sumMs: number; count: number };
type InstanceLabels = { readonly service: string; readonly instance: string };

const MS_PER_SECOND = 1000;
const STATUS_CLASS_SIZE = 100;
const NO_ROUTE_LABEL = '(none)';
const OTHER_STATUS_CLASS = 'other';
const KNOWN_STATUS_CLASSES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);
const CIRCUIT_STATES = ['closed', 'open', 'half_open'] as const;

function statusClassLabel(status: number): string {
	const statusClass = Math.floor(status / STATUS_CLASS_SIZE);

	return KNOWN_STATUS_CLASSES.has(statusClass) ? `${statusClass}xx` : OTHER_STATUS_CLASS;
}

// Backslash, double quote and newline are the only escapes the format has.
function escapeLabelValue(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatLabels(labels: Labels): string {
	const pairs = Object.entries(labels).map(([name, value]) => `${name}="${escapeLabelValue(value)}"`);

	return pairs.length === 0 ? '' : `{${pairs.join(',')}}`;
}

function sample(name: string, labels: Labels, value: number): string {
	return `${name}${formatLabels(labels)} ${value}`;
}

function header(name: string, type: 'counter' | 'gauge' | 'histogram', help: string): readonly string[] {
	return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
}

// "route\u0000status" back into its labels: a Map key cannot be an object by value.
const KEY_SEPARATOR = '\u0000';

class CounterMap {
	private readonly counts = new Map<string, number>();

	add(key: string, amount: number): void {
		this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
	}

	entries(): readonly (readonly [string, number])[] {
		return [...this.counts];
	}
}

export class GatewayMetrics implements RequestObserver {
	private readonly requests = new CounterMap();
	private readonly retries = new CounterMap();
	private readonly gatewayErrors = new CounterMap();
	private readonly latencyByRoute = new Map<string, LatencySeries>();
	private instanceLabels = new Map<string, InstanceLabels>();

	constructor(private readonly sources: GatewayMetricsSources) {}

	onRequestCompleted(request: CompletedRequest): void {
		const route = request.routeName ?? NO_ROUTE_LABEL;

		this.requests.add(`${route}${KEY_SEPARATOR}${statusClassLabel(request.status)}`, 1);
		const extraAttempts = request.attempts - 1;

		if (extraAttempts > 0) {
			this.retries.add(route, extraAttempts);
		}

		if (request.gatewayError !== null) {
			this.gatewayErrors.add(request.gatewayError, 1);
		}

		this.observeLatency(route, request.finishedAtMs - request.startedAtMs);
	}

	// Instance ids become service and instance names, as the configuration has them now.
	onConfigApplied(table: RouteTable): void {
		const entries = table.snapshot.services.flatMap((service) =>
			service.instances.map((instance): [string, InstanceLabels] => [instance.id, { service: service.slug, instance: instance.name }]),
		);

		this.instanceLabels = new Map(entries);
	}

	render(): string {
		const lines = [
			...this.renderRequests(),
			...this.renderLatency(),
			...this.renderRetries(),
			...this.renderGatewayErrors(),
			...this.renderInstances(),
			...this.renderProcess(),
		];

		return `${lines.join('\n')}\n`;
	}

	private observeLatency(route: string, durationMs: number): void {
		const series = this.latencyByRoute.get(route) ?? { buckets: TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.map(() => 0), sumMs: 0, count: 0 };

		TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.forEach((boundMs, index) => {
			if (durationMs <= boundMs) {
				series.buckets[index]++;
			}
		});
		series.sumMs += durationMs;
		series.count++;
		this.latencyByRoute.set(route, series);
	}

	private renderRequests(): readonly string[] {
		const name = 'pyle_gateway_requests_total';
		const samples = this.requests.entries().map(([key, count]) => {
			const [route, statusClass] = key.split(KEY_SEPARATOR);

			return sample(name, { route, status_class: statusClass }, count);
		});

		return [...header(name, 'counter', 'Requests answered, by route and status class.'), ...samples];
	}

	private renderLatency(): readonly string[] {
		const name = 'pyle_gateway_request_duration_seconds';
		const samples = [...this.latencyByRoute].flatMap(([route, series]) => [
			...TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.map((boundMs, index) =>
				sample(`${name}_bucket`, { route, le: String(toSeconds(boundMs)) }, series.buckets[index]),
			),
			sample(`${name}_bucket`, { route, le: '+Inf' }, series.count),
			sample(`${name}_sum`, { route }, toSeconds(series.sumMs)),
			sample(`${name}_count`, { route }, series.count),
		]);

		return [...header(name, 'histogram', 'End-to-end time through the gateway, retries included.'), ...samples];
	}

	private renderRetries(): readonly string[] {
		const name = 'pyle_gateway_retries_total';
		const samples = this.retries.entries().map(([route, count]) => sample(name, { route }, count));

		return [...header(name, 'counter', 'Extra upstream attempts after a failed one, by route.'), ...samples];
	}

	private renderGatewayErrors(): readonly string[] {
		const name = 'pyle_gateway_errors_total';
		const samples = this.gatewayErrors.entries().map(([code, count]) => sample(name, { code }, count));

		return [...header(name, 'counter', 'Responses the gateway made itself (no route, no key, rate limited, no instance...), by code.'), ...samples];
	}

	// States of instances the configuration no longer has are left out.
	private renderInstances(): readonly string[] {
		const states = this.sources
			.instanceStates()
			.list()
			.flatMap((state) => {
				const labels = this.instanceLabels.get(state.instanceId);

				return labels === undefined ? [] : [{ state, labels }];
			});
		const healthy = states
			.filter(({ state }) => state.health !== 'unknown')
			.map(({ state, labels }) => sample('pyle_gateway_instance_healthy', labels, state.health === 'healthy' ? 1 : 0));
		const circuits = states.flatMap(({ state, labels }) =>
			CIRCUIT_STATES.map((circuit) =>
				sample('pyle_gateway_instance_circuit_state', { ...labels, state: circuit }, state.circuit === circuit ? 1 : 0),
			),
		);
		const inFlight = states.map(({ state, labels }) => sample('pyle_gateway_instance_in_flight', labels, state.inFlight));

		return [
			...header('pyle_gateway_instance_healthy', 'gauge', 'Active health check verdict: 1 healthy, 0 unhealthy (absent until the first check).'),
			...healthy,
			...header('pyle_gateway_instance_circuit_state', 'gauge', 'Circuit breaker state, one series per state set to 1.'),
			...circuits,
			...header('pyle_gateway_instance_in_flight', 'gauge', 'Requests this gateway has open against the instance.'),
			...inFlight,
		];
	}

	private renderProcess(): readonly string[] {
		const gateway = { gateway: this.sources.gatewayId };
		const version = this.sources.configVersion();
		const uptimeSeconds = Math.floor(toSeconds(this.sources.now() - this.sources.startedAtMs));

		return [
			...header('pyle_gateway_config_version', 'gauge', 'Version of the configuration being served (absent before the first load).'),
			...(version === null ? [] : [sample('pyle_gateway_config_version', gateway, version)]),
			...header('pyle_gateway_rate_limit_degraded', 'gauge', '1 while rate limits fail open because Redis is unreachable.'),
			sample('pyle_gateway_rate_limit_degraded', gateway, this.sources.isRateLimitDegraded() ? 1 : 0),
			...header('pyle_gateway_uptime_seconds', 'gauge', 'Seconds since this gateway process started.'),
			sample('pyle_gateway_uptime_seconds', gateway, uptimeSeconds),
		];
	}
}

function toSeconds(ms: number): number {
	return ms / MS_PER_SECOND;
}
