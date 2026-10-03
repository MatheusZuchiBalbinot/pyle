import type { Redis } from 'ioredis';

import { REQUEST_LOG_LIST } from '@pyle/shared/contracts/redis-keys.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { CompletedRequest, RequestObserver } from '../contracts/request-observer.js';
import type { GatewayLogger } from '../infrastructure/gateway-logger.js';

export const REQUEST_LOG_FLUSH_MS = 500;
// Entries held while Redis is slow or down; past it the oldest go.
export const REQUEST_LOG_BUFFER_MAX = 2000;
const ERROR_STATUS_FLOOR = 400;
const LOG_THROTTLE_MS = 60_000;

export type RequestLogRedis = Pick<Redis, 'multi'>;

type RequestLogWriterOptions = {
	readonly redis: RequestLogRedis;
	readonly maxEntries: number;
	// Fraction of successful requests logged (every error is).
	readonly successSampleRate: number;
	readonly random: () => number;
	readonly logger: GatewayLogger;
};

export class RequestLogWriter implements RequestObserver {
	private buffer: RequestLogEntry[] = [];
	private droppedCount = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private isRunning = false;

	constructor(private readonly options: RequestLogWriterOptions) {}

	onRequestCompleted(request: CompletedRequest): void {
		const isError = request.status >= ERROR_STATUS_FLOOR;
		const isSampled = isError || this.options.random() < this.options.successSampleRate;

		if (!isSampled) {
			return;
		}

		this.buffer.push(toEntry(request));

		if (this.buffer.length <= REQUEST_LOG_BUFFER_MAX) {
			return;
		}

		this.buffer.shift();
		this.droppedCount++;
	}

	start(): void {
		this.isRunning = true;
		this.scheduleNext();
	}

	async stop(): Promise<void> {
		this.isRunning = false;

		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = null;
		await this.flush();
	}

	// Oldest pushed first, so the list reads newest first.
	async flush(): Promise<void> {
		this.reportDropped();

		if (this.buffer.length === 0) {
			return;
		}

		const entries = this.buffer.map((entry) => JSON.stringify(entry));

		this.buffer = [];

		try {
			const results = await this.options.redis
				.multi()
				.lpush(REQUEST_LOG_LIST, ...entries)
				.ltrim(REQUEST_LOG_LIST, 0, this.options.maxEntries - 1)
				.exec();
			const failure = results?.find(([error]) => error !== null)?.[0];

			if (failure) {
				throw failure;
			}
		} catch (error) {
			// Best effort: the log is a sample for the console, not a record.
			this.options.logger.warnThrottled('request-log', LOG_THROTTLE_MS, 'Could not write the request log; entries dropped', {
				droppedEntries: entries.length,
				error: toErrorMessage(error),
			});
		}
	}

	get bufferedCount(): number {
		return this.buffer.length;
	}

	private scheduleNext(): void {
		if (!this.isRunning) {
			return;
		}

		this.timer = setTimeout(() => {
			void this.flush().finally(() => this.scheduleNext());
		}, REQUEST_LOG_FLUSH_MS);
	}

	private reportDropped(): void {
		if (this.droppedCount === 0) {
			return;
		}

		this.options.logger.warnThrottled('request-log-overflow', LOG_THROTTLE_MS, 'Request log buffer full; oldest entries dropped', {
			droppedEntries: this.droppedCount,
		});
		this.droppedCount = 0;
	}
}

function toEntry(request: CompletedRequest): RequestLogEntry {
	return {
		requestId: request.requestId,
		at: new Date(request.startedAtMs).toISOString(),
		method: request.method,
		path: request.path,
		routeId: request.routeId,
		routeName: request.routeName,
		consumerId: request.consumerId,
		consumerSlug: request.consumerSlug,
		instanceId: request.instanceId,
		instanceName: request.instanceName,
		status: request.status,
		durationMs: Math.max(0, request.finishedAtMs - request.startedAtMs),
		attempts: request.attempts,
		gatewayError: request.gatewayError,
	};
}
