import { UnauthorizedException } from '@nestjs/common';
import type { AdminRefreshToken, AdminUser } from '@prisma/control-plane-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminRefreshTokenRepository } from '../infrastructure/admin-refresh-token.repository.js';
import type { AdminUserRepository } from '../infrastructure/admin-user.repository.js';
import { AdminSessionService } from './admin-session.service.js';
import { AdminTokenService } from './admin-token.service.js';
import { PasswordHasher } from './password-hasher.js';

const PASSWORD = 'correct horse battery staple';
const SECRET = 'a-secret-long-enough-for-the-config-check';

type Fakes = {
	readonly user: AdminUser | null;
	readonly storedToken?: AdminRefreshToken | null;
};

function buildUser(overrides: Partial<AdminUser> = {}): AdminUser {
	return {
		id: 'user-1',
		email: 'ops@example.com',
		name: 'Ops',
		passwordHash: 'set-in-beforeEach',
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		lastLoginAt: null,
		...overrides,
	} as AdminUser;
}

function buildStoredToken(overrides: Partial<AdminRefreshToken> = {}): AdminRefreshToken {
	return {
		id: 'token-1',
		userId: 'user-1',
		tokenHash: 'hash',
		expiresAt: new Date(Date.now() + 86_400_000),
		revokedAt: null,
		replacedById: null,
		createdAt: new Date(),
		...overrides,
	} as AdminRefreshToken;
}

function buildService(fakes: Fakes) {
	const userRepository = {
		findActiveByEmail: vi.fn().mockResolvedValue(fakes.user),
		findActiveById: vi.fn().mockResolvedValue(fakes.user),
		recordLogin: vi.fn().mockResolvedValue(fakes.user),
	} as unknown as AdminUserRepository;
	const refreshTokenRepository = {
		create: vi.fn().mockResolvedValue(buildStoredToken({ id: 'token-2' })),
		findByHash: vi.fn().mockResolvedValue(fakes.storedToken ?? null),
		rotate: vi.fn().mockResolvedValue(buildStoredToken({ id: 'token-2' })),
		revoke: vi.fn().mockResolvedValue(undefined),
		revokeAllForUser: vi.fn().mockResolvedValue(2),
	} as unknown as AdminRefreshTokenRepository;
	const service = new AdminSessionService(userRepository, refreshTokenRepository, new PasswordHasher(), new AdminTokenService());

	return { service, userRepository, refreshTokenRepository };
}

describe('AdminSessionService', () => {
	let passwordHash: string;

	beforeEach(async () => {
		process.env.ADMIN_JWT_SECRET = SECRET;
		passwordHash ??= await new PasswordHasher().hash(PASSWORD);
	});
	afterEach(() => {
		delete process.env.ADMIN_JWT_SECRET;
	});

	describe('login', () => {
		it('issues an access token and a refresh token, and records the login', async () => {
			const { service, userRepository, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }) });

			const session = await service.login('ops@example.com', PASSWORD);

			expect(session.user).toEqual(expect.objectContaining({ id: 'user-1', email: 'ops@example.com' }));
			expect(session.accessToken.split('.')).toHaveLength(3);
			expect(session.refreshToken.length).toBeGreaterThan(20);
			expect(userRepository.recordLogin).toHaveBeenCalledWith('user-1');
			// Only the hash is persisted — never the token the operator holds.
			const created = (refreshTokenRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { tokenHash: string };

			expect(created.tokenHash).not.toBe(session.refreshToken);
		});

		it('rejects a wrong password without saying it was the password', async () => {
			const { service } = buildService({ user: buildUser({ passwordHash }) });

			await expect(service.login('ops@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
		});

		it('answers an unknown address exactly like a wrong password', async () => {
			const unknown = buildService({ user: null });
			const wrongPassword = buildService({ user: buildUser({ passwordHash }) });

			const unknownError = await unknown.service.login('nobody@example.com', PASSWORD).catch((error: Error) => error.message);
			const wrongPasswordError = await wrongPassword.service.login('ops@example.com', 'wrong').catch((error: Error) => error.message);

			expect(unknownError).toBe(wrongPasswordError);
		});
	});

	describe('refresh', () => {
		it('rotates the token: the old one is replaced and a new pair is issued, in one write', async () => {
			const tokenService = new AdminTokenService();
			const presented = tokenService.generateRefreshToken();
			const stored = buildStoredToken({ tokenHash: tokenService.hashRefreshToken(presented) });
			const { service, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }), storedToken: stored });

			const session = await service.refresh(presented);

			expect(session.refreshToken).not.toBe(presented);
			expect(refreshTokenRepository.rotate).toHaveBeenCalledWith(
				expect.objectContaining({ previousId: 'token-1', userId: 'user-1', tokenHash: tokenService.hashRefreshToken(session.refreshToken) }),
			);
			// The successor's own expiry is what the caller is told, not a
			// second clock read.
			expect(refreshTokenRepository.create).not.toHaveBeenCalled();
		});

		// Two tabs refreshing at once both read the row as live; only one
		// can claim it, and the loser must not walk away with a session.
		it('refuses the refresh that lost the race to another one with the same cookie', async () => {
			const tokenService = new AdminTokenService();
			const presented = tokenService.generateRefreshToken();
			const stored = buildStoredToken({ tokenHash: tokenService.hashRefreshToken(presented) });
			const { service, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }), storedToken: stored });

			refreshTokenRepository.rotate = vi.fn().mockResolvedValue(null);

			await expect(service.refresh(presented)).rejects.toThrow(UnauthorizedException);
		});

		it('revokes every session when an already-rotated token is presented again', async () => {
			const stored = buildStoredToken({ revokedAt: new Date() });
			const { service, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }), storedToken: stored });

			await expect(service.refresh('whatever')).rejects.toThrow(UnauthorizedException);
			expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
		});

		it('rejects an expired token without revoking anything else', async () => {
			const stored = buildStoredToken({ expiresAt: new Date(Date.now() - 1000) });
			const { service, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }), storedToken: stored });

			await expect(service.refresh('whatever')).rejects.toThrow(UnauthorizedException);
			expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
		});

		it('rejects a token the server never issued', async () => {
			const { service } = buildService({ user: buildUser({ passwordHash }), storedToken: null });

			await expect(service.refresh('forged')).rejects.toThrow(UnauthorizedException);
		});

		it('rejects a valid token whose account is gone', async () => {
			const { service, refreshTokenRepository } = buildService({ user: null, storedToken: buildStoredToken() });

			(refreshTokenRepository.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(buildStoredToken());

			await expect(service.refresh('whatever')).rejects.toThrow(UnauthorizedException);
		});
	});

	describe('logout', () => {
		it('revokes the presented token', async () => {
			const { service, refreshTokenRepository } = buildService({ user: buildUser({ passwordHash }), storedToken: buildStoredToken() });

			await service.logout('whatever');

			expect(refreshTokenRepository.revoke).toHaveBeenCalledWith('token-1');
		});

		it('is a no-op without a cookie, or with one already revoked', async () => {
			const { service, refreshTokenRepository } = buildService({
				user: buildUser({ passwordHash }),
				storedToken: buildStoredToken({ revokedAt: new Date() }),
			});

			await expect(service.logout(null)).resolves.toBeUndefined();
			await expect(service.logout('whatever')).resolves.toBeUndefined();
			expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
		});
	});
});
