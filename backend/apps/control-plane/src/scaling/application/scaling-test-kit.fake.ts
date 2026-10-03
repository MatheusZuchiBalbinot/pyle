import type { ServiceInstance } from '@prisma/control-plane-client';
import { vi } from 'vitest';

import type { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { ConfigChangeRecorder } from '../../gateway-config/application/config-change-recorder.js';
import { buildFakeRecorder, buildInstanceRow, buildServiceRow } from '../../gateway-config/application/gateway-config-test-kit.fake.js';
import type { ServicesService } from '../../gateway-config/application/services.service.js';
import type { ManagedInstanceRepository, ScalableService } from '../infrastructure/managed-instance.repository.js';
import { ContainerDriver, InstanceHealthProbe, type ManagedContainer, type ManagedContainerSpec } from './scaling-ports.js';

export class FakeContainerDriver extends ContainerDriver {
	readonly containers = new Map<string, ManagedContainer>();
	readonly started: ManagedContainerSpec[] = [];
	isDockerUp = true;
	startError: Error | null = null;

	async isReachable(): Promise<boolean> {
		return this.isDockerUp;
	}

	async start(spec: ManagedContainerSpec): Promise<void> {
		if (this.startError) {
			throw this.startError;
		}

		this.started.push(spec);
		this.containers.set(spec.containerName, { name: spec.containerName, isRunning: true });
	}

	async remove(containerName: string): Promise<void> {
		this.containers.delete(containerName);
	}

	async listManaged(): Promise<readonly ManagedContainer[]> {
		return [...this.containers.values()];
	}
}

export class FakeHealthProbe extends InstanceHealthProbe {
	isHealthy = true;

	async waitUntilHealthy(): Promise<boolean> {
		return this.isHealthy;
	}
}

const ORDERS: ScalableService = {
	id: 's1',
	slug: 'orders',
	scalingProfile: 'demo_orders',
	desiredManagedReplicas: 0,
	healthCheckPath: '/health',
};

export type ScalingKit = {
	readonly driver: FakeContainerDriver;
	readonly probe: FakeHealthProbe;
	readonly managed: FakeManagedRepository;
	readonly recorder: ConfigChangeRecorder;
};

export class FakeManagedRepository {
	readonly rows = new Map<string, ServiceInstance>();
	service: ScalableService | null = { ...ORDERS };
	private sequence = 0;

	findScalable = vi.fn(async (): Promise<ScalableService | null> => this.service);
	listScalable = vi.fn(async (): Promise<readonly ScalableService[]> => (this.service ? [this.service] : []));
	listManaged = vi.fn(async (): Promise<readonly ServiceInstance[]> => this.active());
	listAllManaged = vi.fn(async (): Promise<readonly ServiceInstance[]> => this.active());
	usedHostPorts = vi.fn(
		async (): Promise<ReadonlySet<number>> => new Set(this.active().flatMap((row) => (row.hostPort === null ? [] : [row.hostPort]))),
	);
	setDesired = vi.fn(async (_serviceId: string, desired: number): Promise<void> => {
		if (this.service) {
			this.service = { ...this.service, desiredManagedReplicas: desired };
		}
	});

	create = vi.fn(async (data: Partial<ServiceInstance>): Promise<ServiceInstance> => {
		this.sequence += 1;
		const createdAt = new Date(Date.UTC(2026, 8, 26, 12, 0, this.sequence));
		const row = buildInstanceRow({ ...data, id: `m${this.sequence}`, createdAt });

		this.rows.set(row.id, row);

		return row;
	});

	update = vi.fn(async (id: string, data: Partial<ServiceInstance>): Promise<ServiceInstance> => {
		const row = { ...(this.rows.get(id) as ServiceInstance), ...data };

		this.rows.set(id, row);

		return row;
	});

	active(): ServiceInstance[] {
		return [...this.rows.values()].filter((row) => row.deletedAt === null);
	}

	asRepository(): ManagedInstanceRepository {
		return this as unknown as ManagedInstanceRepository;
	}
}

export function buildFakePrisma(): ControlPlanePrismaService {
	return { transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work({})) } as unknown as ControlPlanePrismaService;
}

export function buildFakeServices(isScalable = true): ServicesService {
	const row = buildServiceRow({ scalingProfile: isScalable ? 'demo_orders' : null });

	return { findOrThrow: vi.fn().mockResolvedValue(row), get: vi.fn().mockResolvedValue({ slug: 'orders' }) } as unknown as ServicesService;
}

export function buildScalingKit(): ScalingKit {
	return { driver: new FakeContainerDriver(), probe: new FakeHealthProbe(), managed: new FakeManagedRepository(), recorder: buildFakeRecorder() };
}
