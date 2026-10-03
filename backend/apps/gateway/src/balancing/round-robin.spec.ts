import { describe, expect, it } from 'vitest';

import { buildInstance, TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { RoundRobinBalancer } from './round-robin.js';

const [A, B, C] = ['a', 'b', 'c'].map((name) => buildInstance(name));

describe('RoundRobinBalancer', () => {
	it('takes turns in order', () => {
		const balancer = new RoundRobinBalancer();

		const picks = Array.from({ length: 6 }, () => balancer.select({ service: TEST_SERVICE, candidates: [A, B, C] }).name);

		expect(picks).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
	});

	it('keeps turning over whatever candidates are left', () => {
		const balancer = new RoundRobinBalancer();

		balancer.select({ service: TEST_SERVICE, candidates: [A, B, C] });
		const picks = Array.from({ length: 4 }, () => balancer.select({ service: TEST_SERVICE, candidates: [A, C] }).name);

		expect(picks).toEqual(['c', 'a', 'c', 'a']);
	});
});
