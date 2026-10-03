import { describe, expect, it } from 'vitest';

import { planRequest, type ConsumerKeys, type RequestIntent } from './request-plan.js';

const KEYS: ConsumerKeys = {
	'web-app': ['k-web'],
	'mobile-app': ['k-mobile-1', 'k-mobile-2'],
	'partner-x': ['k-partner'],
	'internal-batch': ['k-batch'],
	'revoked-demo': ['k-revoked'],
};

// Deterministic and evenly spread over [0, 1).
function sequenceRandom(): () => number {
	let state = 7;

	return () => {
		state = (state * 48_271) % 2_147_483_647;

		return state / 2_147_483_647;
	};
}

function plan(profile: 'steady' | 'mixed' | 'abusive', count: number) {
	const random = sequenceRandom();

	return Array.from({ length: count }, () => planRequest(profile, KEYS, random));
}

describe('planRequest', () => {
	it('sends mostly reads, about 10% order creations, always with a key the route accepts', () => {
		const requests = plan('steady', 10_000);
		const posts = requests.filter((request) => request.method === 'POST');
		const reads = requests.filter((request) => request.method === 'GET' && !request.path.startsWith('/api/public'));

		expect(posts.length / requests.length).toBeCloseTo(0.1, 1);
		expect(reads.length / requests.length).toBeGreaterThan(0.8);
		expect(posts.every((request) => request.path === '/api/orders' && request.body !== null)).toBe(true);
		const ordersKeys = new Set(requests.filter((request) => request.path.startsWith('/api/orders')).map((request) => request.apiKey));

		expect(ordersKeys.has('k-partner')).toBe(false);
		expect(requests.filter((request) => request.path === '/api/public/health').every((request) => request.apiKey === null)).toBe(true);
	});

	it('mixes in the deliberate mistakes in their proportions', () => {
		const requests = plan('mixed', 20_000);
		const share = (intent: RequestIntent) => requests.filter((request) => request.intent === intent).length / requests.length;

		expect(share('no_key')).toBeCloseTo(0.01, 2);
		expect(share('revoked_key')).toBeCloseTo(0.005, 2);
		expect(share('forbidden_route')).toBeCloseTo(0.01, 2);
		expect(share('unknown_path')).toBeCloseTo(0.005, 2);
		expect(requests.find((request) => request.intent === 'revoked_key')?.apiKey).toBe('k-revoked');
		expect(requests.find((request) => request.intent === 'forbidden_route')).toMatchObject({ path: '/api/orders', apiKey: 'k-partner' });
		expect(requests.find((request) => request.intent === 'no_key')?.apiKey).toBeNull();
	});

	it('has partner-x hammer the catalog when abusive', () => {
		expect(plan('abusive', 5).every((request) => request.apiKey === 'k-partner' && request.path === '/api/catalog/items')).toBe(true);
	});

	it('sends no key for a consumer the manifest does not have', () => {
		const random = sequenceRandom();

		expect(planRequest('abusive', {}, random).apiKey).toBeNull();
	});
});
