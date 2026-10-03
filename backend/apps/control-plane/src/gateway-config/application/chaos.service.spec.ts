import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import { ChaosDisabledError } from '../domain/config-errors.js';
import type { ChaosStateStore } from '../infrastructure/chaos-state.store.js';
import type { DemoChaosClient } from '../infrastructure/demo-chaos.client.js';
import { ChaosService } from './chaos.service.js';
import { buildFakePrisma, buildFakeRecorder, buildInstanceRow, buildServiceRow } from './gateway-config-test-kit.fake.js';
import type { InstancesService } from './instances.service.js';
import type { ServicesService } from './services.service.js';

const CHAOS = { latencyMs: 800, jitterMs: 200, errorRate: 0.3, isDown: false };
const TARGET = { serviceSlug: 'orders', instanceId: 'i1' };
const ACTOR = { email: 'ops@pyle.local' };

function build() {
	const client = { apply: vi.fn().mockResolvedValue(undefined) };
	const store = { save: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) };
	const recorder = buildFakeRecorder();
	const realtimePublisher = buildRealtimePublisherFake();
	const services = { findOrThrow: vi.fn().mockResolvedValue(buildServiceRow()) } as unknown as ServicesService;
	const instances = { findOrThrow: vi.fn().mockResolvedValue(buildInstanceRow()) } as unknown as InstancesService;
	const chaos = new ChaosService(
		buildFakePrisma(),
		services,
		instances,
		client as unknown as DemoChaosClient,
		store as unknown as ChaosStateStore,
		recorder,
		realtimePublisher,
	);

	return { chaos, client, store, recorder, realtimePublisher };
}

describe('ChaosService', () => {
	beforeEach(() => {
		process.env.CHAOS_ALLOWED = 'true';
		process.env.DEMO_CHAOS_TOKEN = 'a-unit-chaos-token-long-enough';
	});

	afterEach(() => {
		delete process.env.CHAOS_ALLOWED;
		delete process.env.DEMO_CHAOS_TOKEN;
	});

	it('applies chaos through the instance, remembers it, audits it and tells the console', async () => {
		const { chaos, client, store, recorder, realtimePublisher } = build();

		await chaos.apply(TARGET, CHAOS, ACTOR);

		expect(client.apply).toHaveBeenCalledWith({ instanceUrl: 'http://localhost:48101', token: 'a-unit-chaos-token-long-enough', chaos: CHAOS });
		expect(store.save).toHaveBeenCalledWith('i1', CHAOS);
		expect(recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ entityType: 'instance', entityName: 'orders-1', detail: { kind: 'chaos', ...CHAOS } }),
			ACTOR,
			expect.anything(),
		);
		expect(recorder.announce).not.toHaveBeenCalled();
		expect(realtimePublisher.publishToAdmins).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'chaos.changed', instanceName: 'orders-1', chaos: CHAOS }),
		);
	});

	it('refuses when chaos is not allowed', async () => {
		process.env.CHAOS_ALLOWED = 'false';
		const { chaos, client } = build();

		await expect(chaos.apply(TARGET, CHAOS, ACTOR)).rejects.toThrow(ChaosDisabledError);
		expect(client.apply).not.toHaveBeenCalled();
	});

	it('clears chaos by applying none and forgetting it', async () => {
		const { chaos, client, store } = build();

		const cleared = await chaos.clear(TARGET, ACTOR);

		expect(cleared).toEqual({ latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false });
		expect(client.apply).toHaveBeenCalledWith(expect.objectContaining({ chaos: cleared }));
		expect(store.clear).toHaveBeenCalledWith('i1');
	});
});
