import { describe, expect, it } from 'vitest';

import type { AiTool } from '../../../ai-analysis/application/ai-tool.js';
import type { ConsumersService } from '../../../gateway-config/application/consumers.service.js';
import type { RoutesService } from '../../../gateway-config/application/routes.service.js';
import type { ServicesService } from '../../../gateway-config/application/services.service.js';
import { ConfigNotFoundError } from '../../../gateway-config/domain/config-errors.js';
import type { ConsumerDto, ServiceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';
import type { AlertRuleConfigService } from '../../../traffic/alerts/application/alert-rule-config.service.js';
import { DEFAULT_ALERT_RULES } from '../../../traffic/alerts/domain/alert-rule-kinds.js';
import { ProposalCollector } from '../assistant-proposal.js';
import { buildConsumer, buildRoute, buildService } from './proposal-fixtures.js';
import { buildProposalTools, PROPOSAL_RECORDED, type ProposalToolDependencies } from './proposal-tools.js';

type Setup = {
	readonly service?: ServiceDto;
	readonly consumer?: ConsumerDto | null;
	readonly isChaosAllowed?: boolean;
	readonly isScalingAllowed?: boolean;
};
type Harness = {
	readonly run: (name: string, input: Record<string, unknown>) => Promise<string>;
	readonly collector: ProposalCollector;
	readonly tools: readonly AiTool[];
};

const REASON = 'Motivo';

function buildHarness(setup: Setup = {}): Harness {
	const service = setup.service ?? buildService();
	const consumer = setup.consumer === undefined ? buildConsumer() : setup.consumer;
	const collector = new ProposalCollector();
	const services = {
		get: async (slug: string) => (slug === service.slug ? service : Promise.reject(new ConfigNotFoundError(slug))),
	} as unknown as ServicesService;
	const routes = {
		list: async () => [
			buildRoute(),
			buildRoute({ id: 'route-catalog', name: 'catalog-api', pathPrefix: '/api/catalog', rateLimitPerMinute: 100, timeoutMs: 2000 }),
		],
	} as unknown as RoutesService;
	const consumers = {
		get: async (slug: string) => (consumer?.slug === slug ? consumer : Promise.reject(new ConfigNotFoundError(slug))),
	} as unknown as ConsumersService;
	const rules = { rules: async () => DEFAULT_ALERT_RULES } as unknown as AlertRuleConfigService;
	const dependencies: ProposalToolDependencies = {
		services,
		routes,
		consumers,
		rules,
		isChaosAllowed: setup.isChaosAllowed ?? false,
		isScalingAllowed: setup.isScalingAllowed ?? false,
		collector,
	};
	const tools = buildProposalTools(dependencies);

	const run = (name: string, input: Record<string, unknown>) => {
		const tool = tools.find((candidate) => candidate.name === name);

		if (!tool) {
			throw new Error(`no tool ${name}`);
		}

		return tool.run({ ...input, reason: REASON });
	};

	return { run, collector, tools };
}

async function expectRecorded(harness: Harness, name: string, input: Record<string, unknown>, proposal: Record<string, unknown>): Promise<void> {
	expect(await harness.run(name, input)).toBe(PROPOSAL_RECORDED);
	expect(harness.collector.list()).toEqual([{ ...proposal, reason: REASON }]);
}

async function expectRefused(harness: Harness, name: string, input: Record<string, unknown>, why: string): Promise<void> {
	expect(await harness.run(name, input)).toBe(`Not proposed: ${why}.`);
	expect(harness.collector.list()).toEqual([]);
}

describe('buildProposalTools', () => {
	it('offers chaos only where chaos is allowed', () => {
		const names = (isChaosAllowed: boolean) => buildHarness({ isChaosAllowed }).tools.map((tool) => tool.name);

		expect(names(false)).not.toContain('propose_instance_chaos');
		expect(names(false)).not.toContain('propose_scale_service');
		expect(names(true)).toContain('propose_instance_chaos');
		expect(names(false)).toHaveLength(14);
	});

	it('wants a reason on every proposal', () => {
		const harness = buildHarness();
		const tool = harness.tools[0];

		expect(tool?.inputSchema.required).toContain('reason');
	});
});

describe('instance proposals', () => {
	const target = { serviceSlug: 'orders', instanceId: 'id-orders-1', instanceName: 'orders-1' };

	it('drains an enabled instance', () =>
		expectRecorded(
			buildHarness(),
			'propose_drain_instance',
			{ serviceSlug: 'orders', instanceName: 'orders-1' },
			{ type: 'drain_instance', ...target },
		));

	it('does not drain one already drained', () =>
		expectRefused(
			buildHarness(),
			'propose_drain_instance',
			{ serviceSlug: 'orders', instanceName: 'orders-2' },
			'instance orders-2 is already drained',
		));

	it('enables a drained instance, and names the ones there are for an unknown name', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_enable_instance',
			{ serviceSlug: 'orders', instanceName: 'orders-2' },
			{ type: 'enable_instance', serviceSlug: 'orders', instanceId: 'id-orders-2', instanceName: 'orders-2' },
		);
		await expectRefused(
			buildHarness(),
			'propose_enable_instance',
			{ serviceSlug: 'orders', instanceName: 'x' },
			'service orders has no instance "x"; its instances are orders-1, orders-2',
		);
	});

	it('sets a weight that changes something', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_instance_weight',
			{ serviceSlug: 'orders', instanceName: 'orders-1', weight: 80 },
			{ type: 'set_instance_weight', ...target, weight: 80 },
		);
		await expectRefused(
			buildHarness(),
			'propose_instance_weight',
			{ serviceSlug: 'orders', instanceName: 'orders-1', weight: 50 },
			'instance orders-1 already has weight 50',
		);
	});

	it('lets a missing service fail loudly', async () => {
		await expect(buildHarness().run('propose_drain_instance', { serviceSlug: 'nope', instanceName: 'x' })).rejects.toThrow(ConfigNotFoundError);
	});
});

describe('service proposals', () => {
	it('changes the strategy, never to the current one or an unknown one', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_lb_strategy',
			{ serviceSlug: 'orders', strategy: 'least_connections' },
			{ type: 'set_lb_strategy', serviceSlug: 'orders', strategy: 'least_connections' },
		);
		await expectRefused(
			buildHarness(),
			'propose_lb_strategy',
			{ serviceSlug: 'orders', strategy: 'weighted_random' },
			'service orders already uses weighted_random',
		);
		await expectRefused(
			buildHarness(),
			'propose_lb_strategy',
			{ serviceSlug: 'orders', strategy: 'random' },
			'strategy must be one of round_robin, least_connections, weighted_random',
		);
	});

	it('changes the timeout within range', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_service_timeout',
			{ serviceSlug: 'orders', timeoutMs: 5000 },
			{ type: 'set_service_timeout', serviceSlug: 'orders', timeoutMs: 5000 },
		);
		await expectRefused(
			buildHarness(),
			'propose_service_timeout',
			{ serviceSlug: 'orders', timeoutMs: 3000 },
			'the timeout of orders is already 3000',
		);
		await expectRefused(
			buildHarness(),
			'propose_service_timeout',
			{ serviceSlug: 'orders', timeoutMs: 50 },
			'timeoutMs must be an integer between 100 and 60000',
		);
	});

	it('changes the attempts', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_service_retries',
			{ serviceSlug: 'orders', retryMaxAttempts: 3 },
			{ type: 'set_service_retries', serviceSlug: 'orders', retryMaxAttempts: 3 },
		);
		await expectRefused(
			buildHarness(),
			'propose_service_retries',
			{ serviceSlug: 'orders', retryMaxAttempts: 2 },
			'the attempts of orders is already 2',
		);
	});

	it('wants the numbers it needs', async () => {
		await expect(buildHarness().run('propose_service_retries', { serviceSlug: 'orders' })).rejects.toThrow('retryMaxAttempts is required');
	});
});

describe('route proposals', () => {
	it('sets a route timeout, or removes it when omitted', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_route_timeout',
			{ pathPrefix: '/api/orders', timeoutMs: 1500 },
			{ type: 'set_route_timeout', routeId: 'route-orders', routeName: 'orders-api', timeoutMs: 1500 },
		);
		await expectRecorded(
			buildHarness(),
			'propose_route_timeout',
			{ pathPrefix: '/api/catalog' },
			{ type: 'set_route_timeout', routeId: 'route-catalog', routeName: 'catalog-api', timeoutMs: null },
		);
		await expectRefused(buildHarness(), 'propose_route_timeout', { pathPrefix: '/api/orders' }, 'the timeout of /api/orders is already unset');
	});

	it('names the routes there are for an unknown prefix', () =>
		expectRefused(
			buildHarness(),
			'propose_route_timeout',
			{ pathPrefix: '/api/x' },
			'no route has the prefix /api/x; routes are /api/orders, /api/catalog',
		));

	it('sets or removes a route limit', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_route_rate_limit',
			{ pathPrefix: '/api/orders', rateLimitPerMinute: 300 },
			{ type: 'set_route_rate_limit', routeId: 'route-orders', routeName: 'orders-api', rateLimitPerMinute: 300 },
		);
		await expectRefused(
			buildHarness(),
			'propose_route_rate_limit',
			{ pathPrefix: '/api/catalog', rateLimitPerMinute: 100 },
			'the limit of /api/catalog is already 100',
		);
		await expectRefused(
			buildHarness(),
			'propose_route_rate_limit',
			{ pathPrefix: '/api/catalog', rateLimitPerMinute: 0 },
			'rateLimitPerMinute must be an integer between 1 and 100000',
		);
	});

	it('creates a route on a free, valid prefix of an existing service', async () => {
		const input = { name: 'reports', pathPrefix: '/api/reports', serviceSlug: 'orders', isAuthRequired: true };

		await expectRecorded(buildHarness(), 'propose_create_route', input, { type: 'create_route', ...input });
		await expectRefused(buildHarness(), 'propose_create_route', { ...input, pathPrefix: '/api/orders' }, 'route orders-api already uses /api/orders');
		await expectRefused(
			buildHarness(),
			'propose_create_route',
			{ ...input, pathPrefix: 'reports/' },
			'reports/ is not a valid prefix (lowercase segments like /api/orders, no trailing slash)',
		);
	});
});

describe('consumer proposals', () => {
	it('changes a consumer limit', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_consumer_rate_limit',
			{ consumerSlug: 'web-app', rateLimitPerMinute: 900 },
			{ type: 'set_consumer_rate_limit', consumerSlug: 'web-app', consumerName: 'Web App', rateLimitPerMinute: 900 },
		);
		await expectRefused(
			buildHarness(),
			'propose_consumer_rate_limit',
			{ consumerSlug: 'web-app', rateLimitPerMinute: 600 },
			'the limit of web-app is already 600',
		);
	});

	it('revokes only an active key', async () => {
		await expectRecorded(
			buildHarness(),
			'propose_revoke_api_key',
			{ consumerSlug: 'web-app', keyPrefix: 'pyle_ab12' },
			{ type: 'revoke_api_key', consumerSlug: 'web-app', keyId: 'key-1', keyPrefix: 'pyle_ab12' },
		);
		await expectRefused(
			buildHarness(),
			'propose_revoke_api_key',
			{ consumerSlug: 'web-app', keyPrefix: 'pyle_old0' },
			'web-app has no active key with prefix pyle_old0',
		);
	});

	it('creates a consumer with a free, valid slug', async () => {
		const input = { slug: 'mobile-app', name: 'Mobile', rateLimitPerMinute: 300 };

		await expectRecorded(buildHarness({ consumer: null }), 'propose_create_consumer', input, { type: 'create_consumer', ...input });
		await expectRefused(buildHarness(), 'propose_create_consumer', { ...input, slug: 'web-app' }, 'a consumer web-app already exists');
		await expectRefused(
			buildHarness(),
			'propose_create_consumer',
			{ ...input, slug: 'Mobile' },
			'Mobile is not a valid slug (lowercase letters, digits, single hyphens)',
		);
		await expectRefused(
			buildHarness(),
			'propose_create_consumer',
			{ ...input, rateLimitPerMinute: 0 },
			'rateLimitPerMinute must be an integer between 1 and 1000000',
		);
	});

	it('lets a lookup failure other than not-found propagate', async () => {
		const consumers = { get: async () => Promise.reject(new Error('db down')) } as unknown as ConsumersService;
		const collector = new ProposalCollector();
		const dependencies: ProposalToolDependencies = {
			services: {} as ServicesService,
			routes: {} as RoutesService,
			consumers,
			rules: {} as AlertRuleConfigService,
			isChaosAllowed: false,
			isScalingAllowed: false,
			collector,
		};
		const tool = buildProposalTools(dependencies).find((candidate) => candidate.name === 'propose_create_consumer');

		await expect(tool?.run({ slug: 'a', name: 'A', rateLimitPerMinute: 10, reason: REASON })).rejects.toThrow('db down');
		expect(collector.list()).toEqual([]);
	});
});

describe('platform proposals', () => {
	it('changes an alert rule, never to its current settings', async () => {
		const input = { kind: 'route_p95_latency', isEnabled: true, threshold: 1200, sustainedWindows: 3 };

		await expectRecorded(buildHarness(), 'propose_alert_rule', input, { type: 'update_alert_rule', ...input });
		await expectRefused(buildHarness(), 'propose_alert_rule', { ...input, threshold: 800 }, 'the route_p95_latency rule already has these settings');
		await expectRefused(
			buildHarness(),
			'propose_alert_rule',
			{ ...input, kind: 'cpu' },
			'kind must be one of route_p95_latency, route_error_rate, instance_unhealthy, circuit_open',
		);
	});

	it('proposes an analysis of the platform, a route or a service', async () => {
		const base = { type: 'generate_analysis', windowMinutes: null };

		await expectRecorded(
			buildHarness(),
			'propose_analysis',
			{ scope: 'platform' },
			{ ...base, scope: 'platform', subjectId: null, subjectName: null },
		);
		await expectRecorded(
			buildHarness(),
			'propose_analysis',
			{ scope: 'route', pathPrefix: '/api/orders', windowMinutes: 59.6 },
			{ ...base, scope: 'route', subjectId: 'route-orders', subjectName: 'orders-api', windowMinutes: 60 },
		);
		await expectRecorded(
			buildHarness(),
			'propose_analysis',
			{ scope: 'service', serviceSlug: 'orders' },
			{ ...base, scope: 'service', subjectId: 'svc', subjectName: 'Pedidos' },
		);
	});

	it('refuses an analysis it could not run', async () => {
		await expectRefused(buildHarness(), 'propose_analysis', { scope: 'galaxy' }, 'scope must be one of platform, route, service');
		await expectRefused(
			buildHarness(),
			'propose_analysis',
			{ scope: 'platform', windowMinutes: 2 },
			'windowMinutes must be an integer between 5 and 1440',
		);
		await expectRefused(buildHarness(), 'propose_analysis', { scope: 'route' }, 'no route has the prefix ; routes are /api/orders, /api/catalog');
	});
});

describe('propose_instance_chaos', () => {
	const fault = { serviceSlug: 'orders', instanceName: 'orders-1', latencyMs: 1500, jitterMs: 0, errorRate: 0.2, isDown: false };

	it('proposes a fault on a demo instance', () => {
		const chaos = { latencyMs: 1500, jitterMs: 0, errorRate: 0.2, isDown: false };
		const proposal = { type: 'set_instance_chaos', serviceSlug: 'orders', instanceId: 'id-orders-1', instanceName: 'orders-1', chaos };

		return expectRecorded(buildHarness({ isChaosAllowed: true }), 'propose_instance_chaos', fault, proposal);
	});

	it('refuses a fault past the limits or on an unknown instance', async () => {
		await expectRefused(
			buildHarness({ isChaosAllowed: true }),
			'propose_instance_chaos',
			{ ...fault, errorRate: 2 },
			'errorRate must be between 0 and 1',
		);
		await expectRefused(
			buildHarness({ isChaosAllowed: true }),
			'propose_instance_chaos',
			{ ...fault, instanceName: 'x' },
			'service orders has no instance "x"; its instances are orders-1, orders-2',
		);
	});
});

describe('propose_scale_service', () => {
	const scalable = buildService({ scaling: { profile: 'demo_orders', desiredManagedReplicas: 1 } });

	it('is offered only where scaling is allowed', () => {
		expect(buildHarness({ isScalingAllowed: true }).tools.map((tool) => tool.name)).toContain('propose_scale_service');
	});

	it('proposes a new count, remembering the current one', () =>
		expectRecorded(
			buildHarness({ service: scalable, isScalingAllowed: true }),
			'propose_scale_service',
			{ serviceSlug: 'orders', managedReplicas: 3 },
			{
				type: 'scale_service',
				serviceSlug: 'orders',
				serviceName: 'Pedidos',
				managedReplicas: 3,
				currentManagedReplicas: 1,
			},
		));

	it('refuses a service scaled by hand, a count out of range, or no change', async () => {
		await expectRefused(
			buildHarness({ isScalingAllowed: true }),
			'propose_scale_service',
			{ serviceSlug: 'orders', managedReplicas: 2 },
			'service orders has no scaling profile: its instances are managed by hand',
		);
		await expectRefused(
			buildHarness({ service: scalable, isScalingAllowed: true }),
			'propose_scale_service',
			{ serviceSlug: 'orders', managedReplicas: 11 },
			'managedReplicas must be an integer between 0 and 10',
		);
		await expectRefused(
			buildHarness({ service: scalable, isScalingAllowed: true }),
			'propose_scale_service',
			{ serviceSlug: 'orders', managedReplicas: 1 },
			'the managed replicas of orders is already 1',
		);
	});
});
