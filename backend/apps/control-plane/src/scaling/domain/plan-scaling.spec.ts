import type { ManagedInstanceState } from '@prisma/control-plane-client';
import { describe, expect, it } from 'vitest';

import { planScaling, type ManagedInstanceView } from './plan-scaling.js';

function instance(id: string, scalingState: ManagedInstanceState, minute: number): ManagedInstanceView {
	return { id, scalingState, createdAt: new Date(Date.UTC(2026, 8, 26, 12, minute)) };
}

describe('planScaling', () => {
	it('creates what is missing', () => {
		expect(planScaling({ desired: 2, instances: [] })).toEqual([{ kind: 'create' }, { kind: 'create' }]);
	});

	it('removes the newest first when scaling down', () => {
		const instances = [instance('old', 'running', 1), instance('newest', 'running', 3), instance('middle', 'provisioning', 2)];

		expect(planScaling({ desired: 1, instances })).toEqual([
			{ kind: 'remove', instanceId: 'newest' },
			{ kind: 'remove', instanceId: 'middle' },
		]);
	});

	it('does nothing when the count already matches', () => {
		expect(planScaling({ desired: 1, instances: [instance('a', 'running', 1)] })).toEqual([]);
	});

	it('cleans failed instances up and does not count them, nor draining ones', () => {
		const instances = [instance('broken', 'failed', 1), instance('leaving', 'draining', 2), instance('ok', 'running', 3)];

		expect(planScaling({ desired: 2, instances })).toEqual([{ kind: 'remove', instanceId: 'broken' }, { kind: 'create' }]);
	});

	it('scales to zero', () => {
		expect(planScaling({ desired: 0, instances: [instance('a', 'running', 1)] })).toEqual([{ kind: 'remove', instanceId: 'a' }]);
	});
});
