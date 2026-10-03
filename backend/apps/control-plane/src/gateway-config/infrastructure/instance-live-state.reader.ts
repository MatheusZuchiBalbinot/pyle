import { Injectable, Logger } from '@nestjs/common';

import type { InstanceLiveState } from '@pyle/shared/contracts/instance-live-state.js';
import { INSTANCE_STATE_HASH } from '@pyle/shared/contracts/redis-keys.js';

import { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const HEALTH_VALUES: ReadonlySet<unknown> = new Set(['healthy', 'unhealthy', 'unknown']);
const CIRCUIT_VALUES: ReadonlySet<unknown> = new Set(['closed', 'open', 'half_open']);

// One HGETALL for the whole fleet.
@Injectable()
export class InstanceLiveStateReader {
	private readonly logger = new Logger(InstanceLiveStateReader.name);

	constructor(private readonly redis: ControlPlaneRedisService) {}

	async readAll(): Promise<ReadonlyMap<string, InstanceLiveState>> {
		const raw = await this.redis.hgetall(INSTANCE_STATE_HASH);
		const states = new Map<string, InstanceLiveState>();

		for (const [instanceId, json] of Object.entries(raw)) {
			const state = this.parse(instanceId, json);

			if (state) {
				states.set(instanceId, state);
			}
		}

		return states;
	}

	private parse(instanceId: string, json: string): InstanceLiveState | null {
		try {
			const parsed: unknown = JSON.parse(json);

			if (isInstanceLiveState(parsed)) {
				return parsed;
			}
		} catch {
			// Falls through to the warning below: same treatment as a bad shape.
		}

		this.logger.warn(`Ignoring malformed live state for instance ${instanceId}`);

		return null;
	}
}

// A row from a gateway with another shape is skipped rather than served.
function isInstanceLiveState(value: unknown): value is InstanceLiveState {
	if (!isRecord(value)) {
		return false;
	}

	const hasIdentity = typeof value.instanceId === 'string' && typeof value.gatewayId === 'string';
	const hasStates = HEALTH_VALUES.has(value.health) && CIRCUIT_VALUES.has(value.circuit);
	const hasCounters = typeof value.inFlight === 'number' && typeof value.consecutiveFailures === 'number';

	return hasIdentity && hasStates && hasCounters && typeof value.updatedAt === 'string';
}
