import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { PlatformSettingsService } from '../application/platform-settings.service.js';
import { PlatformSettingsDto } from './dto/platform-settings.dto.js';

@ApiTags('settings')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/settings')
export class PlatformSettingsController {
	constructor(private readonly platformSettings: PlatformSettingsService) {}

	@ApiOperation({ summary: 'Effective configuration (gateway, traffic, AI provider status, realtime URL) — no secrets' })
	@ApiOkResponse({ type: PlatformSettingsDto })
	@Get('platform')
	getPlatform(): PlatformSettingsDto {
		return this.platformSettings.getSettings();
	}
}
