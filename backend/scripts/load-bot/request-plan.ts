import type { BotProfileName } from './profiles.js';

export type ConsumerKeys = Readonly<Record<string, readonly string[]>>;

export type PlannedRequest = {
	readonly method: 'GET' | 'POST' | 'HEAD';
	readonly path: string;
	// Null: no Authorization header.
	readonly apiKey: string | null;
	readonly body: string | null;
	// Why this request exists, for the summary ("steady", "no key"...).
	readonly intent: RequestIntent;
};

export type RequestIntent = 'normal' | 'no_key' | 'revoked_key' | 'forbidden_route' | 'unknown_path' | 'abusive';

type Random = () => number;

type Target = {
	readonly method: PlannedRequest['method'];
	readonly routePrefix: string;
	readonly pathFor: (random: Random) => string;
	readonly body?: () => string;
};

const MAX_DEMO_ID = 200;
const ORDERS = '/api/orders';
const USERS = '/api/users';
const CATALOG = '/api/catalog';
const PUBLIC_HEALTH = '/api/public/health';

function demoId(random: Random): number {
	return 1 + Math.floor(random() * MAX_DEMO_ID);
}

// 70% reads spread over the three services, 10% order creation, 20% the
// rest (single items, HEAD, the public health route).
const WEIGHTED_TARGETS: readonly { readonly weight: number; readonly target: Target }[] = [
	{ weight: 24, target: { method: 'GET', routePrefix: ORDERS, pathFor: () => `${ORDERS}?limit=20` } },
	{ weight: 23, target: { method: 'GET', routePrefix: USERS, pathFor: () => USERS } },
	{ weight: 23, target: { method: 'GET', routePrefix: CATALOG, pathFor: () => `${CATALOG}/items` } },
	{
		weight: 10,
		target: { method: 'POST', routePrefix: ORDERS, pathFor: () => ORDERS, body: () => JSON.stringify({ items: [{ sku: 'demo', quantity: 1 }] }) },
	},
	{ weight: 7, target: { method: 'GET', routePrefix: ORDERS, pathFor: (random) => `${ORDERS}/${demoId(random)}` } },
	{ weight: 5, target: { method: 'GET', routePrefix: USERS, pathFor: (random) => `${USERS}/${demoId(random)}` } },
	{ weight: 5, target: { method: 'GET', routePrefix: CATALOG, pathFor: (random) => `${CATALOG}/items/${demoId(random)}` } },
	{ weight: 2, target: { method: 'HEAD', routePrefix: CATALOG, pathFor: () => `${CATALOG}/items` } },
	{ weight: 1, target: { method: 'GET', routePrefix: PUBLIC_HEALTH, pathFor: () => PUBLIC_HEALTH } },
];

// Who may call what (the seed catalog), and so who the bot sends as.
const CONSUMERS_BY_ROUTE: Readonly<Record<string, readonly string[]>> = {
	[ORDERS]: ['web-app', 'mobile-app', 'internal-batch'],
	[USERS]: ['web-app', 'mobile-app', 'internal-batch'],
	[CATALOG]: ['web-app', 'partner-x', 'internal-batch'],
	[PUBLIC_HEALTH]: [],
};

// The mixed profile's share of each deliberate mistake.
const MISTAKES: readonly { readonly chance: number; readonly intent: RequestIntent }[] = [
	{ chance: 0.01, intent: 'no_key' },
	{ chance: 0.005, intent: 'revoked_key' },
	{ chance: 0.01, intent: 'forbidden_route' },
	{ chance: 0.005, intent: 'unknown_path' },
];

const PARTNER = 'partner-x';
const REVOKED = 'revoked-demo';

export function planRequest(profile: BotProfileName, keys: ConsumerKeys, random: Random): PlannedRequest {
	if (profile === 'abusive') {
		return { method: 'GET', path: `${CATALOG}/items`, apiKey: keyOf(keys, PARTNER, random), body: null, intent: 'abusive' };
	}

	if (profile !== 'mixed') {
		return normalRequest(keys, random);
	}

	const mistake = mistakeFor(random());

	if (mistake === null) {
		return normalRequest(keys, random);
	}

	return mistakeRequest(mistake, keys, random);
}

function pick<T>(items: readonly T[], random: Random): T {
	return items[Math.floor(random() * items.length)];
}

function pickTarget(random: Random): Target {
	const total = WEIGHTED_TARGETS.reduce((sum, entry) => sum + entry.weight, 0);
	let remaining = random() * total;

	for (const entry of WEIGHTED_TARGETS) {
		remaining -= entry.weight;

		if (remaining < 0) {
			return entry.target;
		}
	}

	return WEIGHTED_TARGETS[WEIGHTED_TARGETS.length - 1].target;
}

function keyOf(keys: ConsumerKeys, consumer: string, random: Random): string | null {
	const consumerKeys = keys[consumer] ?? [];

	if (consumerKeys.length === 0) {
		return null;
	}

	return pick(consumerKeys, random);
}

function normalRequest(keys: ConsumerKeys, random: Random): PlannedRequest {
	const target = pickTarget(random);
	const consumers = CONSUMERS_BY_ROUTE[target.routePrefix] ?? [];
	const apiKey = consumers.length === 0 ? null : keyOf(keys, pick(consumers, random), random);

	return { method: target.method, path: target.pathFor(random), apiKey, body: target.body?.() ?? null, intent: 'normal' };
}

function mistakeRequest(intent: RequestIntent, keys: ConsumerKeys, random: Random): PlannedRequest {
	const read = { method: 'GET', body: null, intent } as const;

	if (intent === 'no_key') {
		return { ...read, path: `${ORDERS}?limit=5`, apiKey: null };
	}

	if (intent === 'revoked_key') {
		return { ...read, path: USERS, apiKey: keyOf(keys, REVOKED, random) };
	}

	// partner-x may only call the catalog.
	if (intent === 'forbidden_route') {
		return { ...read, path: ORDERS, apiKey: keyOf(keys, PARTNER, random) };
	}

	return { ...read, path: '/api/nothing-here', apiKey: keyOf(keys, 'web-app', random) };
}

function mistakeFor(roll: number): RequestIntent | null {
	let threshold = 0;

	for (const mistake of MISTAKES) {
		threshold += mistake.chance;

		if (roll < threshold) {
			return mistake.intent;
		}
	}

	return null;
}
