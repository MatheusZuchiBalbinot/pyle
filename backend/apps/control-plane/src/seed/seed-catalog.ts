import type { ScalingProfile } from '@prisma/control-plane-client';

import type { HttpMethodName, LoadBalancingStrategyName } from '@pyle/shared/contracts/config-snapshot.js';

// Ports are the demo instances docker-compose publishes.

export type SeedInstance = { readonly name: string; readonly port: number; readonly weight: number };

export type SeedService = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly lbStrategy: LoadBalancingStrategyName;
	readonly scalingProfile: ScalingProfile;
	readonly instances: readonly SeedInstance[];
};

export type SeedRoute = {
	readonly name: string;
	readonly pathPrefix: string;
	readonly serviceSlug: string;
	readonly isAuthRequired: boolean;
	readonly rateLimitPerMinute: number | null;
	// Empty: every method.
	readonly methods: readonly HttpMethodName[];
	readonly stripPrefix: boolean;
};

export type SeedConsumer = {
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute: number;
	// Path prefixes of the routes it may call; 'all' for every seeded route.
	readonly routePrefixes: 'all' | readonly string[];
	// One key per label.
	readonly keyLabels: readonly string[];
	// Revoked at the end of the seed, so the bot can show a 401.
	readonly isRevoked: boolean;
};

export const SEED_SERVICES: readonly SeedService[] = [
	{
		slug: 'orders',
		name: 'Pedidos',
		description: 'Pedidos da loja de demonstração',
		lbStrategy: 'round_robin',
		scalingProfile: 'demo_orders',
		instances: [
			{ name: 'orders-1', port: 48101, weight: 1 },
			{ name: 'orders-2', port: 48102, weight: 1 },
			{ name: 'orders-3', port: 48103, weight: 1 },
		],
	},
	{
		slug: 'users',
		name: 'Usuários',
		description: 'Cadastro de clientes',
		lbStrategy: 'least_connections',
		scalingProfile: 'demo_users',
		instances: [
			{ name: 'users-1', port: 48111, weight: 1 },
			{ name: 'users-2', port: 48112, weight: 1 },
		],
	},
	{
		slug: 'catalog',
		name: 'Catálogo',
		description: 'Produtos e preços',
		lbStrategy: 'weighted_random',
		scalingProfile: 'demo_catalog',
		instances: [
			{ name: 'catalog-1', port: 48121, weight: 3 },
			{ name: 'catalog-2', port: 48122, weight: 1 },
		],
	},
];

export const SEED_ROUTES: readonly SeedRoute[] = [
	{
		name: 'Pedidos',
		pathPrefix: '/api/orders',
		serviceSlug: 'orders',
		isAuthRequired: true,
		rateLimitPerMinute: 12_000,
		methods: [],
		stripPrefix: true,
	},
	{
		name: 'Usuários',
		pathPrefix: '/api/users',
		serviceSlug: 'users',
		isAuthRequired: true,
		rateLimitPerMinute: null,
		methods: ['GET'],
		stripPrefix: true,
	},
	{
		name: 'Catálogo',
		pathPrefix: '/api/catalog',
		serviceSlug: 'catalog',
		isAuthRequired: true,
		rateLimitPerMinute: null,
		methods: ['GET', 'HEAD'],
		stripPrefix: true,
	},
	// Kept whole: the instances answer /api/public/health themselves, which
	// also shows both ways of rewriting a path.
	{
		name: 'Health público',
		pathPrefix: '/api/public/health',
		serviceSlug: 'catalog',
		isAuthRequired: false,
		rateLimitPerMinute: 1200,
		methods: ['GET'],
		stripPrefix: false,
	},
];

// Limits sized for the load bot's wave (DEMO_LIVE_RPS, up to ~800 req/s): at its peak
// web-app and internal-batch each send ~260 req/s (~15,600/min), mobile-app ~180 req/s,
// and each consumer ~110 req/s to /api/orders; anonymous callers ~8 req/s to the public
// route. About 2x that headroom keeps them clear of 429s. partner-x alone is meant to
// go over: it sends 30 to 80 req/s against 20 req/s (1200/min).
export const SEED_CONSUMERS: readonly SeedConsumer[] = [
	// Seeded first so it lists last (newest first): an old integration whose key was revoked,
	// which the load bot still calls to show the 401s.
	{ slug: 'revoked-demo', name: 'Integração antiga', rateLimitPerMinute: 60, routePrefixes: 'all', keyLabels: ['revoked'], isRevoked: true },
	{ slug: 'web-app', name: 'Web app', rateLimitPerMinute: 30_000, routePrefixes: 'all', keyLabels: ['web'], isRevoked: false },
	{
		slug: 'mobile-app',
		name: 'App mobile',
		rateLimitPerMinute: 20_000,
		routePrefixes: ['/api/orders', '/api/users'],
		keyLabels: ['mobile', 'legacy'],
		isRevoked: false,
	},
	{ slug: 'partner-x', name: 'Parceiro X', rateLimitPerMinute: 1200, routePrefixes: ['/api/catalog'], keyLabels: ['partner'], isRevoked: false },
	{ slug: 'internal-batch', name: 'Batch interno', rateLimitPerMinute: 40_000, routePrefixes: 'all', keyLabels: ['batch'], isRevoked: false },
];

export function seededPrefixes(consumer: SeedConsumer): readonly string[] {
	if (consumer.routePrefixes === 'all') {
		return SEED_ROUTES.map((route) => route.pathPrefix);
	}

	return consumer.routePrefixes;
}
