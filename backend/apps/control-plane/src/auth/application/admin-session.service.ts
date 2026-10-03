import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { AdminUser } from '@prisma/control-plane-client';

import { getRefreshTokenTtlDays } from '../../config/admin-auth.js';
import {
	AdminRefreshTokenRepository,
	type CreateRefreshTokenInput,
	type RotateRefreshTokenInput,
} from '../infrastructure/admin-refresh-token.repository.js';
import { AdminUserRepository } from '../infrastructure/admin-user.repository.js';
import { AdminTokenService } from './admin-token.service.js';
import { PasswordHasher } from './password-hasher.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// One message for every failure mode below, so the API never says whether
// an address exists.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const INVALID_SESSION_MESSAGE = 'Session expired — sign in again';

export type AdminUserView = {
	readonly id: string;
	readonly email: string;
	readonly name: string;
	readonly lastLoginAt: string | null;
};

export type AdminSession = {
	readonly accessToken: string;
	readonly accessTokenExpiresAt: string;
	// Plaintext, returned once: it goes straight into the httpOnly cookie
	// and is never stored or logged.
	readonly refreshToken: string;
	readonly refreshTokenExpiresAt: Date;
	readonly user: AdminUserView;
};

// Every failure answers the same way; a refresh token works once, and presenting a rotated
// one ends every session of that user (the cookie was copied).
@Injectable()
export class AdminSessionService {
	private readonly logger = new Logger(AdminSessionService.name);

	constructor(
		private readonly userRepository: AdminUserRepository,
		private readonly refreshTokenRepository: AdminRefreshTokenRepository,
		private readonly passwordHasher: PasswordHasher,
		private readonly tokenService: AdminTokenService,
	) {}

	async login(email: string, password: string): Promise<AdminSession> {
		const user = await this.userRepository.findActiveByEmail(email);
		// The hash comparison runs even for an unknown address, so the
		// response time doesn't reveal which addresses exist.
		const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
		const isCorrectPassword = await this.passwordHasher.verify(password, passwordHash);
		const isAuthenticated = user !== null && isCorrectPassword;

		if (!isAuthenticated) {
			throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
		}

		await this.userRepository.recordLogin(user.id);

		return this.issueSession(user);
	}

	async refresh(presentedToken: string): Promise<AdminSession> {
		const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
		const stored = await this.refreshTokenRepository.findByHash(tokenHash);

		if (!stored) {
			throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
		}

		if (stored.revokedAt !== null) {
			// Already rotated or explicitly revoked, yet someone still holds
			// it: assume the cookie leaked and end every session.
			const revokedCount = await this.refreshTokenRepository.revokeAllForUser(stored.userId);

			this.logger.warn(`Refresh token reuse detected for user ${stored.userId} — revoked ${revokedCount} active session(s)`);
			throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
		}

		if (stored.expiresAt.getTime() <= Date.now()) {
			throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
		}

		const user = await this.userRepository.findActiveById(stored.userId);

		if (!user) {
			throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
		}

		const refreshToken = this.tokenService.generateRefreshToken();
		const rotateInput: RotateRefreshTokenInput = {
			previousId: stored.id,
			userId: user.id,
			tokenHash: this.tokenService.hashRefreshToken(refreshToken),
			expiresAt: this.nextRefreshTokenExpiry(),
		};
		// Another refresh with the same cookie won; this token really is spent.
		const replacement = await this.refreshTokenRepository.rotate(rotateInput);

		if (!replacement) {
			throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
		}

		return this.buildSession(user, refreshToken, replacement.expiresAt);
	}

	// Idempotent: an unknown or repeated cookie is a no-op.
	async logout(presentedToken: string | null): Promise<void> {
		if (!presentedToken) {
			return;
		}

		const stored = await this.refreshTokenRepository.findByHash(this.tokenService.hashRefreshToken(presentedToken));

		if (!stored || stored.revokedAt !== null) {
			return;
		}

		await this.refreshTokenRepository.revoke(stored.id);
	}

	async findActiveUser(userId: string): Promise<AdminUserView | null> {
		const user = await this.userRepository.findActiveById(userId);

		return user ? toAdminUserView(user) : null;
	}

	private nextRefreshTokenExpiry(): Date {
		return new Date(Date.now() + getRefreshTokenTtlDays() * MS_PER_DAY);
	}

	private async issueSession(user: AdminUser): Promise<AdminSession> {
		const refreshToken = this.tokenService.generateRefreshToken();
		const expiresAt = this.nextRefreshTokenExpiry();
		const createInput: CreateRefreshTokenInput = { userId: user.id, tokenHash: this.tokenService.hashRefreshToken(refreshToken), expiresAt };

		await this.refreshTokenRepository.create(createInput);

		return this.buildSession(user, refreshToken, expiresAt);
	}

	// Shared by login and rotation so the two cannot drift apart.
	private async buildSession(user: AdminUser, refreshToken: string, refreshTokenExpiresAt: Date): Promise<AdminSession> {
		const accessToken = await this.tokenService.mintAccessToken({ userId: user.id, email: user.email });

		return {
			accessToken: accessToken.token,
			accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
			refreshToken,
			refreshTokenExpiresAt,
			user: toAdminUserView(user),
		};
	}

	// Hashed once per process, not per request: the point is only to spend
	// comparable time on an unknown address.
	private async getDummyHash(): Promise<string> {
		this.dummyHash ??= await this.passwordHasher.hash('unknown-account-placeholder');

		return this.dummyHash;
	}

	private dummyHash: string | undefined;
}

function toAdminUserView(user: AdminUser): AdminUserView {
	return { id: user.id, email: user.email, name: user.name, lastLoginAt: user.lastLoginAt?.toISOString() ?? null };
}
