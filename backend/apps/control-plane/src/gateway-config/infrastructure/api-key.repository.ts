import { Injectable } from '@nestjs/common';
import type { ApiKey, Prisma } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { PrismaExecutor } from './prisma-client.js';

const NOT_REVOKED = { revokedAt: null } as const;

// Keys are revoked, never deleted while their consumer exists.
@Injectable()
export class ApiKeyRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	create(data: Prisma.ApiKeyUncheckedCreateInput, executor: PrismaExecutor = this.prisma): Promise<ApiKey> {
		return executor.apiKey.create({ data });
	}

	countActive(consumerId: string, executor: PrismaExecutor = this.prisma): Promise<number> {
		return executor.apiKey.count({ where: { consumerId, ...NOT_REVOKED } });
	}

	find(consumerId: string, keyId: string): Promise<ApiKey | null> {
		return this.prisma.apiKey.findFirst({ where: { id: keyId, consumerId } });
	}

	listActive(consumerId: string, executor: PrismaExecutor = this.prisma): Promise<readonly ApiKey[]> {
		return executor.apiKey.findMany({ where: { consumerId, ...NOT_REVOKED } });
	}

	// Only the revocation it was asked to undo: false if the key is active again or was
	// revoked at another time (two operators at once).
	async restore(id: string, revokedAt: Date, executor: PrismaExecutor = this.prisma): Promise<boolean> {
		const { count } = await executor.apiKey.updateMany({ where: { id, revokedAt }, data: { revokedAt: null } });

		return count > 0;
	}

	async revoke(ids: readonly string[], revokedAt: Date, executor: PrismaExecutor = this.prisma): Promise<void> {
		await executor.apiKey.updateMany({ where: { id: { in: [...ids] }, ...NOT_REVOKED }, data: { revokedAt } });
	}
}
