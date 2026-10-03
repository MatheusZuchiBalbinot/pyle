import type { Redis } from 'ioredis';

import type { GatewayHeartbeat } from '@pyle/shared/contracts/instance-live-state.js';
import { heartbeatKey } from '@pyle/shared/contracts/redis-keys.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { GatewayLogger } from '../infrastructure/gateway-logger.js';

// A heartbeat survives two missed beats before the key expires.
export const HEARTBEAT_TTL_MULTIPLIER = 3;
const LOG_THROTTLE_MS = 60_000;

export type HeartbeatRedis = Pick<Redis, 'set' | 'del'>;

type HeartbeatOptions = {
	readonly redis: HeartbeatRedis;
	readonly gatewayId: string;
	readonly startedAtMs: number;
	readonly intervalMs: number;
	readonly configVersion: () => number | null;
	readonly isRateLimitDegraded: () => boolean;
	readonly now: () => number;
	readonly logger: GatewayLogger;
	// Runs with every beat (the state mirror's full write).
	readonly onBeat: () => Promise<void>;
};

// The control plane's only way to know this gateway is alive.
export class Heartbeat {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight: Promise<void> | null = null;
	private isRunning = false;

	constructor(private readonly options: HeartbeatOptions) {}

	start(): void {
		this.isRunning = true;
		this.beatAndScheduleNext();
	}

	// Says goodbye right away instead of waiting for the key to expire.
	async stop(): Promise<void> {
		this.isRunning = false;
		await this.inFlight;

		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = null;

		try {
			await this.options.redis.del(heartbeatKey(this.options.gatewayId));
		} catch (error) {
			// Best effort: the key expires on its own anyway.
			this.warn(error);
		}
	}

	private beatAndScheduleNext(): void {
		this.inFlight = this.beat().finally(() => {
			this.inFlight = null;

			if (this.isRunning) {
				this.timer = setTimeout(() => this.beatAndScheduleNext(), this.options.intervalMs);
			}
		});
	}

	private async beat(): Promise<void> {
		const now = this.options.now();
		const heartbeat: GatewayHeartbeat = {
			gatewayId: this.options.gatewayId,
			startedAt: new Date(this.options.startedAtMs).toISOString(),
			configVersion: this.options.configVersion() ?? 0,
			isRateLimitDegraded: this.options.isRateLimitDegraded(),
			updatedAt: new Date(now).toISOString(),
		};
		const ttlMs = this.options.intervalMs * HEARTBEAT_TTL_MULTIPLIER;

		try {
			await this.options.redis.set(heartbeatKey(this.options.gatewayId), JSON.stringify(heartbeat), 'PX', ttlMs);
			await this.options.onBeat();
		} catch (error) {
			this.warn(error);
		}
	}

	private warn(error: unknown): void {
		this.options.logger.warnThrottled('heartbeat', LOG_THROTTLE_MS, 'Could not write the heartbeat', { error: toErrorMessage(error) });
	}
}
