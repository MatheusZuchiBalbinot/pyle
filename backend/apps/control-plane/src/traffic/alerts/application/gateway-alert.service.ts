import { Injectable, Logger } from '@nestjs/common';
import type { GatewayAlert } from '@prisma/control-plane-client';

import { percentileFromHistogram, toBucketStart, TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';
import type { InstanceStateKindName, InstanceStateName } from '@pyle/shared/contracts/names.js';

import type { Page, PageRequest } from '../../../common/pagination.js';
import { InstanceLiveStateReader } from '../../../gateway-config/infrastructure/instance-live-state.reader.js';
import { RouteRepository } from '../../../gateway-config/infrastructure/route.repository.js';
import { ServiceRepository } from '../../../gateway-config/infrastructure/service.repository.js';
import { RealtimePublisherService } from '../../../realtime/application/realtime-publisher.service.js';
import { groupByKey, sumCounts } from '../../domain/summarize-samples.js';
import type { SampleRow } from '../../domain/traffic-types.js';
import {
	instanceDisplayName,
	TrafficNamesRepository,
	type InstanceName,
	type RouteName,
	type ServiceName,
} from '../../infrastructure/traffic-names.repository.js';
import { TrafficSampleRepository } from '../../infrastructure/traffic-sample.repository.js';
import {
	evaluateAlertRules,
	INSTANCE_ALERT_MESSAGES,
	INSTANCE_ALERT_SEVERITY,
	windowsNeeded,
	type AlertToOpen,
	type InstanceAlertKind,
	type InstanceAlertSubject,
	type OpenAlert,
	type RouteAlertSubject,
	type RouteWindow,
} from '../domain/evaluate-alert-rules.js';
import { GatewayAlertRepository } from '../infrastructure/gateway-alert.repository.js';
import { toGatewayAlertDto, type GatewayAlertDto } from '../interface/dto/gateway-alert.dto.js';
import { AlertRuleConfigService } from './alert-rule-config.service.js';

// A bucket is judged once its gateways have flushed it: its end, plus the
// flush grace, plus the write.
export const EVALUATION_LAG_MS = 3000;
const P95 = 0.95;
const PERCENT = 100;
const UNKNOWN_SUBJECT_NAME = '(removed)';

const ALERT_KIND_BY_STATE_KIND: Readonly<Record<InstanceStateKindName, InstanceAlertKind>> = {
	health: 'instance_unhealthy',
	circuit: 'circuit_open',
};

export type InstanceStateChange = {
	readonly instanceId: string;
	readonly instanceName: string;
	readonly kind: InstanceStateKindName;
	readonly toState: InstanceStateName;
	readonly reason: string;
};

type EvaluationResult = {
	readonly openedCount: number;
	readonly resolvedCount: number;
};

// Opening is idempotent (one open alert per kind and subject, enforced by the database), so
// concurrent evaluators never duplicate.
@Injectable()
export class GatewayAlertService {
	private readonly logger = new Logger(GatewayAlertService.name);

	constructor(
		private readonly alerts: GatewayAlertRepository,
		private readonly rules: AlertRuleConfigService,
		private readonly samples: TrafficSampleRepository,
		private readonly routes: RouteRepository,
		private readonly services: ServiceRepository,
		private readonly liveStates: InstanceLiveStateReader,
		private readonly names: TrafficNamesRepository,
		private readonly realtime: RealtimePublisherService,
	) {}

	async evaluate(now: number = Date.now()): Promise<EvaluationResult> {
		const rules = await this.rules.rules();
		const [routes, instances, openAlerts] = await Promise.all([
			this.routeSubjects(windowsNeeded(rules), now),
			this.instanceSubjects(),
			this.alerts.listOpen(),
		]);
		const evaluation = evaluateAlertRules({ rules, routes, instances, openAlerts: openAlerts.map(toOpenAlert) });
		const opened = await Promise.all(evaluation.toOpen.map((alert) => this.open(alert, now)));
		const resolved = await Promise.all(evaluation.toResolve.map((alert) => this.resolve(alert, now)));

		return { openedCount: opened.filter(Boolean).length, resolvedCount: resolved.filter(Boolean).length };
	}

	async onInstanceStateChanged(change: InstanceStateChange, now: number = Date.now()): Promise<void> {
		const rules = await this.rules.rules();
		const kind = ALERT_KIND_BY_STATE_KIND[change.kind];

		if (!rules[kind].isEnabled) {
			return;
		}

		const isDegraded = change.toState === 'unhealthy' || change.toState === 'circuit_open';
		const isRecovered = change.toState === 'healthy' || change.toState === 'circuit_closed';

		if (isDegraded) {
			const message = `${INSTANCE_ALERT_MESSAGES[kind](change.instanceName)}: ${change.reason}`;
			const alert: AlertToOpen = {
				kind,
				severity: INSTANCE_ALERT_SEVERITY[kind],
				subjectType: 'instance',
				subjectId: change.instanceId,
				subjectName: change.instanceName,
				message,
			};

			await this.open(alert, now);

			return;
		}

		if (!isRecovered) {
			return;
		}

		const openAlerts = await this.alerts.listOpen();
		const open = openAlerts.find((alert) => alert.kind === kind && alert.subjectId === change.instanceId);

		if (open) {
			await this.resolve(toOpenAlert(open), now);
		}
	}

	async listOpen(): Promise<readonly GatewayAlertDto[]> {
		const alerts = await this.alerts.listOpen();

		return this.withSubjectNames(alerts);
	}

	async listHistory(page: PageRequest): Promise<Page<GatewayAlertDto>> {
		const alerts = await this.alerts.listPage(page);
		const items = await this.withSubjectNames(alerts.items);

		return { items, nextCursor: alerts.nextCursor };
	}

	private async open(alert: AlertToOpen, now: number): Promise<boolean> {
		const created = await this.alerts.openIfNone(alert, new Date(now));

		if (created === null) {
			return false;
		}

		this.logger.log(`Alert opened: ${alert.kind} on ${alert.subjectType} ${alert.subjectName}: ${alert.message}`);
		const { kind, severity, subjectType, subjectId, subjectName, message } = alert;

		await this.realtime.publishToAdmins({
			type: 'alert.triggered',
			alertId: created.id,
			kind,
			severity,
			subjectType,
			subjectId,
			subjectName,
			message,
		});

		return true;
	}

	private async resolve(alert: OpenAlert, now: number): Promise<boolean> {
		const isResolved = await this.alerts.resolve(alert.id, new Date(now));

		if (!isResolved) {
			return false;
		}

		const [subjectName] = await this.subjectNames([alert]);

		this.logger.log(`Alert resolved: ${alert.kind} on ${alert.subjectType} ${subjectName}`);
		const { kind, subjectType, subjectId } = alert;

		await this.realtime.publishToAdmins({ type: 'alert.resolved', alertId: alert.id, kind, subjectType, subjectId, subjectName });

		return true;
	}

	// The last windows of every active route, oldest first; a route without
	// traffic in a window gets null there.
	private async routeSubjects(windowCount: number, now: number): Promise<readonly RouteAlertSubject[]> {
		const newestStart = toBucketStart(now - TRAFFIC_BUCKET_MS - EVALUATION_LAG_MS);
		const windowStarts = Array.from({ length: windowCount }, (_value, index) => newestStart - (windowCount - 1 - index) * TRAFFIC_BUCKET_MS);
		const query = {
			from: new Date(windowStarts[0]),
			to: new Date(newestStart + TRAFFIC_BUCKET_MS),
			stepSeconds: TRAFFIC_BUCKET_MS / 1000,
			groupBy: 'route' as const,
		};
		const [routes, rows] = await Promise.all([this.routes.listActive(), this.samples.aggregateInstanceSamples(query)]);
		const byRoute = groupByKey(rows);

		return routes.map((route) => {
			const routeRows = byRoute.get(route.id) ?? [];
			const windows = windowStarts.map((start) => toRouteWindow(routeRows.filter((row) => row.at?.getTime() === start)));

			return { routeId: route.id, routeName: route.name, windows };
		});
	}

	private async instanceSubjects(): Promise<readonly InstanceAlertSubject[]> {
		const [services, liveStates] = await Promise.all([this.services.listActive(), this.liveStates.readAll()]);

		return services.flatMap((service) =>
			service.instances.map((instance) => {
				const live = liveStates.get(instance.id);
				const instanceName = instanceDisplayName({ id: instance.id, name: instance.name, serviceId: service.id, serviceSlug: service.slug });

				return { instanceId: instance.id, instanceName, health: live?.health ?? null, circuit: live?.circuit ?? null };
			}),
		);
	}

	private async withSubjectNames(alerts: readonly GatewayAlert[]): Promise<readonly GatewayAlertDto[]> {
		const names = await this.subjectNames(alerts.map(toOpenAlert));

		return alerts.map((alert, index) => toGatewayAlertDto(alert, names[index]));
	}

	// Removed subjects keep their name (soft delete); a purged one reads as removed.
	private async subjectNames(alerts: readonly OpenAlert[]): Promise<readonly string[]> {
		const idsOf = (subjectType: OpenAlert['subjectType']): readonly string[] =>
			alerts.filter((alert) => alert.subjectType === subjectType).map((alert) => alert.subjectId);
		const [routes, services, instances] = await Promise.all([
			this.names.routes(idsOf('route')),
			this.names.services(idsOf('service')),
			this.names.instances(idsOf('instance')),
		]);

		return alerts.map((alert) => this.resolveName(alert, routes, services, instances));
	}

	private resolveName(
		alert: OpenAlert,
		routes: ReadonlyMap<string, RouteName>,
		services: ReadonlyMap<string, ServiceName>,
		instances: ReadonlyMap<string, InstanceName>,
	): string {
		if (alert.subjectType === 'route') {
			return routes.get(alert.subjectId)?.name ?? UNKNOWN_SUBJECT_NAME;
		}

		if (alert.subjectType === 'service') {
			return services.get(alert.subjectId)?.name ?? UNKNOWN_SUBJECT_NAME;
		}

		const instance = instances.get(alert.subjectId);

		return instance ? instanceDisplayName(instance) : UNKNOWN_SUBJECT_NAME;
	}
}

function toRouteWindow(rows: readonly SampleRow[]): RouteWindow {
	const counts = sumCounts(rows);

	if (counts.requestCount === 0) {
		return null;
	}

	const errorRatePercent = (counts.status5xx / counts.requestCount) * PERCENT;

	return { requestCount: counts.requestCount, p95Ms: percentileFromHistogram(counts.latencyBuckets, P95), errorRatePercent };
}

function toOpenAlert(alert: GatewayAlert): OpenAlert {
	return { id: alert.id, kind: alert.kind, subjectType: alert.subjectType, subjectId: alert.subjectId };
}
