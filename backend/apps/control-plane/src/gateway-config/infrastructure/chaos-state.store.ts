import { Injectable } from '@nestjs/common';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import { chaosStateKey } from '@pyle/shared/contracts/redis-keys.js';

import { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';

// A display cache: the instance itself is the source of truth.
@Injectable()
export class ChaosStateStore {
	constructor(private readonly redis: ControlPlaneRedisService) {}

	async save(instanceId: string, chaos: ChaosState): Promise<void> {
		await this.redis.set(chaosStateKey(instanceId), JSON.stringify(chaos));
	}

	async clear(instanceId: string): Promise<void> {
		await this.redis.del(chaosStateKey(instanceId));
	}

	async readMany(instanceIds: readonly string[]): Promise<ReadonlyMap<string, ChaosState>> {
		if (instanceIds.length === 0) {
			return new Map();
		}

		const values = await this.redis.mget(instanceIds.map(chaosStateKey));
		const states = new Map<string, ChaosState>();

		instanceIds.forEach((instanceId, index) => {
			const parsed = this.parse(values[index] ?? null);

			if (parsed) {
				states.set(instanceId, parsed);
			}
		});

		return states;
	}

	private parse(json: string | null): ChaosState | null {
		if (json === null) {
			return null;
		}

		try {
			const value: unknown = JSON.parse(json);

			return isChaosState(value) ? value : null;
		} catch {
			// A corrupt display cache just shows "no chaos"; the next change rewrites it.
			return null;
		}
	}
}

function isChaosState(value: unknown): value is ChaosState {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Readonly<Record<string, unknown>>;
	const hasNumbers = typeof candidate.latencyMs === 'number' && typeof candidate.jitterMs === 'number' && typeof candidate.errorRate === 'number';

	return hasNumbers && typeof candidate.isDown === 'boolean';
}
