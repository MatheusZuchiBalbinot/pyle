import { describe, expect, it, vi } from 'vitest';

import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { buildDiagnosticsTools, groupErrors, type DiagnosticsToolDependencies } from './diagnostics-tools.js';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

function entry(overrides: Partial<RequestLogEntry>): RequestLogEntry {
	return {
		requestId: 'r',
		at: 't',
		method: 'GET',
		path: '/',
		routeId: 'r1',
		routeName: 'Pedidos',
		consumerId: null,
		consumerSlug: null,
		instanceId: 'i2',
		instanceName: 'orders-2',
		status: 503,
		durationMs: 1,
		attempts: 1,
		gatewayError: null,
		...overrides,
	};
}

function build() {
	const scan = vi.fn(async ({ matches }: { matches: (entry: RequestLogEntry) => boolean }) => ({
		entries: [
			entry({}),
			entry({}),
			entry({ status: 200 }),
			entry({ status: 404 }),
			entry({ status: 504, gatewayError: 'upstream_timeout', instanceName: null }),
			entry({ routeId: 'r2', routeName: 'Outra' }),
		].filter(matches),
		nextIndex: null,
	}));
	const dependencies = {
		requestLog: { scan },
		maxLogEntries: 1000,
		activity: {
			listRecent: vi.fn().mockResolvedValue([
				{ entityType: 'instance', summary: 'weight 1 -> 3' },
				{ entityType: 'route', summary: 'created' },
			]),
		},
		alerts: { listOpen: vi.fn().mockResolvedValue([{ id: 'a1' }]) },
		rules: { listAll: vi.fn().mockResolvedValue([{ kind: 'circuit_open' }]) },
		now: () => NOW,
	} as unknown as DiagnosticsToolDependencies;

	return { tools: buildDiagnosticsTools(dependencies), dependencies };
}

describe('diagnostics tools', () => {
	it('groups recent server and gateway errors of a route, most frequent first', async () => {
		const result = JSON.parse(await build().tools[0].run({ routeId: 'r1', limit: 5 }));

		expect(result.sampledEntries).toBe(3);
		expect(result.groups).toEqual([
			{ route: 'Pedidos', instance: 'orders-2', status: 503, gatewayError: null, count: 2, lastAt: 't' },
			{ route: 'Pedidos', instance: '(gateway)', status: 504, gatewayError: 'upstream_timeout', count: 1, lastAt: 't' },
		]);
		await expect(build().tools[0].run({ limit: 100 })).rejects.toThrow('between 1 and 50');
	});

	it('lists config changes since when asked, filtered by entity', async () => {
		const { tools, dependencies } = build();

		const changes = JSON.parse(await tools[1].run({ sinceMinutes: 10, entityType: 'instance' }));

		expect(changes).toEqual([{ entityType: 'instance', summary: 'weight 1 -> 3' }]);
		expect(dependencies.activity.listRecent).toHaveBeenCalledWith(new Date(NOW - 10 * 60_000), 100);
		expect(JSON.parse(await tools[1].run({}))).toHaveLength(2);
	});

	it('hands over the open alerts and the rules', async () => {
		const { tools } = build();

		expect(JSON.parse(await tools[2].run({}))).toEqual([{ id: 'a1' }]);
		expect(JSON.parse(await tools[3].run({}))).toEqual([{ kind: 'circuit_open' }]);
	});

	it('names requests without route', () => {
		expect(groupErrors([entry({ routeName: null })])[0].route).toBe('(no route)');
	});
});
