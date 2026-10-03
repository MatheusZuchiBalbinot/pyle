import { Injectable } from '@nestjs/common';

import { getTrafficRetentionHours } from '../../config/traffic.js';
import { ConsumersService } from '../../gateway-config/application/consumers.service.js';
import { RoutesService } from '../../gateway-config/application/routes.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { groupByKey, sumCounts, toSeries, toTotals, windowSeconds } from '../domain/summarize-samples.js';
import type {
	ConsumerRouteUsageDto,
	ConsumerTrafficDto,
	InstanceTrafficDto,
	RouteTrafficDto,
	RouteTrafficSummaryDto,
	ServiceTrafficDto,
	StatusBreakdownDto,
	TopConsumerDto,
	TrafficOverviewDto,
} from '../domain/traffic-responses.js';
import type { SampleCounts, SampleRow, TrafficWindowRange } from '../domain/traffic-types.js';
import { resolveTrafficWindow, type ResolvedTrafficWindow, type TrafficWindowInput } from '../domain/traffic-window.js';
import { TrafficNamesRepository } from '../infrastructure/traffic-names.repository.js';
import { TrafficSampleRepository } from '../infrastructure/traffic-sample.repository.js';

const TOP_CONSUMER_COUNT = 10;

type KnownInstance = { readonly id: string; readonly name: string };

type InstanceBreakdownInput = {
	readonly rows: readonly SampleRow[];
	// Listed even without traffic (the service's current instances).
	readonly current: readonly KnownInstance[];
	readonly window: ResolvedTrafficWindow;
	readonly totalCount: number;
};

// Aggregated in Postgres; percentiles always come from summed histograms.
@Injectable()
export class TrafficQueryService {
	constructor(
		private readonly samples: TrafficSampleRepository,
		private readonly names: TrafficNamesRepository,
		private readonly routes: RoutesService,
		private readonly services: ServicesService,
		private readonly consumers: ConsumersService,
	) {}

	resolveWindow(input: TrafficWindowInput): ResolvedTrafficWindow {
		return resolveTrafficWindow(input, { nowMs: Date.now(), retentionHours: getTrafficRetentionHours() });
	}

	async overview(input: TrafficWindowInput): Promise<TrafficOverviewDto> {
		const window = this.resolveWindow(input);
		const range = { from: window.from, to: window.to };
		const [allRows, routeRows, consumerRows] = await Promise.all([
			this.samples.aggregateInstanceSamples({ ...range, stepSeconds: window.stepSeconds, groupBy: null }),
			this.samples.aggregateInstanceSamples({ ...range, stepSeconds: window.stepSeconds, groupBy: 'route' }),
			this.samples.aggregateConsumerSamples({ ...range, stepSeconds: null, groupBy: 'consumer' }),
		]);
		const [routes, topConsumers] = await Promise.all([this.routeSummaries(routeRows, window), this.topConsumers(consumerRows)]);
		const totals = toTotals(sumCounts(allRows), windowSeconds(window));

		return { window: toWindowRange(window), totals, series: toSeries(allRows, window), routes, topConsumers };
	}

	async route(routeId: string, input: TrafficWindowInput): Promise<RouteTrafficDto> {
		const route = await this.routes.get(routeId);
		const window = this.resolveWindow(input);
		const [rows, service] = await Promise.all([
			this.samples.aggregateInstanceSamples({ from: window.from, to: window.to, stepSeconds: window.stepSeconds, groupBy: 'instance', routeId }),
			this.services.get(route.service.slug),
		]);
		const counts = sumCounts(rows);
		const breakdown: InstanceBreakdownInput = { rows, current: service.instances, window, totalCount: counts.requestCount };
		const instances = await this.instanceBreakdown(breakdown);
		const totals = toTotals(counts, windowSeconds(window));

		return { route, window: toWindowRange(window), totals, series: toSeries(rows, window), instances, statusBreakdown: toStatusBreakdown(counts) };
	}

	async service(slug: string, input: TrafficWindowInput): Promise<ServiceTrafficDto> {
		const service = await this.services.get(slug);
		const window = this.resolveWindow(input);
		const instanceIds = await this.names.instanceIdsOfService(service.id);
		const rows = await this.samples.aggregateInstanceSamples({
			from: window.from,
			to: window.to,
			stepSeconds: window.stepSeconds,
			groupBy: 'instance',
			instanceIds,
		});
		const counts = sumCounts(rows);
		const breakdown: InstanceBreakdownInput = { rows, current: service.instances, window, totalCount: counts.requestCount };
		const instances = await this.instanceBreakdown(breakdown);

		return { service, window: toWindowRange(window), totals: toTotals(counts, windowSeconds(window)), series: toSeries(rows, window), instances };
	}

	async consumer(slug: string, input: TrafficWindowInput): Promise<ConsumerTrafficDto> {
		const consumer = await this.consumers.get(slug);
		const window = this.resolveWindow(input);
		const range = { from: window.from, to: window.to, consumerId: consumer.id };
		const [rows, routeRows] = await Promise.all([
			this.samples.aggregateConsumerSamples({ ...range, stepSeconds: window.stepSeconds, groupBy: null }),
			this.samples.aggregateConsumerSamples({ ...range, stepSeconds: null, groupBy: 'route' }),
		]);
		const routes = await this.consumerRoutes(routeRows);
		const totals = toTotals(sumCounts(rows), windowSeconds(window));

		return { consumer, window: toWindowRange(window), totals, series: toSeries(rows, window), routes };
	}

	// Requests that matched no route are left out of the per-route list
	// (they still count in the totals).
	private async routeSummaries(rows: readonly SampleRow[], window: ResolvedTrafficWindow): Promise<readonly RouteTrafficSummaryDto[]> {
		const groups = groupByKey(rows);
		const routeIds = [...groups.keys()].filter((key): key is string => key !== null);
		const names = await this.names.routes(routeIds);
		const summaries = routeIds.flatMap((routeId) => {
			const name = names.get(routeId);

			if (!name) {
				return [];
			}

			const routeRows = groups.get(routeId) ?? [];
			const totals = toTotals(sumCounts(routeRows), windowSeconds(window));

			return [{ routeId, name: name.name, pathPrefix: name.pathPrefix, totals, series: toSeries(routeRows, window) }];
		});

		return summaries.sort((left, right) => byRequestCountDescending(left.totals, right.totals));
	}

	private async topConsumers(rows: readonly SampleRow[]): Promise<readonly TopConsumerDto[]> {
		const top = [...rows].sort(byRequestCountDescending).slice(0, TOP_CONSUMER_COUNT);
		const consumerIds = top.flatMap((row) => (row.key === null ? [] : [row.key]));
		const names = await this.names.consumers(consumerIds);

		return top.map((row) => {
			const name = row.key === null ? undefined : names.get(row.key);

			return {
				consumerId: row.key,
				slug: name?.slug ?? null,
				name: name?.name ?? null,
				requestCount: row.requestCount,
				rateLimitedCount: row.rateLimitedCount,
			};
		});
	}

	private async consumerRoutes(rows: readonly SampleRow[]): Promise<readonly ConsumerRouteUsageDto[]> {
		const routeIds = rows.flatMap((row) => (row.key === null ? [] : [row.key]));
		const names = await this.names.routes(routeIds);
		const usage = rows.map((row) => {
			const name = row.key === null ? null : (names.get(row.key)?.name ?? null);

			return { routeId: row.key, name, requestCount: row.requestCount, rateLimitedCount: row.rateLimitedCount };
		});

		return usage.sort(byRequestCountDescending);
	}

	// The service's current instances plus any removed one that still has
	// traffic in the window. Requests rejected before an instance was
	// chosen (no key) belong to no instance.
	private async instanceBreakdown(input: InstanceBreakdownInput): Promise<readonly InstanceTrafficDto[]> {
		const groups = groupByKey(input.rows);
		const currentIds = new Set(input.current.map((instance) => instance.id));
		const removedIds = [...groups.keys()].filter((key): key is string => key !== null && !currentIds.has(key));
		const removedNames = await this.names.instances(removedIds);
		const removed = removedIds.flatMap((id) => {
			const name = removedNames.get(id);

			return name ? [{ id, name: name.name }] : [];
		});
		const instances = [...input.current, ...removed].map((instance) => {
			const rows = groups.get(instance.id) ?? [];
			const counts = sumCounts(rows);
			const totals = toTotals(counts, windowSeconds(input.window));

			return {
				instanceId: instance.id,
				name: instance.name,
				totals,
				series: toSeries(rows, input.window),
				share: share(counts.requestCount, input.totalCount),
			};
		});

		return instances.sort((left, right) => byRequestCountDescending(left.totals, right.totals));
	}
}

function toWindowRange(window: ResolvedTrafficWindow): TrafficWindowRange {
	return { from: window.from.toISOString(), to: window.to.toISOString(), stepSeconds: window.stepSeconds };
}

function toStatusBreakdown(counts: SampleCounts): StatusBreakdownDto {
	return {
		status2xx: counts.status2xx,
		status3xx: counts.status3xx,
		status4xx: counts.status4xx,
		status5xx: counts.status5xx,
		rateLimited: counts.rateLimitedCount,
		gatewayErrors: counts.gatewayErrorCount,
	};
}

function byRequestCountDescending(left: { readonly requestCount: number }, right: { readonly requestCount: number }): number {
	return right.requestCount - left.requestCount;
}

function share(part: number, total: number): number {
	if (total === 0) {
		return 0;
	}

	return part / total;
}
