import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { SlugParamDto, UuidParamDto } from '../../common/dto/path-params.dto.js';
import type { Page } from '../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { ConfigErrorFilter } from '../../gateway-config/interface/config-error.filter.js';
import { RequestLogService } from '../application/request-log.service.js';
import { TrafficQueryService } from '../application/traffic-query.service.js';
import { ConsumerTrafficDto, RequestLogPageDto, RouteTrafficDto, ServiceTrafficDto, TrafficOverviewDto } from '../domain/traffic-responses.js';
import { RequestLogQueryDto, toTrafficWindowInput, TrafficWindowQueryDto } from './dto/traffic-query.dto.js';

@ApiTags('traffic')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@UseFilters(ConfigErrorFilter)
@Controller('admin/traffic')
export class TrafficController {
	constructor(
		private readonly traffic: TrafficQueryService,
		private readonly requestLog: RequestLogService,
	) {}

	@ApiOperation({ summary: 'Traffic of the whole gateway: totals, series, routes and top consumers' })
	@ApiOkResponse({ type: TrafficOverviewDto })
	@Get('overview')
	overview(@Query() query: TrafficWindowQueryDto): Promise<TrafficOverviewDto> {
		return this.traffic.overview(toTrafficWindowInput(query));
	}

	@ApiOperation({ summary: 'Traffic of one route, per instance' })
	@ApiOkResponse({ type: RouteTrafficDto })
	@Get('routes/:id')
	route(@Param() { id }: UuidParamDto, @Query() query: TrafficWindowQueryDto): Promise<RouteTrafficDto> {
		return this.traffic.route(id, toTrafficWindowInput(query));
	}

	@ApiOperation({ summary: 'Traffic of one service, per instance' })
	@ApiOkResponse({ type: ServiceTrafficDto })
	@Get('services/:slug')
	service(@Param() { slug }: SlugParamDto, @Query() query: TrafficWindowQueryDto): Promise<ServiceTrafficDto> {
		return this.traffic.service(slug, toTrafficWindowInput(query));
	}

	@ApiOperation({ summary: 'Traffic of one consumer, per route' })
	@ApiOkResponse({ type: ConsumerTrafficDto })
	@Get('consumers/:slug')
	consumer(@Param() { slug }: SlugParamDto, @Query() query: TrafficWindowQueryDto): Promise<ConsumerTrafficDto> {
		return this.traffic.consumer(slug, toTrafficWindowInput(query));
	}

	@ApiOperation({ summary: 'The sampled request log, newest first (every error, a sample of the rest)' })
	@ApiOkResponse({ type: RequestLogPageDto })
	@Get('requests')
	requests(@Query() query: RequestLogQueryDto): Promise<Page<RequestLogEntry>> {
		return this.requestLog.list(query);
	}
}
