import { Injectable, Logger } from '@nestjs/common';

import type { GatewayHeartbeat } from '@pyle/shared/contracts/instance-live-state.js';
import { HEARTBEAT_KEY_PATTERN } from '@pyle/shared/contracts/redis-keys.js';

import { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';

const SCAN_BATCH = 100;

@Injectable()
export class GatewayHeartbeatReader {
	private readonly logger = new Logger(GatewayHeartbeatReader.name);

	constructor(private readonly redis: ControlPlaneRedisService) {}

	async readAll(): Promise<readonly GatewayHeartbeat[]> {
		const keys = await this.scanKeys();

		if (keys.length === 0) {
			return [];
		}

		const values = await this.redis.mget(...keys);

		return values.flatMap((raw, index) => this.parse(keys[index], raw));
	}

	private async scanKeys(): Promise<readonly string[]> {
		const keys: string[] = [];
		let cursor = '0';

		do {
			const [next, batch] = await this.redis.scan(cursor, 'MATCH', HEARTBEAT_KEY_PATTERN, 'COUNT', SCAN_BATCH);

			keys.push(...batch);
			cursor = next;
		} while (cursor !== '0');

		return [...new Set(keys)];
	}

	private parse(key: string, raw: string | null): readonly GatewayHeartbeat[] {
		// Expired between SCAN and MGET: simply gone.
		if (raw === null) {
			return [];
		}

		try {
			const parsed: unknown = JSON.parse(raw);

			if (isHeartbeat(parsed)) {
				return [parsed];
			}
		} catch {
			// Falls through to the warning below: same treatment as a bad shape.
		}

		this.logger.warn(`Ignoring a malformed heartbeat at ${key}`);

		return [];
	}
}

function isHeartbeat(value: unknown): value is GatewayHeartbeat {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const record = value as Readonly<Record<string, unknown>>;
	const hasIdentity = typeof record.gatewayId === 'string' && typeof record.startedAt === 'string';
	const hasState = typeof record.configVersion === 'number' && typeof record.isRateLimitDegraded === 'boolean';

	return hasIdentity && hasState && typeof record.updatedAt === 'string';
}
