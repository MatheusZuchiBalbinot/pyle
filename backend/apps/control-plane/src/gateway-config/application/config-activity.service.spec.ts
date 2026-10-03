import { describe, expect, it, vi } from 'vitest';

import type { ConfigChangeEventRepository } from '../infrastructure/config-change-event.repository.js';
import { ConfigActivityService } from './config-activity.service.js';

const EVENT = {
	id: 'e1',
	entityType: 'route',
	entityId: 'r1',
	entityName: 'Pedidos',
	action: 'updated',
	summary: 'timeoutMs none -> 2000',
	detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] },
	actorEmail: null,
	occurredAt: new Date('2026-09-25T10:00:00.000Z'),
};

describe('ConfigActivityService', () => {
	it('pages the audit trail as DTOs', async () => {
		const events = { listPage: vi.fn().mockResolvedValue({ items: [EVENT], nextCursor: 'next' }) };

		const page = await new ConfigActivityService(events as unknown as ConfigChangeEventRepository).list(
			{ entityType: 'route' },
			{ cursor: null, limit: 5 },
		);

		expect(page).toEqual({ items: [{ ...EVENT, occurredAt: '2026-09-25T10:00:00.000Z' }], nextCursor: 'next' });
	});

	it('lists what changed since a moment, newest first', async () => {
		const since = new Date('2026-09-25T09:00:00.000Z');
		const events = { listSince: vi.fn().mockResolvedValue([EVENT]) };

		const recent = await new ConfigActivityService(events as unknown as ConfigChangeEventRepository).listRecent(since, 20);

		expect(events.listSince).toHaveBeenCalledWith(since, 20);
		expect(recent).toHaveLength(1);
	});
});
