import { describe, expect, it } from 'vitest';

import { createGatewayPrisma, withConnectionLimit } from './gateway-prisma.js';

describe('gateway prisma', () => {
	it('caps the pool unless the URL already says otherwise', () => {
		expect(withConnectionLimit('postgresql://u:p@localhost:5432/db')).toBe('postgresql://u:p@localhost:5432/db?connection_limit=5');
		expect(withConnectionLimit('postgresql://u:p@localhost:5432/db?connection_limit=9')).toBe(
			'postgresql://u:p@localhost:5432/db?connection_limit=9',
		);
	});

	it('builds a client without connecting', async () => {
		const client = createGatewayPrisma('postgresql://u:p@localhost:5432/db');

		await client.$disconnect();
	});
});
