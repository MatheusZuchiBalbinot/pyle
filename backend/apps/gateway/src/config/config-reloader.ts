import type { GatewayConfigSnapshot } from '@pyle/shared/contracts/config-snapshot.js';
import { parseConfigChangedMessage, type ConfigChangedMessage } from '@pyle/shared/contracts/gateway-events.js';
import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { GatewayLogger } from '../infrastructure/gateway-logger.js';
import type { RouteTable } from '../routing/route-table.js';
import type { ConfigStore } from './config-store.js';

// A burst of writes (a consumer created with its key and grants) becomes
// one reload instead of three.
export const CONFIG_RELOAD_DEBOUNCE_MS = 200;

export type ConfigSubscriber = {
	subscribe(channel: string): Promise<unknown>;
	unsubscribe(channel: string): Promise<unknown>;
	on(event: 'message', listener: (channel: string, message: string) => void): unknown;
	off(event: 'message', listener: (channel: string, message: string) => void): unknown;
};

export type ConfigReloaderOptions = {
	readonly load: () => Promise<GatewayConfigSnapshot>;
	readonly store: ConfigStore;
	readonly subscriber: ConfigSubscriber;
	readonly logger: GatewayLogger;
	// Full reload period: the fallback for a missed pub/sub message.
	readonly refreshMs: number;
	// After every successful swap (reset per-service state, sync health checks).
	readonly onApplied: (table: RouteTable) => void;
	// Every valid change message, before its reload (drop cached API keys).
	readonly onChangeMessage: (message: ConfigChangedMessage) => void;
};

// Reloads on every change message (debounced) and on a timer; a failed reload keeps the
// previous configuration.
export class ConfigReloader {
	private debounceTimer: NodeJS.Timeout | null = null;
	private refreshTimer: NodeJS.Timeout | null = null;
	private reloadInFlight: Promise<boolean> | null = null;

	constructor(private readonly options: ConfigReloaderOptions) {}

	async start(): Promise<void> {
		this.options.subscriber.on('message', this.handleMessage);
		await this.options.subscriber.subscribe(CONFIG_CHANGED_CHANNEL);
		this.refreshTimer = setInterval(() => void this.reloadNow(), this.options.refreshMs);
		this.refreshTimer.unref();
	}

	async stop(): Promise<void> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
		}

		this.debounceTimer = null;
		this.refreshTimer = null;
		this.options.subscriber.off('message', this.handleMessage);
		await this.options.subscriber.unsubscribe(CONFIG_CHANGED_CHANNEL).catch(() => {
			// Already disconnected: nothing left to unsubscribe from.
		});
	}

	// Resolves true when a new configuration is in place. Concurrent calls
	// share one load.
	reloadNow(): Promise<boolean> {
		this.reloadInFlight ??= this.reload().finally(() => {
			this.reloadInFlight = null;
		});

		return this.reloadInFlight;
	}

	private async reload(): Promise<boolean> {
		try {
			const snapshot = await this.options.load();
			const table = this.options.store.replace(snapshot);

			this.options.onApplied(table);

			return true;
		} catch (error) {
			this.options.logger.error('Configuration reload failed; still serving the previous one', { error: toErrorMessage(error) });

			return false;
		}
	}

	private readonly handleMessage = (channel: string, raw: string): void => {
		if (channel !== CONFIG_CHANGED_CHANNEL) {
			return;
		}

		const message = parseConfigChangedMessage(raw);

		if (!message) {
			this.options.logger.warn('Ignoring a malformed configuration change message', { rawMessage: raw.slice(0, 200) });

			return;
		}

		this.options.onChangeMessage(message);
		this.scheduleReload();
	};

	private scheduleReload(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.reloadNow();
		}, CONFIG_RELOAD_DEBOUNCE_MS);
	}
}
