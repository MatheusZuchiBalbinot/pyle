import type { GatewayAlertKind } from './alerts';
import type { ChaosState, LoadBalancingStrategy } from './services';

export type AiRiskLevel = 'low' | 'medium' | 'high';

export type AiAnalysisScope = 'platform' | 'route' | 'service';

export type AiTrend = 'improved' | 'stable' | 'worsened';

// Mirrors the backend's GatewayProposal; the operator confirms each one.
export type AssistantProposal =
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
	| { readonly type: 'set_lb_strategy'; readonly serviceSlug: string; readonly strategy: LoadBalancingStrategy; readonly reason: string }
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
			readonly kind: GatewayAlertKind;
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
			// When proposed: fewer than this is destructive.
			readonly currentManagedReplicas: number;
			readonly reason: string;
	  };

export type SuggestedAction = AssistantProposal;

// Totals over every analysis, not the page the console loaded.
export type AiAnalysisSummary = {
	readonly totalCount: number;
	readonly subjectCount: number;
	readonly highRiskCount: number;
};

export type AiAnalysis = {
	readonly id: string;
	readonly scope: AiAnalysisScope;
	// Route or service id; null for the platform scope.
	readonly subjectId: string | null;
	// The subject's name when the analysis ran (it may be deleted since).
	readonly subjectName: string | null;
	readonly windowMinutes: number | null;
	readonly summary: string;
	readonly riskLevel: AiRiskLevel;
	readonly highlights: readonly string[];
	readonly recommendations: readonly string[];
	readonly suggestedActions: readonly SuggestedAction[];
	readonly trend: AiTrend | null;
	readonly trendSummary: string | null;
	readonly previousAnalysisId: string | null;
	readonly model: string;
	readonly requestedAt: string;
};

export type AiMessageRole = 'user' | 'assistant';

export type AiAnalysisMessage = {
	readonly id: string;
	readonly role: AiMessageRole;
	readonly content: string;
	readonly createdAt: string;
};

export type AiReplyEvent =
	| { readonly type: 'text'; readonly delta: string }
	| { readonly type: 'tool_call'; readonly name: string }
	| { readonly type: 'done'; readonly text: string }
	| { readonly type: 'message'; readonly message: AiAnalysisMessage }
	| { readonly type: 'error'; readonly message: string };

export type AssistantMessage = {
	readonly role: 'user' | 'assistant';
	readonly content: string;
};

export type AssistantTurnInput = {
	readonly messages: readonly AssistantMessage[];
	readonly timeZone: string;
};

export type AssistantReply = {
	readonly reply: string;
	readonly proposals: readonly AssistantProposal[];
	readonly toolCalls: readonly string[];
};

export type GenerateAiAnalysisInput = {
	readonly scope: AiAnalysisScope;
	// Route or service id; required unless the scope is platform.
	readonly subjectId?: string;
	readonly windowMinutes?: number;
};

export type ListAiAnalysesFilter = {
	readonly scope?: AiAnalysisScope;
	readonly subjectId?: string;
};
