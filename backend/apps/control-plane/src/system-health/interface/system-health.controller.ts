import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { SystemHealthService } from '../application/system-health.service.js';
import { SystemHealthComponentStatusDto } from './dto/system-health-component-status.dto.js';
import { SystemHealthEventDto } from './dto/system-health-event.dto.js';

@ApiTags('system health')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/system')
export class SystemHealthController {
	constructor(private readonly systemHealthService: SystemHealthService) {}

	@ApiOperation({ summary: "Get the control plane's own current infrastructure status" })
	@ApiOkResponse({ type: [SystemHealthComponentStatusDto] })
	@Get('health')
	getHealth(): readonly SystemHealthComponentStatusDto[] {
		return this.systemHealthService.getCurrentStatus();
	}

	@ApiOperation({ summary: 'Get the recent history of detected status transitions' })
	@ApiOkResponse({ type: [SystemHealthEventDto] })
	@Get('health/history')
	async getHealthHistory(): Promise<readonly SystemHealthEventDto[]> {
		return this.systemHealthService.listRecentEvents();
	}
}
