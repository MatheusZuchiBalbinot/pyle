import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { GatewayStatusService } from '../application/gateway-status.service.js';
import { GatewayStatusDto } from '../domain/traffic-responses.js';

@ApiTags('traffic')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/gateway')
export class GatewayStatusController {
	constructor(private readonly status: GatewayStatusService) {}

	@ApiOperation({ summary: 'Running gateways (from their heartbeats) and the current configuration version' })
	@ApiOkResponse({ type: GatewayStatusDto })
	@Get('status')
	getStatus(): Promise<GatewayStatusDto> {
		return this.status.status();
	}
}
