import { describe, expect, it } from 'vitest';

import { GatewayLogger } from './gateway-logger.js';

function build(startAt = 0) {
	const lines: Record<string, unknown>[] = [];
	let now = startAt;
	const logger = new GatewayLogger(
		'gw-test',
		(line) => lines.push(JSON.parse(line) as Record<string, unknown>),
		() => now,
	);

	return { logger, lines, advance: (ms: number) => (now += ms) };
}

describe('GatewayLogger', () => {
	it('writes one JSON line per entry, with level, time and gateway id', () => {
		const { logger, lines } = build();

		logger.info('started', { port: 8080 });
		logger.error('boom');

		expect(lines).toEqual([
			{ level: 'info', time: '1970-01-01T00:00:00.000Z', gatewayId: 'gw-test', message: 'started', port: 8080 },
			{ level: 'error', time: '1970-01-01T00:00:00.000Z', gatewayId: 'gw-test', message: 'boom' },
		]);
	});

	it('never lets a field overwrite the entry itself', () => {
		const { logger, lines } = build();

		logger.warn('real message', { message: 'from a field', level: 'debug' });

		expect(lines[0]).toMatchObject({ level: 'warn', message: 'real message' });
	});

	it('throttles a repeating warning per key', () => {
		const { logger, lines, advance } = build();

		logger.warnThrottled('redis', 60_000, 'redis down');
		advance(1000);
		logger.warnThrottled('redis', 60_000, 'redis down');
		logger.warnThrottled('other', 60_000, 'other');
		advance(60_000);
		logger.warnThrottled('redis', 60_000, 'redis down');

		expect(lines.map((line) => line.message)).toEqual(['redis down', 'other', 'redis down']);
	});

	it('writes to stdout by default', () => {
		expect(() => new GatewayLogger('gw').info('hello from the logger spec')).not.toThrow();
	});
});
