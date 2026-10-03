import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { UuidParamDto } from '../../common/dto/path-params.dto.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import type { ConfigActor } from '../application/config-change-recorder.js';
import { RoutesService } from '../application/routes.service.js';
import { RouteDto } from './dto/gateway-config-responses.js';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto.js';
import { CurrentConfigActor } from './config-actor.decorator.js';
import { ConfigErrorFilter } from './config-error.filter.js';

@ApiTags('gateway-config')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/routes')
export class RoutesController {
	constructor(private readonly routes: RoutesService) {}

	@ApiOperation({ summary: 'Every route (bounded list, not paginated)' })
	@ApiOkResponse({ type: [RouteDto] })
	@Get()
	list(): Promise<readonly RouteDto[]> {
		return this.routes.list();
	}

	@ApiOperation({ summary: 'Create a route (409 when the prefix is taken)' })
	@ApiCreatedResponse({ type: RouteDto })
	@Post()
	create(@Body() body: CreateRouteDto, @CurrentConfigActor() actor: ConfigActor): Promise<RouteDto> {
		return this.routes.create(body, actor);
	}

	@ApiOperation({ summary: 'One route' })
	@ApiOkResponse({ type: RouteDto })
	@Get(':id')
	get(@Param() { id }: UuidParamDto): Promise<RouteDto> {
		return this.routes.get(id);
	}

	@ApiOperation({ summary: 'Change a route' })
	@ApiOkResponse({ type: RouteDto })
	@Patch(':id')
	update(@Param() { id }: UuidParamDto, @Body() body: UpdateRouteDto, @CurrentConfigActor() actor: ConfigActor): Promise<RouteDto> {
		return this.routes.update(id, body, actor);
	}

	@ApiOperation({ summary: 'Soft-delete a route (and the consumer grants to it)' })
	@ApiNoContentResponse()
	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	delete(@Param() { id }: UuidParamDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.routes.delete(id, actor);
	}
}
