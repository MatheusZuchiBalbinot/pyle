import { Injectable } from '@nestjs/common';
import type { AdminRefreshToken } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

export type CreateRefreshTokenInput = {
	readonly userId: string;
	readonly tokenHash: string;
	readonly expiresAt: Date;
};

export type RotateRefreshTokenInput = CreateRefreshTokenInput & {
	// The row being replaced. Revoked and pointed at the new one in the
	// same transaction as the new one's creation.
	readonly previousId: string;
};

// `updateMany` reports how many rows its filter matched; exactly one means
// this caller is the one that claimed the token.
const CLAIMED_BY_THIS_CALLER = 1;

// Rotated tokens stay (revoked, pointing at the replacement): the chain is what makes reuse
// detectable.
@Injectable()
export class AdminRefreshTokenRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	create(input: CreateRefreshTokenInput): Promise<AdminRefreshToken> {
		return this.prisma.adminRefreshToken.create({ data: input });
	}

	findByHash(tokenHash: string): Promise<AdminRefreshToken | null> {
		return this.prisma.adminRefreshToken.findUnique({ where: { tokenHash } });
	}

	// One transaction: a crash between the writes would leave two live tokens for one
	// session.
	rotate(input: RotateRefreshTokenInput): Promise<AdminRefreshToken | null> {
		return this.prisma.transaction(async (transaction) => {
			const claimed = await transaction.adminRefreshToken.updateMany({
				where: { id: input.previousId, revokedAt: null },
				data: { revokedAt: new Date() },
			});

			if (claimed.count !== CLAIMED_BY_THIS_CALLER) {
				return null;
			}

			const createInput = { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt };
			const replacement = await transaction.adminRefreshToken.create({ data: createInput });

			await transaction.adminRefreshToken.update({ where: { id: input.previousId }, data: { replacedById: replacement.id } });

			return replacement;
		});
	}

	revoke(id: string): Promise<AdminRefreshToken> {
		return this.prisma.adminRefreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
	}

	async revokeAllForUser(userId: string): Promise<number> {
		const result = await this.prisma.adminRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

		return result.count;
	}

	async deleteExpiredBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.adminRefreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });

		return result.count;
	}
}
