import type { Redis } from 'ioredis';

import type { InstanceLiveState } from '@pyle/shared/contracts/instance-live-state.js';
import { INSTANCE_STATE_HASH } from '@pyle/shared/contracts/redis-keys.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { InstanceRuntimeState, InstanceStateSource } from '../contracts/instance-state-source.js';
import type { GatewayLogger } from '../infrastructure/gateway-logger.js';

const LOG_THROTTLE_MS = 60_000;

export type MirrorRedis = Pick<Redis, 'hset' | 'hmget' | 'hdel'>;

type InstanceStateMirrorOptions = {
	readonly redis: MirrorRedis;
	readonly gatewayId: string;
	// Resolved at start: the source comes from another extension.
	readonly source: () => InstanceStateSource;
	readonly now: () => number;
	readonly logger: GatewayLogger;
};

// Written on every change and in full on every heartbeat (in-flight counts move without a
// change event).
export class InstanceStateMirror {
	private unsubscribe: (() => void) | null = null;
	private readonly written = new Set<string>();

	constructor(private readonly options: InstanceStateMirrorOptions) {}

	start(): void {
		this.unsubscribe = this.options.source().onChange((state) => void this.write([state]));
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	writeAll(): Promise<void> {
		return this.write(this.options.source().list());
	}

	// Removes what this gateway wrote for instances no longer configured.
	// Another gateway's entry stays: it may still see the instance.
	async retainOnly(instanceIds: ReadonlySet<string>): Promise<void> {
		const removed = [...this.written].filter((instanceId) => !instanceIds.has(instanceId));

		if (removed.length === 0) {
			return;
		}

		for (const instanceId of removed) {
			this.written.delete(instanceId);
		}

		try {
			const values = await this.options.redis.hmget(INSTANCE_STATE_HASH, ...removed);
			const ours = removed.filter((_instanceId, index) => isWrittenBy(values[index] ?? null, this.options.gatewayId));

			if (ours.length > 0) {
				await this.options.redis.hdel(INSTANCE_STATE_HASH, ...ours);
			}
		} catch (error) {
			this.warn(error);
		}
	}

	private async write(states: readonly InstanceRuntimeState[]): Promise<void> {
		if (states.length === 0) {
			return;
		}

		const updatedAt = new Date(this.options.now()).toISOString();
		const fields: Record<string, string> = {};

		for (const state of states) {
			fields[state.instanceId] = JSON.stringify(this.toLiveState(state, updatedAt));
			this.written.add(state.instanceId);
		}

		try {
			await this.options.redis.hset(INSTANCE_STATE_HASH, fields);
		} catch (error) {
			this.warn(error);
		}
	}

	private toLiveState(state: InstanceRuntimeState, updatedAt: string): InstanceLiveState {
		const lastCheckAt = state.lastCheckAt === null ? null : new Date(state.lastCheckAt).toISOString();

		return { ...state, gatewayId: this.options.gatewayId, lastCheckAt, updatedAt };
	}

	private warn(error: unknown): void {
		this.options.logger.warnThrottled('instance-state-mirror', LOG_THROTTLE_MS, 'Could not mirror instance state to Redis', {
			error: toErrorMessage(error),
		});
	}
}

function isWrittenBy(raw: string | null, gatewayId: string): boolean {
	if (raw === null) {
		return false;
	}

	try {
		return (JSON.parse(raw) as { readonly gatewayId?: unknown }).gatewayId === gatewayId;
	} catch {
		// Not ours to judge: a value we cannot read is left alone.
		return false;
	}
}
