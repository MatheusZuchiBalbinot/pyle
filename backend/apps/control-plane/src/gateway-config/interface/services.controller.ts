import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { SlugParamDto } from '../../common/dto/path-params.dto.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { ChaosService } from '../application/chaos.service.js';
import type { ConfigActor } from '../application/config-change-recorder.js';
import { InstancesService } from '../application/instances.service.js';
import { ServicesService } from '../application/services.service.js';
import { ChaosStateDto } from './dto/chaos.dto.js';
import { InstanceDto, ServiceDto } from './dto/gateway-config-responses.js';
import { CreateInstanceDto, UpdateInstanceDto } from './dto/instance.dto.js';
import { ServiceInstanceParamsDto } from './dto/path-params.dto.js';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto.js';
import { CurrentConfigActor } from './config-actor.decorator.js';
import { ConfigErrorFilter } from './config-error.filter.js';

// Set when a change left a service with routes but no enabled instance.
const INSTANCE_WARNING_HEADER = 'X-Pyle-Warning';

@ApiTags('gateway-config')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/services')
export class ServicesController {
	constructor(
		private readonly services: ServicesService,
		private readonly instances: InstancesService,
		private readonly chaos: ChaosService,
	) {}

	@ApiOperation({ summary: 'Every service with its instances and their live state (bounded list, not paginated)' })
	@ApiOkResponse({ type: [ServiceDto] })
	@Get()
	list(): Promise<readonly ServiceDto[]> {
		return this.services.list();
	}

	@ApiOperation({ summary: 'Create a service (409 when the slug is taken)' })
	@ApiCreatedResponse({ type: ServiceDto })
	@Post()
	create(@Body() body: CreateServiceDto, @CurrentConfigActor() actor: ConfigActor): Promise<ServiceDto> {
		return this.services.create(body, actor);
	}

	@ApiOperation({ summary: 'One service with its instances' })
	@ApiOkResponse({ type: ServiceDto })
	@Get(':slug')
	get(@Param() { slug }: SlugParamDto): Promise<ServiceDto> {
		return this.services.get(slug);
	}

	@ApiOperation({ summary: 'Change a service (the slug is fixed)' })
	@ApiOkResponse({ type: ServiceDto })
	@Patch(':slug')
	update(@Param() { slug }: SlugParamDto, @Body() body: UpdateServiceDto, @CurrentConfigActor() actor: ConfigActor): Promise<ServiceDto> {
		return this.services.update(slug, body, actor);
	}

	@ApiOperation({ summary: 'Soft-delete a service and its instances (409 while a route still uses it)' })
	@ApiNoContentResponse()
	@Delete(':slug')
	@HttpCode(HttpStatus.NO_CONTENT)
	delete(@Param() { slug }: SlugParamDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.services.delete(slug, actor);
	}

	@ApiOperation({ summary: 'Add an instance to a service' })
	@ApiCreatedResponse({ type: InstanceDto })
	@Post(':slug/instances')
	createInstance(@Param() { slug }: SlugParamDto, @Body() body: CreateInstanceDto, @CurrentConfigActor() actor: ConfigActor): Promise<InstanceDto> {
		return this.instances.create(slug, body, actor);
	}

	@ApiOperation({ summary: 'Change an instance; isEnabled=false drains it (X-Pyle-Warning when no enabled instance is left)' })
	@ApiOkResponse({ type: InstanceDto })
	@Patch(':slug/instances/:instanceId')
	async updateInstance(
		@Param() { slug, instanceId }: ServiceInstanceParamsDto,
		@Body() body: UpdateInstanceDto,
		@CurrentConfigActor() actor: ConfigActor,
		@Res({ passthrough: true }) response: Response,
	): Promise<InstanceDto> {
		const result = await this.instances.update(slug, instanceId, body, actor);

		if (result.warning) {
			response.setHeader(INSTANCE_WARNING_HEADER, result.warning);
		}

		return result.instance;
	}

	@ApiOperation({ summary: 'Soft-delete an instance (409 for the last one of a routed service)' })
	@ApiNoContentResponse()
	@Delete(':slug/instances/:instanceId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteInstance(@Param() { slug, instanceId }: ServiceInstanceParamsDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.instances.delete(slug, instanceId, actor);
	}

	@ApiOperation({ summary: 'Inject faults into a demo instance (403 unless CHAOS_ALLOWED, 502 when the instance does not answer)' })
	@ApiOkResponse({ type: ChaosStateDto })
	@Put(':slug/instances/:instanceId/chaos')
	setChaos(
		@Param() { slug, instanceId }: ServiceInstanceParamsDto,
		@Body() body: ChaosStateDto,
		@CurrentConfigActor() actor: ConfigActor,
	): Promise<ChaosState> {
		return this.chaos.apply({ serviceSlug: slug, instanceId }, body, actor);
	}

	@ApiOperation({ summary: 'Restore a demo instance to normal' })
	@ApiOkResponse({ type: ChaosStateDto })
	@Delete(':slug/instances/:instanceId/chaos')
	clearChaos(@Param() { slug, instanceId }: ServiceInstanceParamsDto, @CurrentConfigActor() actor: ConfigActor): Promise<ChaosState> {
		return this.chaos.clear({ serviceSlug: slug, instanceId }, actor);
	}
}
