import type { CreateRouteBody, CreateServiceBody, SeedAdminApiClient } from '../../apps/control-plane/src/seed/seed-admin-api.client.js';

// What the benchmark adds to the gateway's configuration, through the admin API, and takes
// away again at the end so the demo does not keep a service nobody runs.

type BenchConfig = { readonly apiKey: string };

export const BENCH_OPEN_PREFIX = '/bench/open';
export const BENCH_KEYED_PREFIX = '/bench/keyed';

const BENCH_SERVICE_SLUG = 'bench';
const BENCH_CONSUMER_SLUG = 'bench';
// The ceiling the console accepts; the keyed route measures the cost of the check, not a refusal.
const BENCH_CONSUMER_RATE_LIMIT_PER_MINUTE = 1_000_000;
const BENCH_PREFIXES: ReadonlySet<string> = new Set([BENCH_OPEN_PREFIX, BENCH_KEYED_PREFIX]);
const BENCH_SERVICE: CreateServiceBody = {
	slug: BENCH_SERVICE_SLUG,
	name: 'Benchmark',
	description: 'Upstream do benchmark (scripts/bench.ts)',
	lbStrategy: 'round_robin',
	scalingProfile: null,
};

// A run that died halfway leaves its configuration behind: it is removed first.
export async function createBenchConfig(client: SeedAdminApiClient, upstreamUrl: string): Promise<BenchConfig> {
	await removeBenchConfig(client);
	await client.createService(BENCH_SERVICE);
	await client.addInstance(BENCH_SERVICE_SLUG, { name: 'bench-upstream', url: upstreamUrl, weight: 1 });
	await client.createRoute(benchRoute('Benchmark aberto', BENCH_OPEN_PREFIX, false));
	const keyedRoute = await client.createRoute(benchRoute('Benchmark com chave', BENCH_KEYED_PREFIX, true));
	const consumerBody = {
		slug: BENCH_CONSUMER_SLUG,
		name: 'Benchmark',
		rateLimitPerMinute: BENCH_CONSUMER_RATE_LIMIT_PER_MINUTE,
		routeIds: [keyedRoute.id],
	};
	const consumer = await client.createConsumer(consumerBody);

	return { apiKey: consumer.key };
}

export async function removeBenchConfig(client: SeedAdminApiClient): Promise<void> {
	const consumer = await client.getConsumer(BENCH_CONSUMER_SLUG);

	if (consumer !== null) {
		await client.deleteConsumer(BENCH_CONSUMER_SLUG);
	}

	const routes = await client.listRoutes();
	const benchRoutes = routes.filter((route) => BENCH_PREFIXES.has(route.pathPrefix));

	for (const route of benchRoutes) {
		await client.deleteRoute(route.id);
	}

	const service = await client.getService(BENCH_SERVICE_SLUG);

	if (service !== null) {
		await client.deleteService(BENCH_SERVICE_SLUG);
	}
}

function benchRoute(name: string, pathPrefix: string, isAuthRequired: boolean): CreateRouteBody {
	return { name, pathPrefix, serviceSlug: BENCH_SERVICE_SLUG, isAuthRequired, rateLimitPerMinute: null, methods: [], stripPrefix: true };
}
