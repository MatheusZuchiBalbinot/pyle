import { describe, expect, it } from 'vitest';

import { buildInstance, TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { LeastConnectionsBalancer } from './least-connections.js';

const [A, B, C] = ['a', 'b', 'c'].map((name) => buildInstance(name));

describe('LeastConnectionsBalancer', () => {
	it('picks the instance with the fewest requests in flight', () => {
		const inFlight = new Map([
			[A.id, 4],
			[B.id, 1],
			[C.id, 2],
		]);
		const balancer = new LeastConnectionsBalancer((id) => inFlight.get(id) ?? 0);

		expect(balancer.select({ service: TEST_SERVICE, candidates: [A, B, C] })).toBe(B);
	});

	it('takes turns among ties', () => {
		const balancer = new LeastConnectionsBalancer((id) => (id === C.id ? 5 : 0));
		const picked = [0, 1, 2, 3].map(() => balancer.select({ service: TEST_SERVICE, candidates: [A, B, C] }).name);

		expect(picked).toEqual(['a', 'b', 'a', 'b']);
	});
});
