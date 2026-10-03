import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import { getAccessTokenTtlSeconds, getAdminJwtSecret } from '../../config/admin-auth.js';

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'pyle-control-plane';
const JWT_AUDIENCE = 'pyle-admin-console';
const REFRESH_TOKEN_BYTES = 32;

type AccessToken = {
	readonly token: string;
	readonly expiresAt: Date;
};

type AccessTokenClaims = {
	readonly userId: string;
	readonly email: string;
};

// Verified on every request (algorithm, issuer, audience, expiry), hence jose rather than a
// hand-rolled signature.
@Injectable()
export class AdminTokenService {
	async mintAccessToken(claims: AccessTokenClaims): Promise<AccessToken> {
		const expiresAt = new Date(Date.now() + getAccessTokenTtlSeconds() * 1000);
		const token = await new SignJWT({ email: claims.email })
			.setProtectedHeader({ alg: JWT_ALGORITHM })
			.setSubject(claims.userId)
			.setIssuer(JWT_ISSUER)
			.setAudience(JWT_AUDIENCE)
			.setIssuedAt()
			.setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
			.sign(this.getSecretKey());

		return { token, expiresAt };
	}

	async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
		// Outside the try on purpose: a missing secret is a configuration error, not a 401.
		const secretKey = this.getSecretKey();

		try {
			const { payload } = await jwtVerify(token, secretKey, {
				algorithms: [JWT_ALGORITHM],
				issuer: JWT_ISSUER,
				audience: JWT_AUDIENCE,
			});
			const email = payload.email;

			if (!payload.sub || typeof email !== 'string') {
				return null;
			}

			return { userId: payload.sub, email };
		} catch {
			// Which check failed would help an attacker more than the caller.
			return null;
		}
	}

	generateRefreshToken(): string {
		return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
	}

	// SHA-256, not scrypt: these are 256-bit random values, there is no dictionary to
	// attack.
	hashRefreshToken(token: string): string {
		return createHash('sha256').update(token).digest('hex');
	}

	private getSecretKey(): Uint8Array {
		return new TextEncoder().encode(getAdminJwtSecret());
	}
}
