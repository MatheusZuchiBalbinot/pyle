import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { getAdminApiToken } from '../../config/admin-api-token.js';
import { AdminTokenService } from '../application/admin-token.service.js';
import { setAdminCaller } from './admin-caller.js';
import { extractBearerToken } from './extract-bearer-token.js';

// Operators present an access JWT; machines (seeder, bot, CI) present ADMIN_API_TOKEN. Both
// become an AdminCaller on the request.
@Injectable()
export class AdminAuthGuard implements CanActivate {
	constructor(private readonly tokenService: AdminTokenService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>();
		const presentedToken = extractBearerToken(request.header('authorization'));

		if (!presentedToken) {
			throw new UnauthorizedException('Missing admin credentials');
		}

		const claims = await this.tokenService.verifyAccessToken(presentedToken);

		if (claims) {
			setAdminCaller(request, { kind: 'user', userId: claims.userId, email: claims.email });

			return true;
		}

		// Constant-time: this path has no rate limit and the token is a full-access
		// credential.
		if (isMatchingServiceToken(presentedToken, getAdminApiToken())) {
			setAdminCaller(request, { kind: 'service' });

			return true;
		}

		throw new UnauthorizedException('Missing or invalid admin credentials');
	}
}

// Digests have equal length, so timingSafeEqual never throws and the token's length does
// not leak.
function isMatchingServiceToken(presentedToken: string, serviceToken: string): boolean {
	const presentedDigest = createHash('sha256').update(presentedToken).digest();
	const serviceDigest = createHash('sha256').update(serviceToken).digest();

	return timingSafeEqual(presentedDigest, serviceDigest);
}
