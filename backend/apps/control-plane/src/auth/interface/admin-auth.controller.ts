import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS } from '../../rate-limiting/rate-limiting.module.js';
import { AdminSessionService, type AdminSession, type AdminUserView } from '../application/admin-session.service.js';
import { LoginDto } from './dto/admin-auth.dto.js';
import { AdminUserDto, LoggedInResponse } from './dto/admin-session.dto.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { getAdminCaller } from './admin-caller.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

// Public by design (they are how a caller gets credentials), except /me.
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
	constructor(private readonly sessionService: AdminSessionService) {}

	@ApiOperation({ summary: 'Exchange email + password for an access token and a refresh cookie' })
	@ApiOkResponse({ type: LoggedInResponse })
	@Post('login')
	@HttpCode(HttpStatus.OK)
	@UseGuards(LoginThrottlerGuard)
	@Throttle({ login: { limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS, ttl: LOGIN_RATE_LIMIT_WINDOW_MS } })
	async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response): Promise<LoggedInResponse> {
		const session = await this.sessionService.login(body.email, body.password);

		return this.toResponse(session, response);
	}

	@ApiOperation({ summary: 'Rotate the refresh cookie for a fresh access token' })
	@ApiOkResponse({ type: LoggedInResponse })
	@Post('refresh')
	@HttpCode(HttpStatus.OK)
	async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LoggedInResponse> {
		const presentedToken = readRefreshCookie(request);

		if (!presentedToken) {
			throw new UnauthorizedException('No session cookie');
		}

		try {
			const session = await this.sessionService.refresh(presentedToken);

			return this.toResponse(session, response);
		} catch (error) {
			clearRefreshCookie(response);
			throw error;
		}
	}

	@ApiOperation({ summary: 'Revoke the current refresh token and clear the cookie' })
	@ApiNoContentResponse()
	@Post('logout')
	@HttpCode(HttpStatus.NO_CONTENT)
	async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
		await this.sessionService.logout(readRefreshCookie(request));
		clearRefreshCookie(response);
	}

	@ApiOperation({ summary: 'The operator behind the presented access token' })
	@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
	@ApiOkResponse({ type: AdminUserDto })
	@Get('me')
	@UseGuards(AdminAuthGuard)
	async me(@Req() request: Request): Promise<AdminUserView> {
		const caller = getAdminCaller(request);

		if (caller?.kind !== 'user') {
			throw new UnauthorizedException('This endpoint is for operator sessions');
		}

		const user = await this.sessionService.findActiveUser(caller.userId);

		if (!user) {
			throw new UnauthorizedException('Account no longer active');
		}

		return user;
	}

	private toResponse(session: AdminSession, response: Response): LoggedInResponse {
		setRefreshCookie(response, session.refreshToken);

		return { accessToken: session.accessToken, expiresAt: session.accessTokenExpiresAt, user: session.user };
	}
}
