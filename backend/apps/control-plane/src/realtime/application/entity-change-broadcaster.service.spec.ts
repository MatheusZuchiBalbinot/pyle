import { describe, expect, it, vi } from 'vitest';

import { EntityChangeBus } from '../../control-plane/entity-changes/entity-change-bus.service.js';
import { EntityChangeBroadcaster } from './entity-change-broadcaster.service.js';
import { buildRealtimePublisherFake } from './realtime-publisher.fake.js';

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function build() {
	const bus = new EntityChangeBus();
	const publisher = buildRealtimePublisherFake();

	new EntityChangeBroadcaster(bus, publisher).onModuleInit();

	return { bus, publisher };
}

describe('EntityChangeBroadcaster', () => {
	it('mirrors a configuration write as entity.changed with the row id', async () => {
		const { bus, publisher } = build();

		bus.emit({ model: 'Route', action: 'updated', id: 'r1' });
		await flush();
		expect(publisher.publishToAdmins).toHaveBeenCalledWith({ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1' });
	});

	it('publishes a null id for a write that names no single row', async () => {
		const { bus, publisher } = build();

		bus.emit({ model: 'AlertRuleConfig', action: 'updated', id: null });
		await flush();
		expect(publisher.publishToAdmins).toHaveBeenCalledWith({ type: 'entity.changed', entity: 'AlertRuleConfig', action: 'updated', id: null });
	});

	it('ignores high-churn telemetry tables', async () => {
		const { bus, publisher } = build();

		bus.emit({ model: 'RouteInstanceSample', action: 'created', id: null });
		bus.emit({ model: 'InstanceStateEvent', action: 'created', id: 'e1' });
		await flush();
		expect(publisher.publishToAdmins).not.toHaveBeenCalled();
	});

	it('logs and swallows a publish failure', async () => {
		const { bus, publisher } = build();

		vi.mocked(publisher.publishToAdmins).mockRejectedValueOnce(new Error('broker down'));
		bus.emit({ model: 'Route', action: 'deleted', id: 'r1' });
		await flush();
		expect(publisher.publishToAdmins).toHaveBeenCalledOnce();
	});
});
