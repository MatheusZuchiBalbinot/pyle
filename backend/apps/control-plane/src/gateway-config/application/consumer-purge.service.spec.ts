import { describe, expect, it, vi } from 'vitest';

import type { ConsumerRepository } from '../infrastructure/consumer.repository.js';
import { ConsumerPurgeService } from './consumer-purge.service.js';

const CUTOFF = new Date('2026-08-26T00:00:00.000Z');

describe('ConsumerPurgeService', () => {
	it('purges each expired consumer and keeps going past one that fails', async () => {
		const consumers = {
			listDeletedBefore: vi.fn().mockResolvedValue([
				{ id: 'c1', slug: 'old-a' },
				{ id: 'c2', slug: 'old-b' },
				{ id: 'c3', slug: 'old-c' },
			]),
			purge: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(undefined),
		};

		const purged = await new ConsumerPurgeService(consumers as unknown as ConsumerRepository).purgeDeletedBefore(CUTOFF);

		expect(consumers.listDeletedBefore).toHaveBeenCalledWith(CUTOFF);
		expect(purged).toEqual(['old-a', 'old-c']);
	});
});
