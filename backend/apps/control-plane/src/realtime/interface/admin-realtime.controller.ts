import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { RealtimeTokenService } from '../application/realtime-token.service.js';
import { RealtimeConnectionDto } from './dto/realtime-connection.dto.js';

@ApiTags('realtime')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/realtime')
export class AdminRealtimeController {
	constructor(private readonly realtimeTokenService: RealtimeTokenService) {}

	@ApiOperation({ summary: 'Mint a realtime connection token for the admin console (channel admin:events)' })
	@ApiCreatedResponse({ type: RealtimeConnectionDto })
	@Post('token')
	mintConnection(): RealtimeConnectionDto {
		return this.realtimeTokenService.mintAdminConnection();
	}
}
