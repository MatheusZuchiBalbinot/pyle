import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { AdminOverviewService } from '../application/admin-overview.service.js';
import { AdminOverviewDto } from './dto/admin-overview.dto.js';

@ApiTags('overview')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/overview')
export class AdminOverviewController {
	constructor(private readonly overview: AdminOverviewService) {}

	@ApiOperation({ summary: 'The Overview page in one call: health, gateways, last hour of traffic, services, alerts, recent changes' })
	@ApiOkResponse({ type: AdminOverviewDto })
	@Get()
	get(): Promise<AdminOverviewDto> {
		return this.overview.overview();
	}
}
