import { Module } from '@nestjs/common';

import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module.js';
import { AdminSessionService } from './application/admin-session.service.js';
import { AdminTokenService } from './application/admin-token.service.js';
import { PasswordHasher } from './application/password-hasher.js';
import { AdminRefreshTokenRepository } from './infrastructure/admin-refresh-token.repository.js';
import { AdminUserRepository } from './infrastructure/admin-user.repository.js';
import { AdminAuthController } from './interface/admin-auth.controller.js';
import { AdminAuthGuard } from './interface/admin-auth.guard.js';
import { LoginThrottlerGuard } from './interface/login-throttler.guard.js';

@Module({
	imports: [ControlPlaneModule, RateLimitingModule],
	controllers: [AdminAuthController],
	providers: [
		AdminAuthGuard,
		AdminTokenService,
		PasswordHasher,
		AdminUserRepository,
		AdminRefreshTokenRepository,
		AdminSessionService,
		LoginThrottlerGuard,
	],
	exports: [AdminAuthGuard, AdminTokenService, PasswordHasher, AdminUserRepository, AdminSessionService],
})
export class AuthModule {}
