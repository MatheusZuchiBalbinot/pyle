import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../../auth/interface/admin-auth.guard.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { toPageRequest, type Page } from '../../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../../config/swagger-auth-schemes.js';
import { GatewayAlertService } from '../application/gateway-alert.service.js';
import { GatewayAlertDto, GatewayAlertPageDto } from './dto/gateway-alert.dto.js';

@ApiTags('alerts')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/alerts')
export class AlertsController {
	constructor(private readonly alerts: GatewayAlertService) {}

	@ApiOperation({ summary: 'Alerts open now' })
	@ApiOkResponse({ type: [GatewayAlertDto] })
	@Get('open')
	listOpen(): Promise<readonly GatewayAlertDto[]> {
		return this.alerts.listOpen();
	}

	@ApiOperation({ summary: 'Every alert, newest first' })
	@ApiOkResponse({ type: GatewayAlertPageDto })
	@Get()
	listHistory(@Query() query: PageQueryDto): Promise<Page<GatewayAlertDto>> {
		return this.alerts.listHistory(toPageRequest(query));
	}
}
