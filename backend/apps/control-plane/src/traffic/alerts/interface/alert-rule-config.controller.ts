import { Body, Controller, Get, Param, Put, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../../config/swagger-auth-schemes.js';
import type { ConfigActor } from '../../../gateway-config/application/config-change-recorder.js';
import { CurrentConfigActor } from '../../../gateway-config/interface/config-actor.decorator.js';
import { ConfigErrorFilter } from '../../../gateway-config/interface/config-error.filter.js';
import { AlertRuleConfigService } from '../application/alert-rule-config.service.js';
import { AlertRuleConfigDto } from './dto/alert-rule-config.dto.js';
import { UpdateAlertRuleConfigDto } from './dto/update-alert-rule-config.dto.js';

@ApiTags('alerts')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/alert-rules')
export class AlertRuleConfigController {
	constructor(private readonly rules: AlertRuleConfigService) {}

	@ApiOperation({ summary: 'The four alert rules and their settings' })
	@ApiOkResponse({ type: [AlertRuleConfigDto] })
	@Get()
	list(): Promise<readonly AlertRuleConfigDto[]> {
		return this.rules.listAll();
	}

	@ApiOperation({ summary: "Change one alert rule (400 for a threshold outside its kind's range)" })
	@ApiOkResponse({ type: AlertRuleConfigDto })
	@Put(':kind')
	update(@Param('kind') kind: string, @Body() body: UpdateAlertRuleConfigDto, @CurrentConfigActor() actor: ConfigActor): Promise<AlertRuleConfigDto> {
		return this.rules.update(kind, body, actor);
	}
}
