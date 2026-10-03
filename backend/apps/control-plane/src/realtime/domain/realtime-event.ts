import type { Prisma, SystemHealthComponent } from '@prisma/control-plane-client';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import type {
	AlertSubjectTypeName,
	ConfigChangeActionName,
	ConfigEntityTypeName,
	GatewayAlertKindName,
	InstanceStateKindName,
	InstanceStateName,
} from '@pyle/shared/contracts/names.js';

import type { EntityChangeAction } from '../../control-plane/entity-changes/entity-change.js';
import type { ConfigChangeDetail } from '../../gateway-config/domain/config-change-detail.js';

// Tables whose writes reach the console as entity.changed. High-churn telemetry is left
// out: it has its own events.
export const BROADCAST_ENTITIES = [
	'Service',
	'ServiceInstance',
	'Route',
	'Consumer',
	'ApiKey',
	'GatewayAlert',
	'AlertRuleConfig',
	'ConfigChangeEvent',
	'AiAnalysis',
	'AiAnalysisMessage',
	'SystemHealthEvent',
	'AdminNotification',
] as const satisfies readonly Prisma.ModelName[];

export type BroadcastEntity = (typeof BROADCAST_ENTITIES)[number];

export type AnalysisScopeName = 'platform' | 'route' | 'service';
export type RiskLevelName = 'low' | 'medium' | 'high';
export type ComponentStatusName = 'up' | 'degraded' | 'down';
export type GatewayStatusChange = 'up' | 'stopped' | 'down';

// Mirrored by the frontend's realtimeEvents.ts: keep the two in sync.
export type RealtimeEventBody =
	// A 10 s traffic bucket was written; charts refetch.
	| { readonly type: 'traffic.collected'; readonly bucketStart: string; readonly routeIds: readonly string[]; readonly bucketMs: number }
	| {
			readonly type: 'instance.state.changed';
			readonly serviceId: string;
			readonly serviceSlug: string;
			readonly instanceId: string;
			readonly instanceName: string;
			readonly kind: InstanceStateKindName;
			readonly toState: InstanceStateName;
			readonly reason: string;
	  }
	| {
			readonly type: 'config.changed';
			readonly entityType: ConfigEntityTypeName;
			readonly entityId: string;
			readonly action: ConfigChangeActionName;
			readonly summary: string;
			readonly detail: ConfigChangeDetail;
	  }
	| {
			readonly type: 'alert.triggered';
			readonly alertId: string;
			readonly kind: GatewayAlertKindName;
			readonly severity: 'warning' | 'critical';
			readonly subjectType: AlertSubjectTypeName;
			readonly subjectId: string;
			readonly subjectName: string;
			readonly message: string;
	  }
	| {
			readonly type: 'alert.resolved';
			readonly alertId: string;
			readonly kind: GatewayAlertKindName;
			readonly subjectType: AlertSubjectTypeName;
			readonly subjectId: string;
			readonly subjectName: string;
	  }
	// stopped: it said goodbye (its heartbeat is gone); down: it went silent.
	| { readonly type: 'gateway.status.changed'; readonly gatewayId: string; readonly status: GatewayStatusChange }
	| {
			readonly type: 'chaos.changed';
			readonly instanceId: string;
			readonly instanceName: string;
			readonly serviceSlug: string;
			readonly chaos: ChaosState;
	  }
	| {
			readonly type: 'system.component.changed';
			readonly component: SystemHealthComponent;
			readonly status: ComponentStatusName;
			readonly detail: string | null;
	  }
	| {
			readonly type: 'ai.analysis.ready';
			readonly scope: AnalysisScopeName;
			// Null for the platform scope.
			readonly subjectId: string | null;
			readonly subjectName: string | null;
			readonly analysisId: string;
			readonly riskLevel: RiskLevelName;
	  }
	// Cache invalidation only: never an inbox row.
	| { readonly type: 'entity.changed'; readonly entity: BroadcastEntity; readonly action: EntityChangeAction; readonly id: string | null };

export type RealtimeEvent = RealtimeEventBody & { readonly occurredAt: string };

export const ADMIN_EVENTS_CHANNEL = 'admin:events';
