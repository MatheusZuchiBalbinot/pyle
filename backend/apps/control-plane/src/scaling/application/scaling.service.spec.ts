import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeChangeDetail } from '../../gateway-config/domain/config-change-detail.js';
import { ConfigConflictError } from '../../gateway-config/domain/config-errors.js';
import { MANAGED_PORT_RANGE, SCALE_DOWN_DRAIN_MS } from '../domain/scaling-limits.js';
import { buildFakePrisma, buildFakeServices, buildScalingKit, type ScalingKit } from './scaling-test-kit.fake.js';
import { ScalingService } from './scaling.service.js';

const ACTOR = { email: 'ops@pyle.local' };

function build(kit: ScalingKit, isScalable = true): ScalingService {
	return new ScalingService(buildFakePrisma(), kit.managed.asRepository(), buildFakeServices(isScalable), kit.recorder, kit.driver, kit.probe);
}

async function idle(scaling: ScalingService): Promise<void> {
	await scaling.runExclusive(async () => undefined);
}

function recordedSummaries(kit: ScalingKit): readonly string[] {
	return vi.mocked(kit.recorder.record).mock.calls.map(([change]) => describeChangeDetail(change.detail));
}

beforeEach(() => {
	vi.stubEnv('SCALING_ALLOWED', 'true');
	vi.stubEnv('INSTANCE_CONTAINER_HOST', 'localhost');
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe('ScalingService.setReplicas', () => {
	it('is refused where scaling is off', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'false');
		await expect(build(buildScalingKit()).setReplicas('orders', 2, ACTOR)).rejects.toThrow(ConfigConflictError);
	});

	it('is refused for a service without a scaling profile', async () => {
		await expect(build(buildScalingKit(), false).setReplicas('orders', 2, ACTOR)).rejects.toThrow('no scaling profile');
	});

	it('is refused, saying why, while Docker is unreachable', async () => {
		const kit = buildScalingKit();

		kit.driver.isDockerUp = false;

		await expect(build(kit).setReplicas('orders', 2, ACTOR)).rejects.toThrow('cannot reach Docker');
		expect(kit.managed.setDesired).not.toHaveBeenCalled();
	});

	it('records the wanted count, then brings healthy containers up in the background', async () => {
		const kit = buildScalingKit();
		const scaling = build(kit);

		await expect(scaling.setReplicas('orders', 2, ACTOR)).resolves.toEqual({ slug: 'orders' });
		await idle(scaling);

		expect(kit.managed.setDesired).toHaveBeenCalledWith('s1', 2, {});
		expect(vi.mocked(kit.recorder.record).mock.calls[0]).toEqual([
			expect.objectContaining({ detail: { kind: 'managed_replicas', from: 0, to: 2 } }),
			ACTOR,
			{},
		]);
		expect(kit.driver.started.map((spec) => [spec.hostPort, spec.demoServiceName])).toEqual([
			[MANAGED_PORT_RANGE.min, 'orders'],
			[MANAGED_PORT_RANGE.min + 1, 'orders'],
		]);
		expect(kit.managed.active().map((row) => [row.scalingState, row.isEnabled, row.source, row.url])).toEqual([
			['running', true, 'managed', `http://localhost:${MANAGED_PORT_RANGE.min}`],
			['running', true, 'managed', `http://localhost:${MANAGED_PORT_RANGE.min + 1}`],
		]);
		expect(kit.recorder.announce).toHaveBeenCalledTimes(5);
	});

	it('records nothing when the count does not change, but still converges', async () => {
		const kit = buildScalingKit();
		const scaling = build(kit);

		await scaling.setReplicas('orders', 0, ACTOR);
		await idle(scaling);

		expect(kit.managed.setDesired).not.toHaveBeenCalled();
		expect(kit.managed.findScalable).toHaveBeenCalled();
	});

	it('converges to the last request when two arrive back to back', async () => {
		const kit = buildScalingKit();
		const scaling = build(kit);

		await scaling.setReplicas('orders', 1, ACTOR);
		await scaling.setReplicas('orders', 3, ACTOR);
		await idle(scaling);

		expect(kit.managed.active()).toHaveLength(3);
	});
});

describe('ScalingService.converge', () => {
	it('discards an instance that never answers its health check', async () => {
		const kit = buildScalingKit();

		kit.probe.isHealthy = false;
		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 1 };
		const scaling = build(kit);

		await scaling.runExclusive(() => scaling.converge('s1'));

		expect(kit.managed.active()).toEqual([]);
		expect(kit.driver.containers.size).toBe(0);
		expect([...kit.managed.rows.values()][0]).toMatchObject({ scalingState: 'failed', isEnabled: false });
		expect(recordedSummaries(kit).at(-1)).toMatch(/^failed: no healthy answer/);
	});

	it('discards an instance whose container does not start', async () => {
		const kit = buildScalingKit();

		kit.driver.startError = new Error('port is already allocated');
		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 1 };
		const scaling = build(kit);

		await scaling.runExclusive(() => scaling.converge('s1'));

		expect(recordedSummaries(kit).at(-1)).toBe('failed: container did not start: port is already allocated');
	});

	it('drains the newest instance before removing it', async () => {
		const kit = buildScalingKit();

		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 2 };
		const scaling = build(kit);

		await scaling.runExclusive(() => scaling.converge('s1'));
		const [oldest, newest] = kit.managed.active();

		kit.managed.service = { ...kit.managed.service, desiredManagedReplicas: 1 };
		vi.useFakeTimers();

		const run = scaling.runExclusive(() => scaling.converge('s1'));

		await vi.advanceTimersByTimeAsync(0);
		expect(kit.managed.rows.get(newest.id)).toMatchObject({ scalingState: 'draining', isEnabled: false, deletedAt: null });
		expect(kit.driver.containers.has(newest.containerName ?? '')).toBe(true);

		await vi.advanceTimersByTimeAsync(SCALE_DOWN_DRAIN_MS);
		await run;

		expect(kit.managed.active().map((row) => row.id)).toEqual([oldest.id]);
		expect(kit.driver.containers.has(newest.containerName ?? '')).toBe(false);
	});

	it('does nothing for a service that is gone or no longer scalable', async () => {
		const kit = buildScalingKit();

		kit.managed.service = null;
		const scaling = build(kit);

		await scaling.runExclusive(() => scaling.converge('s1'));

		expect(kit.managed.listManaged).not.toHaveBeenCalled();
	});

	it('stops, logged, when no port is left', async () => {
		const kit = buildScalingKit();
		const allPorts = Array.from({ length: MANAGED_PORT_RANGE.max - MANAGED_PORT_RANGE.min + 1 }, (_, index) => MANAGED_PORT_RANGE.min + index);

		kit.managed.usedHostPorts.mockResolvedValue(new Set(allPorts));
		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 1 };
		const scaling = build(kit);

		await expect(scaling.runExclusive(() => scaling.converge('s1'))).resolves.toBeUndefined();

		expect(kit.managed.create).not.toHaveBeenCalled();
	});

	it('keeps going when a container cannot be removed (the reconciler retries)', async () => {
		const kit = buildScalingKit();

		kit.probe.isHealthy = false;
		kit.driver.remove = vi.fn().mockRejectedValue(new Error('daemon busy'));
		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 1 };
		const scaling = build(kit);

		await scaling.runExclusive(() => scaling.converge('s1'));

		expect([...kit.managed.rows.values()][0]).toMatchObject({ scalingState: 'failed' });
	});
});
