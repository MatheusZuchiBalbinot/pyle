import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstanceReconciler } from './instance-reconciler.js';
import { buildFakePrisma, buildFakeServices, buildScalingKit, type ScalingKit } from './scaling-test-kit.fake.js';
import { ScalingService } from './scaling.service.js';

function build(kit: ScalingKit): { readonly reconciler: InstanceReconciler; readonly scaling: ScalingService } {
	const scaling = new ScalingService(buildFakePrisma(), kit.managed.asRepository(), buildFakeServices(), kit.recorder, kit.driver, kit.probe);

	return { reconciler: new InstanceReconciler(scaling, kit.managed.asRepository(), kit.driver), scaling };
}

async function withOneRunningReplica(kit: ScalingKit, scaling: ScalingService): Promise<string> {
	kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 1 };
	await scaling.runExclusive(() => scaling.converge('s1'));

	return kit.managed.active()[0]?.containerName ?? '';
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe('InstanceReconciler', () => {
	it('skips a round while Docker is unreachable', async () => {
		const kit = buildScalingKit();

		kit.driver.isDockerUp = false;

		await build(kit).reconciler.scheduleRun();

		expect(kit.managed.listAllManaged).not.toHaveBeenCalled();
	});

	it('removes a managed container nobody owns', async () => {
		const kit = buildScalingKit();

		kit.driver.containers.set('pyle-managed-orders-old', { name: 'pyle-managed-orders-old', isRunning: true });

		await build(kit).reconciler.scheduleRun();

		expect(kit.driver.containers.has('pyle-managed-orders-old')).toBe(false);
	});

	it('replaces an instance whose container died', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'true');
		const kit = buildScalingKit();
		const { reconciler, scaling } = build(kit);
		const deadName = await withOneRunningReplica(kit, scaling);

		kit.driver.containers.set(deadName, { name: deadName, isRunning: false });

		await reconciler.scheduleRun();

		const [replacement] = kit.managed.active();

		expect(kit.managed.active()).toHaveLength(1);
		expect(replacement?.containerName).not.toBe(deadName);
		expect(kit.driver.containers.has(deadName)).toBe(false);
	});

	it('finishes what a restart left half done', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'true');
		const kit = buildScalingKit();
		const { reconciler, scaling } = build(kit);

		await withOneRunningReplica(kit, scaling);
		const [instance] = kit.managed.active();

		kit.managed.rows.set(instance!.id, { ...instance!, scalingState: 'draining' });
		kit.managed.service = { ...kit.managed.service!, desiredManagedReplicas: 0 };

		await reconciler.scheduleRun();

		expect(kit.managed.active()).toEqual([]);
		expect(kit.driver.containers.size).toBe(0);
	});

	it('discards an instance left provisioning', async () => {
		const kit = buildScalingKit();

		await kit.managed.create({ source: 'managed', scalingState: 'provisioning', containerName: 'pyle-managed-orders-x' });

		await build(kit).reconciler.scheduleRun();

		expect(kit.managed.active()).toEqual([]);
	});

	it('logs a container it cannot remove and carries on', async () => {
		const kit = buildScalingKit();

		kit.driver.containers.set('pyle-managed-orders-old', { name: 'pyle-managed-orders-old', isRunning: true });
		kit.driver.remove = vi.fn().mockRejectedValue(new Error('daemon busy'));

		await build(kit).reconciler.scheduleRun();

		expect(kit.managed.listScalable).toHaveBeenCalled();
	});

	it('runs on a timer only where scaling is enabled, and stops with the module', async () => {
		vi.useFakeTimers();
		const kit = buildScalingKit();
		const { reconciler } = build(kit);

		vi.stubEnv('SCALING_ALLOWED', 'false');
		reconciler.onModuleInit();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(kit.managed.listScalable).not.toHaveBeenCalled();

		vi.stubEnv('SCALING_ALLOWED', 'true');
		vi.stubEnv('INSTANCE_RECONCILIATION_INTERVAL_MS', '1000');
		reconciler.onModuleInit();
		await vi.advanceTimersByTimeAsync(1000);
		expect(kit.managed.listScalable).toHaveBeenCalledTimes(2);

		reconciler.onModuleDestroy();
		await vi.advanceTimersByTimeAsync(5000);
		expect(kit.managed.listScalable).toHaveBeenCalledTimes(2);
	});
});
