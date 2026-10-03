import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { getRealtimeConfig, type RealtimeConfig } from '../../config/realtime.js';
import { ADMIN_EVENTS_CHANNEL } from '../domain/realtime-event.js';

const TOKEN_TTL_SECONDS = 60 * 60;
const MS_PER_SECOND = 1000;
const ADMIN_SUBJECT = 'admin';

export type RealtimeConnection = {
	readonly token: string;
	readonly url: string;
	readonly channels: readonly string[];
	readonly expiresAt: string;
};

type MintInput = {
	readonly subject: string;
	readonly channels: readonly string[];
	readonly url: string;
	readonly secret: string;
};

type ConnectionTokenClaims = {
	readonly sub: string;
	readonly exp: number;
	readonly iat: number;
	// Server-side subscriptions: the client never asks for a channel, so it cannot
	// subscribe to another one.
	readonly channels: readonly string[];
};

// Hand-rolled HS256: three base64url segments and one HMAC, only ever minted (Centrifugo
// verifies).
@Injectable()
export class RealtimeTokenService {
	private readonly config: RealtimeConfig = getRealtimeConfig();

	mintAdminConnection(): RealtimeConnection {
		const input: MintInput = {
			subject: ADMIN_SUBJECT,
			channels: [ADMIN_EVENTS_CHANNEL],
			url: this.config.publicWebSocketUrl,
			secret: this.config.tokenHmacSecret,
		};

		return this.mint(input);
	}

	private mint(input: MintInput): RealtimeConnection {
		const issuedAt = Math.floor(Date.now() / MS_PER_SECOND);
		const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
		const claims: ConnectionTokenClaims = { sub: input.subject, iat: issuedAt, exp: expiresAt, channels: input.channels };
		const token = this.sign(claims, input.secret);

		return { token, url: input.url, channels: input.channels, expiresAt: new Date(expiresAt * MS_PER_SECOND).toISOString() };
	}

	private sign(claims: ConnectionTokenClaims, secret: string): string {
		const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
		const payload = base64Url(JSON.stringify(claims));
		const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

		return `${header}.${payload}.${signature}`;
	}
}

function base64Url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}
