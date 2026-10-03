import { Body, Controller, Param, Put, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { SlugParamDto } from '../../common/dto/path-params.dto.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import type { ConfigActor } from '../../gateway-config/application/config-change-recorder.js';
import { CurrentConfigActor } from '../../gateway-config/interface/config-actor.decorator.js';
import { ConfigErrorFilter } from '../../gateway-config/interface/config-error.filter.js';
import { ServiceDto } from '../../gateway-config/interface/dto/gateway-config-responses.js';
import { ScalingService } from '../application/scaling.service.js';
import { SetReplicasDto } from './dto/set-replicas.dto.js';

@ApiTags('scaling')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/services')
export class ScalingController {
	constructor(private readonly scaling: ScalingService) {}

	@ApiOperation({ summary: 'Set how many managed (Docker) replicas a demo service runs; they converge in the background' })
	@ApiOkResponse({ type: ServiceDto })
	@Put(':slug/replicas')
	setReplicas(@Param() { slug }: SlugParamDto, @Body() body: SetReplicasDto, @CurrentConfigActor() actor: ConfigActor): Promise<ServiceDto> {
		return this.scaling.setReplicas(slug, body.managedReplicas, actor);
	}
}
