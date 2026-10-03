import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { buildTestSnapshot } from '../testing/build-test-snapshot.js';
import { CONFIG_RELOAD_DEBOUNCE_MS, ConfigReloader, type ConfigSubscriber } from './config-reloader.js';
import { ConfigStore } from './config-store.js';

type MessageListener = (channel: string, message: string) => void;

function buildSubscriber() {
	const listeners = new Set<MessageListener>();
	const subscriber: ConfigSubscriber = {
		subscribe: vi.fn().mockResolvedValue(1),
		unsubscribe: vi.fn().mockResolvedValue(1),
		on: vi.fn((_event: 'message', listener: MessageListener) => listeners.add(listener)),
		off: vi.fn((_event: 'message', listener: MessageListener) => listeners.delete(listener)),
	};

	return { subscriber, deliver: (channel: string, message: string) => listeners.forEach((listener) => listener(channel, message)) };
}

function build(load = vi.fn().mockResolvedValue(buildTestSnapshot())) {
	const { subscriber, deliver } = buildSubscriber();
	const store = new ConfigStore();
	const onApplied = vi.fn();
	const onChangeMessage = vi.fn();
	const lines: string[] = [];
	const logger = new GatewayLogger('gw', (line) => lines.push(line));
	const reloader = new ConfigReloader({ load, store, subscriber, logger, refreshMs: 30_000, onApplied, onChangeMessage });

	return { reloader, store, load, onApplied, onChangeMessage, subscriber, deliver, lines };
}

const CHANGE = JSON.stringify({ entity: 'route', id: 'r1', action: 'updated' });

describe('ConfigReloader', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads and swaps the configuration, then tells the gateway', async () => {
		const { reloader, store, onApplied } = build();

		expect(await reloader.reloadNow()).toBe(true);

		expect(store.current()?.snapshot.version).toBe(1);
		expect(onApplied).toHaveBeenCalledWith(store.current());
	});

	it('keeps the previous configuration when a reload fails', async () => {
		const load = vi.fn().mockResolvedValueOnce(buildTestSnapshot()).mockRejectedValueOnce(new Error('db down'));
		const { reloader, store, lines } = build(load);

		await reloader.reloadNow();
		const previous = store.current();

		expect(await reloader.reloadNow()).toBe(false);

		expect(store.current()).toBe(previous);
		expect(lines.at(-1)).toContain('db down');
	});

	it('shares one load between concurrent reloads', async () => {
		const { reloader, load } = build();

		await Promise.all([reloader.reloadNow(), reloader.reloadNow()]);

		expect(load).toHaveBeenCalledTimes(1);
	});

	it('reloads once for a burst of change messages', async () => {
		const { reloader, load, onChangeMessage, deliver, subscriber } = build();

		await reloader.start();
		expect(subscriber.subscribe).toHaveBeenCalledWith(CONFIG_CHANGED_CHANNEL);

		deliver(CONFIG_CHANGED_CHANNEL, CHANGE);
		deliver(CONFIG_CHANGED_CHANNEL, CHANGE);
		await vi.advanceTimersByTimeAsync(CONFIG_RELOAD_DEBOUNCE_MS);

		expect(onChangeMessage).toHaveBeenCalledTimes(2);
		expect(load).toHaveBeenCalledTimes(1);
		await reloader.stop();
	});

	it('ignores other channels and warns about garbage', async () => {
		const { reloader, load, deliver, lines } = build();

		await reloader.start();

		deliver('another-channel', CHANGE);
		deliver(CONFIG_CHANGED_CHANNEL, '{garbage');
		await vi.advanceTimersByTimeAsync(CONFIG_RELOAD_DEBOUNCE_MS);

		expect(load).not.toHaveBeenCalled();
		expect(lines.at(-1)).toContain('malformed');
		await reloader.stop();
	});

	it('reloads on its own timer as a fallback', async () => {
		const { reloader, load } = build();

		await reloader.start();

		await vi.advanceTimersByTimeAsync(30_000);

		expect(load).toHaveBeenCalledTimes(1);
		await reloader.stop();
	});

	it('stops cleanly: no timer left, no further reloads, unsubscribe failures tolerated', async () => {
		const { reloader, load, deliver, subscriber } = build();

		await reloader.start();
		deliver(CONFIG_CHANGED_CHANNEL, CHANGE);
		vi.mocked(subscriber.unsubscribe).mockRejectedValue(new Error('closed'));

		await reloader.stop();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(load).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});
