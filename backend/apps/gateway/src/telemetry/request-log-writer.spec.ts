import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_LOG_LIST } from '@pyle/shared/contracts/redis-keys.js';

import type { CompletedRequest } from '../contracts/request-observer.js';
import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { REQUEST_LOG_BUFFER_MAX, REQUEST_LOG_FLUSH_MS, RequestLogWriter, type RequestLogRedis } from './request-log-writer.js';

const REQUEST: CompletedRequest = {
	requestId: 'r1',
	startedAtMs: 1000,
	finishedAtMs: 1042,
	method: 'GET',
	path: '/api/orders',
	routeId: 'route-1',
	routeName: 'Pedidos',
	consumerId: 'c1',
	consumerSlug: 'web',
	instanceId: 'i1',
	instanceName: 'orders-1',
	status: 200,
	attempts: 1,
	gatewayError: null,
};

function buildRedis(result: [Error | null, unknown][] | Promise<never> = [[null, 1]]) {
	const commands = { lpush: vi.fn(), ltrim: vi.fn(), exec: vi.fn(() => (result instanceof Promise ? result : Promise.resolve(result))) };

	commands.lpush.mockReturnValue(commands);
	commands.ltrim.mockReturnValue(commands);

	return { redis: { multi: () => commands } as unknown as RequestLogRedis, commands };
}

function build(options: { readonly random?: number; readonly redis?: RequestLogRedis } = {}) {
	const { redis, commands } = buildRedis();
	const lines: string[] = [];
	const writer = new RequestLogWriter({
		redis: options.redis ?? redis,
		maxEntries: 100,
		successSampleRate: 0.1,
		random: () => options.random ?? 0.5,
		logger: new GatewayLogger('gw', (line) => lines.push(line)),
	});

	return { writer, commands, lines };
}

describe('RequestLogWriter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('always logs errors and samples successes', async () => {
		const skipped = build({ random: 0.5 });

		skipped.writer.onRequestCompleted(REQUEST);
		skipped.writer.onRequestCompleted({ ...REQUEST, status: 404 });
		expect(skipped.writer.bufferedCount).toBe(1);

		const sampled = build({ random: 0.05 });

		sampled.writer.onRequestCompleted(REQUEST);
		expect(sampled.writer.bufferedCount).toBe(1);
	});

	it('pushes the buffer in one transaction every half second and trims the list', async () => {
		const { writer, commands } = build({ random: 0 });

		writer.start();
		writer.onRequestCompleted(REQUEST);
		writer.onRequestCompleted({ ...REQUEST, requestId: 'r2' });

		await vi.advanceTimersByTimeAsync(REQUEST_LOG_FLUSH_MS);

		const [key, ...entries] = commands.lpush.mock.calls[0] as string[];

		expect(key).toBe(REQUEST_LOG_LIST);
		expect(entries.map((entry) => JSON.parse(entry))).toEqual([
			{
				requestId: 'r1',
				at: '1970-01-01T00:00:01.000Z',
				method: 'GET',
				path: '/api/orders',
				routeId: 'route-1',
				routeName: 'Pedidos',
				consumerId: 'c1',
				consumerSlug: 'web',
				instanceId: 'i1',
				instanceName: 'orders-1',
				status: 200,
				durationMs: 42,
				attempts: 1,
				gatewayError: null,
			},
			expect.objectContaining({ requestId: 'r2' }),
		]);
		expect(commands.ltrim).toHaveBeenCalledWith(REQUEST_LOG_LIST, 0, 99);
		expect(writer.bufferedCount).toBe(0);
		await writer.stop();
	});

	it('keeps at most the buffer limit, dropping the oldest and saying so', async () => {
		const { writer, lines, commands } = build({ random: 0 });

		for (let index = 0; index <= REQUEST_LOG_BUFFER_MAX; index++) {
			writer.onRequestCompleted({ ...REQUEST, requestId: `r${index}` });
		}

		await writer.flush();

		expect(commands.lpush.mock.calls[0]).toHaveLength(REQUEST_LOG_BUFFER_MAX + 1);
		expect(JSON.parse(commands.lpush.mock.calls[0][1] as string)).toMatchObject({ requestId: 'r1' });
		expect(lines.at(-1)).toContain('buffer full');
	});

	it('drops the entries when Redis fails, either way it fails', async () => {
		for (const failure of [buildRedis([[new Error('OOM'), null]]), buildRedis(Promise.reject(new Error('down')))]) {
			const { writer, lines } = build({ random: 0, redis: failure.redis });

			writer.onRequestCompleted(REQUEST);

			await writer.flush();

			expect(writer.bufferedCount).toBe(0);
			expect(lines.at(-1)).toContain('Could not write the request log');
		}
	});

	it('flushes on stop and schedules nothing after', async () => {
		const { writer, commands } = build({ random: 0 });

		writer.start();
		writer.onRequestCompleted(REQUEST);

		await writer.stop();
		await vi.advanceTimersByTimeAsync(REQUEST_LOG_FLUSH_MS * 4);

		expect(commands.lpush).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
