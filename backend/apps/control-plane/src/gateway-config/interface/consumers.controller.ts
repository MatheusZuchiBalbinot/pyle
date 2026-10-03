import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { SlugParamDto } from '../../common/dto/path-params.dto.js';
import { toPageRequest, type Page } from '../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import type { ConfigActor } from '../application/config-change-recorder.js';
import { ConsumersService } from '../application/consumers.service.js';
import { ConsumerRoutesDto, CreateConsumerDto, IssueApiKeyDto, UpdateConsumerDto } from './dto/consumer.dto.js';
import { ApiKeyCreatedDto, ConsumerCreatedDto, ConsumerDto, ConsumerPageDto } from './dto/gateway-config-responses.js';
import { ConsumerKeyParamsDto } from './dto/path-params.dto.js';
import { CurrentConfigActor } from './config-actor.decorator.js';
import { ConfigErrorFilter } from './config-error.filter.js';

@ApiTags('gateway-config')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/consumers')
export class ConsumersController {
	constructor(private readonly consumers: ConsumersService) {}

	@ApiOperation({ summary: 'A page of consumers, newest first (cursor pagination)' })
	@ApiOkResponse({ type: ConsumerPageDto })
	@Get()
	list(@Query() query: PageQueryDto): Promise<Page<ConsumerDto>> {
		return this.consumers.list(toPageRequest(query));
	}

	@ApiOperation({ summary: 'Create a consumer with its first API key (the key is returned once, here)' })
	@ApiCreatedResponse({ type: ConsumerCreatedDto })
	@Post()
	create(@Body() body: CreateConsumerDto, @CurrentConfigActor() actor: ConfigActor): Promise<ConsumerCreatedDto> {
		return this.consumers.create(body, actor);
	}

	@ApiOperation({ summary: 'One consumer with its keys (prefixes only) and allowed routes' })
	@ApiOkResponse({ type: ConsumerDto })
	@Get(':slug')
	get(@Param() { slug }: SlugParamDto): Promise<ConsumerDto> {
		return this.consumers.get(slug);
	}

	@ApiOperation({ summary: 'Change a consumer name or rate limit' })
	@ApiOkResponse({ type: ConsumerDto })
	@Patch(':slug')
	update(@Param() { slug }: SlugParamDto, @Body() body: UpdateConsumerDto, @CurrentConfigActor() actor: ConfigActor): Promise<ConsumerDto> {
		return this.consumers.update(slug, body, actor);
	}

	@ApiOperation({ summary: 'Soft-delete a consumer and revoke every key it has' })
	@ApiNoContentResponse()
	@Delete(':slug')
	@HttpCode(HttpStatus.NO_CONTENT)
	delete(@Param() { slug }: SlugParamDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.consumers.delete(slug, actor);
	}

	@ApiOperation({ summary: 'Issue another API key (returned once, here; 409 past 10 active keys)' })
	@ApiCreatedResponse({ type: ApiKeyCreatedDto })
	@Post(':slug/keys')
	issueKey(@Param() { slug }: SlugParamDto, @Body() body: IssueApiKeyDto, @CurrentConfigActor() actor: ConfigActor): Promise<ApiKeyCreatedDto> {
		return this.consumers.issueKey(slug, body.label, actor);
	}

	@ApiOperation({ summary: 'Revoke an API key (idempotent)' })
	@ApiNoContentResponse()
	@Delete(':slug/keys/:keyId')
	@HttpCode(HttpStatus.NO_CONTENT)
	revokeKey(@Param() { slug, keyId }: ConsumerKeyParamsDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.consumers.revokeKey(slug, keyId, actor);
	}

	@ApiOperation({ summary: 'Undo a revocation made within the last 60 s (idempotent on an active key; 409 past the window)' })
	@ApiNoContentResponse()
	@Post(':slug/keys/:keyId/restore')
	@HttpCode(HttpStatus.NO_CONTENT)
	restoreKey(@Param() { slug, keyId }: ConsumerKeyParamsDto, @CurrentConfigActor() actor: ConfigActor): Promise<void> {
		return this.consumers.restoreKey(slug, keyId, actor);
	}

	@ApiOperation({ summary: 'Replace the routes a consumer may call (empty = every route)' })
	@ApiOkResponse({ type: ConsumerDto })
	@Put(':slug/routes')
	setRoutes(@Param() { slug }: SlugParamDto, @Body() body: ConsumerRoutesDto, @CurrentConfigActor() actor: ConfigActor): Promise<ConsumerDto> {
		return this.consumers.setRoutes(slug, body.routeIds, actor);
	}
}
