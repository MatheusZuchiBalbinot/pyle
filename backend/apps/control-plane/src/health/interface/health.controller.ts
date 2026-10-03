import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SystemHealthService } from '../../system-health/application/system-health.service.js';
import { evaluateReadiness, type ReadinessResponse } from '../domain/readiness.js';
import { LivenessResponse, ReadinessResponseDto } from './dto/health-responses.dto.js';

// Liveness checks no dependency, so an orchestrator never restarts the process because
// Postgres blinked. Readiness reads the periodic checks.
@ApiTags('health')
@Controller('health')
export class HealthController {
	constructor(private readonly systemHealthService: SystemHealthService) {}

	@ApiOperation({ summary: 'Liveness probe: no authentication, no dependency checks' })
	@ApiOkResponse({ type: LivenessResponse })
	@Get()
	getLiveness(): LivenessResponse {
		return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
	}

	@ApiOperation({ summary: 'Readiness probe: 200 when the control-plane Postgres and Redis are up, 503 otherwise' })
	@ApiOkResponse({ type: ReadinessResponseDto })
	@ApiServiceUnavailableResponse({ type: ReadinessResponseDto, description: 'Not ready: same body, status not_ready' })
	@Get('ready')
	getReadiness(@Res({ passthrough: true }) response: Response): ReadinessResponse {
		const statuses = this.systemHealthService.getCurrentStatus();
		const readiness = evaluateReadiness(statuses);

		if (readiness.status === 'not_ready') {
			response.status(HttpStatus.SERVICE_UNAVAILABLE);
		}

		return readiness;
	}
}
