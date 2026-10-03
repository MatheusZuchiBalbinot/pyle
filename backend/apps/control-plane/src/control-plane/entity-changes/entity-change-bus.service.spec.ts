import { describe, expect, it, vi } from 'vitest';

import { EntityChangeBus } from './entity-change-bus.service.js';
import type { EntityChange } from './entity-change.js';

const ROUTE_UPDATED: EntityChange = { model: 'Route', action: 'updated', id: 'r1' };
const ALERT_UPDATED: EntityChange = { model: 'GatewayAlert', action: 'updated', id: 'a1' };

describe('EntityChangeBus', () => {
	it('dispatches a change to every listener, synchronously', () => {
		const bus = new EntityChangeBus();
		const first = vi.fn();
		const second = vi.fn();

		bus.onChange(first);
		bus.onChange(second);

		bus.emit(ROUTE_UPDATED);

		expect(first).toHaveBeenCalledWith(ROUTE_UPDATED);
		expect(second).toHaveBeenCalledWith(ROUTE_UPDATED);
	});

	it('onModelChange only sees the models it asked for', () => {
		const bus = new EntityChangeBus();
		const listener = vi.fn();

		bus.onModelChange(['Route'], listener);

		bus.emit(ALERT_UPDATED);
		bus.emit(ROUTE_UPDATED);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(ROUTE_UPDATED);
	});

	it('a throwing listener does not stop the others', () => {
		const bus = new EntityChangeBus();
		const survivor = vi.fn();

		bus.onChange(() => {
			throw new Error('boom');
		});
		bus.onChange(survivor);

		expect(() => bus.emit(ROUTE_UPDATED)).not.toThrow();
		expect(survivor).toHaveBeenCalledOnce();
	});

	it('unsubscribing stops delivery', () => {
		const bus = new EntityChangeBus();
		const listener = vi.fn();
		const unsubscribe = bus.onChange(listener);

		unsubscribe();

		bus.emit(ROUTE_UPDATED);

		expect(listener).not.toHaveBeenCalled();
	});

	it('holds back changes emitted inside runAfterCommit until the work resolves', async () => {
		const bus = new EntityChangeBus();
		const listener = vi.fn();

		bus.onChange(listener);

		await bus.runAfterCommit(async () => {
			bus.emit(ROUTE_UPDATED);
			bus.emit(ALERT_UPDATED);
			expect(listener).not.toHaveBeenCalled();
		});

		expect(listener.mock.calls.map((call) => call[0])).toEqual([ROUTE_UPDATED, ALERT_UPDATED]);
	});

	it('drops the buffered changes when the work rejects (rolled back)', async () => {
		const bus = new EntityChangeBus();
		const listener = vi.fn();

		bus.onChange(listener);

		const work = bus.runAfterCommit(async () => {
			bus.emit(ROUTE_UPDATED);
			throw new Error('rollback');
		});

		await expect(work).rejects.toThrow('rollback');
		expect(listener).not.toHaveBeenCalled();
	});
});
