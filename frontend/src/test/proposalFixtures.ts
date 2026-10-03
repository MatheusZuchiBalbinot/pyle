import type { AssistantProposal } from '../app/api/adminApiTypes';

type ProposalType = AssistantProposal['type'];
type ProposalOf<Type extends ProposalType> = Extract<AssistantProposal, { type: Type }>;

// One proposal of every kind, so a spec can walk the whole union and a new
// kind fails to compile here until it has an example.
export const PROPOSALS: { readonly [Type in ProposalType]: ProposalOf<Type> } = {
	drain_instance: { type: 'drain_instance', serviceSlug: 'orders', instanceId: 'i2', instanceName: 'orders-2', reason: 'p95 alto' },
	enable_instance: { type: 'enable_instance', serviceSlug: 'orders', instanceId: 'i2', instanceName: 'orders-2', reason: 'voltou' },
	set_instance_weight: { type: 'set_instance_weight', serviceSlug: 'catalog', instanceId: 'c1', instanceName: 'catalog-1', weight: 3, reason: 'r' },
	set_lb_strategy: { type: 'set_lb_strategy', serviceSlug: 'users', strategy: 'least_connections', reason: 'r' },
	set_service_timeout: { type: 'set_service_timeout', serviceSlug: 'orders', timeoutMs: 2000, reason: 'r' },
	set_service_retries: { type: 'set_service_retries', serviceSlug: 'orders', retryMaxAttempts: 3, reason: 'r' },
	set_route_timeout: { type: 'set_route_timeout', routeId: 'r1', routeName: 'Pedidos', timeoutMs: null, reason: 'r' },
	set_route_rate_limit: { type: 'set_route_rate_limit', routeId: 'r1', routeName: 'Pedidos', rateLimitPerMinute: 600, reason: 'r' },
	set_consumer_rate_limit: {
		type: 'set_consumer_rate_limit',
		consumerSlug: 'partner-x',
		consumerName: 'Parceiro X',
		rateLimitPerMinute: 240,
		reason: 'r',
	},
	revoke_api_key: { type: 'revoke_api_key', consumerSlug: 'mobile-app', keyId: 'k1', keyPrefix: 'pyle_live_Ab', reason: 'vazou' },
	create_consumer: { type: 'create_consumer', slug: 'loja', name: 'Loja', rateLimitPerMinute: 600, reason: 'pedido' },
	create_route: { type: 'create_route', name: 'Estoque', pathPrefix: '/api/stock', serviceSlug: 'catalog', isAuthRequired: true, reason: 'r' },
	update_alert_rule: { type: 'update_alert_rule', kind: 'route_p95_latency', isEnabled: true, threshold: 1200, sustainedWindows: 3, reason: 'r' },
	generate_analysis: { type: 'generate_analysis', scope: 'route', subjectId: 'r1', subjectName: 'Pedidos', windowMinutes: 60, reason: 'r' },
	set_instance_chaos: {
		type: 'set_instance_chaos',
		serviceSlug: 'orders',
		instanceId: 'i2',
		instanceName: 'orders-2',
		chaos: { latencyMs: 800, jitterMs: 0, errorRate: 0, isDown: false },
		reason: 'demo',
	},
	scale_service: {
		type: 'scale_service',
		serviceSlug: 'orders',
		serviceName: 'Pedidos',
		managedReplicas: 3,
		currentManagedReplicas: 1,
		reason: 'pico de tráfego',
	},
};

export const EVERY_PROPOSAL: readonly AssistantProposal[] = Object.values(PROPOSALS);
