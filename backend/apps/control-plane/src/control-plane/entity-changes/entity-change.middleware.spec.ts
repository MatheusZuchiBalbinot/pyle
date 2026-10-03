import type { Prisma } from '@prisma/control-plane-client';
import { describe, expect, it, vi } from 'vitest';

import { EntityChangeBus } from './entity-change-bus.service.js';
import { createEntityChangeMiddleware } from './entity-change.middleware.js';

function buildParams(overrides: Partial<Prisma.MiddlewareParams>): Prisma.MiddlewareParams {
	return { model: 'Route', action: 'update', args: {}, dataPath: [], runInTransaction: false, ...overrides };
}

function run(params: Prisma.MiddlewareParams, result: unknown) {
	const bus = new EntityChangeBus();
	const emitted = vi.fn();

	bus.onChange(emitted);
	const next = vi.fn().mockResolvedValue(result);

	return createEntityChangeMiddleware(bus)(params, next).then((returned) => ({ emitted, next, returned }));
}

describe('createEntityChangeMiddleware', () => {
	it('passes the query through and returns its result untouched', async () => {
		const row = { id: 'r1', name: 'Pedidos' };
		const { returned, next } = await run(buildParams({}), row);

		expect(returned).toBe(row);
		expect(next).toHaveBeenCalledOnce();
	});

	it('announces a write with the id of the returned row', async () => {
		const { emitted } = await run(buildParams({ action: 'update', args: { where: { id: 'r1' } } }), { id: 'r1', name: 'Pedidos' });

		expect(emitted).toHaveBeenCalledWith({ model: 'Route', action: 'updated', id: 'r1' });
	});

	it('falls back to the where clause when the query returns no row', async () => {
		const { emitted } = await run(buildParams({ action: 'updateMany', args: { where: { id: 'r1' } } }), { count: 1 });

		expect(emitted).toHaveBeenCalledWith({ model: 'Route', action: 'updated', id: 'r1' });
	});

	it('announces a write that names no single row with a null id', async () => {
		const { emitted } = await run(buildParams({ model: 'ApiKey', action: 'upsert', args: { where: { keyHash: 'h' } } }), { count: 1 });

		expect(emitted).toHaveBeenCalledWith({ model: 'ApiKey', action: 'updated', id: null });
	});

	it('maps delete variants to `deleted`', async () => {
		const { emitted } = await run(buildParams({ model: 'AiAnalysis', action: 'deleteMany', args: { where: { scope: 'route' } } }), { count: 3 });

		expect(emitted).toHaveBeenCalledWith({ model: 'AiAnalysis', action: 'deleted', id: null });
	});

	it('stays silent for reads and raw queries', async () => {
		const read = await run(buildParams({ action: 'findMany' }), []);
		const raw = await run(buildParams({ model: undefined, action: 'queryRaw' }), []);

		expect(read.emitted).not.toHaveBeenCalled();
		expect(raw.emitted).not.toHaveBeenCalled();
	});

	it('does not announce a write whose query rejected', async () => {
		const bus = new EntityChangeBus();
		const emitted = vi.fn();

		bus.onChange(emitted);
		const next = vi.fn().mockRejectedValue(new Error('unique violation'));

		await expect(createEntityChangeMiddleware(bus)(buildParams({ action: 'create' }), next)).rejects.toThrow('unique violation');
		expect(emitted).not.toHaveBeenCalled();
	});
});
