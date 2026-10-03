import type {
	AiAnalysisScope,
	AiRiskLevel,
	AlertSeverity,
	AlertSubjectType,
	ChaosState,
	ConfigChangeAction,
	ConfigChangeDetail,
	ConfigEntityType,
	GatewayAlertKind,
	SystemHealthComponent,
	SystemHealthStatusValue,
} from './adminApiTypes';

export type BroadcastEntity =
	| 'Service'
	| 'ServiceInstance'
	| 'Route'
	| 'Consumer'
	| 'ApiKey'
	| 'GatewayAlert'
	| 'AlertRuleConfig'
	| 'ConfigChangeEvent'
	| 'AiAnalysis'
	| 'AiAnalysisMessage'
	| 'SystemHealthEvent'
	| 'AdminNotification';

export type EntityChangeAction = 'created' | 'updated' | 'deleted';

export type InstanceStateKind = 'health' | 'circuit';
export type InstanceStateName = 'healthy' | 'unhealthy' | 'circuit_closed' | 'circuit_open' | 'circuit_half_open';

// Mirrors the backend's realtime-event.ts: keep the two in sync.
// stopped: it shut down cleanly; down: it went silent.
export type GatewayStatusChange = 'up' | 'stopped' | 'down';

export type RealtimeEvent =
	// A 10 s traffic bucket was written; charts refetch.
	| {
			readonly type: 'traffic.collected';
			readonly bucketStart: string;
			readonly routeIds: readonly string[];
			readonly bucketMs: number;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'instance.state.changed';
			readonly serviceId: string;
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly kind: InstanceStateKind;
			readonly toState: InstanceStateName;
			readonly reason: string;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'config.changed';
			readonly entityType: ConfigEntityType;
			readonly entityId: string;
			readonly action: ConfigChangeAction;
			readonly summary: string;
			readonly detail: ConfigChangeDetail;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'alert.triggered';
			readonly alertId: string;
			readonly kind: GatewayAlertKind;
			readonly severity: AlertSeverity;
			readonly subjectType: AlertSubjectType;
			readonly subjectId: string;
			readonly subjectName: string;
			readonly message: string;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'alert.resolved';
			readonly alertId: string;
			readonly kind: GatewayAlertKind;
			readonly subjectType: AlertSubjectType;
			readonly subjectId: string;
			readonly subjectName: string;
			readonly occurredAt: string;
	  }
	| { readonly type: 'gateway.status.changed'; readonly gatewayId: string; readonly status: GatewayStatusChange; readonly occurredAt: string }
	| {
			readonly type: 'chaos.changed';
			readonly instanceId: string;
			readonly instanceName: string;
			readonly serviceSlug: string;
			readonly chaos: ChaosState;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'system.component.changed';
			readonly component: SystemHealthComponent;
			readonly status: SystemHealthStatusValue;
			readonly detail: string | null;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'ai.analysis.ready';
			readonly scope: AiAnalysisScope;
			readonly subjectId: string | null;
			readonly subjectName: string | null;
			readonly analysisId: string;
			readonly riskLevel: AiRiskLevel;
			readonly occurredAt: string;
	  }
	// Invalidation only, never shown to the user.
	| {
			readonly type: 'entity.changed';
			readonly entity: BroadcastEntity;
			readonly action: EntityChangeAction;
			readonly id: string | null;
			readonly occurredAt: string;
	  };

export type RealtimeEventType = RealtimeEvent['type'];

// For the console's own mutations, so sibling views refetch before the broker's echo
// arrives.
export type RealtimeEventBody = DistributiveOmit<RealtimeEvent, 'occurredAt'>;

export type RealtimeConnection = {
	readonly token: string;
	readonly url: string;
	readonly channels: readonly string[];
	readonly expiresAt: string;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const REALTIME_EVENT_TYPES: ReadonlySet<string> = new Set<RealtimeEventType>([
	'traffic.collected',
	'instance.state.changed',
	'config.changed',
	'alert.triggered',
	'alert.resolved',
	'gateway.status.changed',
	'chaos.changed',
	'system.component.changed',
	'ai.analysis.ready',
	'entity.changed',
]);

// Unknown events (a newer backend) are dropped, not crashed on.
export function toRealtimeEvent(payload: unknown): RealtimeEvent | null {
	if (typeof payload !== 'object' || payload === null) {
		return null;
	}

	const candidate = payload as { readonly type?: unknown; readonly occurredAt?: unknown };
	const isKnown = typeof candidate.type === 'string' && REALTIME_EVENT_TYPES.has(candidate.type) && typeof candidate.occurredAt === 'string';

	return isKnown ? (payload as RealtimeEvent) : null;
}

export function isDataChangingEvent(event: RealtimeEvent): boolean {
	const isLiveOnly = event.type === 'traffic.collected' || event.type === 'entity.changed';

	return !isLiveOnly;
}

export function isAlertEvent(event: RealtimeEvent): boolean {
	return event.type === 'alert.triggered' || event.type === 'alert.resolved' || isEntityChange(event, ['GatewayAlert']);
}

export function isEntityChange(event: RealtimeEvent, entities: ReadonlyArray<BroadcastEntity>): boolean {
	return event.type === 'entity.changed' && entities.includes(event.entity);
}

export function stampLocalEvent(body: RealtimeEventBody): RealtimeEvent {
	return { ...body, occurredAt: new Date().toISOString() } as RealtimeEvent;
}
