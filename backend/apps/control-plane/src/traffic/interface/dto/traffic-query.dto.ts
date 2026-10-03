import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { ConfigValidationError } from '../../../gateway-config/domain/config-errors.js';
import { STATUS_CLASS_NAMES, type StatusClassName } from '../../application/request-log.service.js';
import { DEFAULT_TRAFFIC_WINDOW, TRAFFIC_WINDOW_NAMES, type TrafficWindowInput, type TrafficWindowName } from '../../domain/traffic-window.js';

// ?window=15m|1h|6h|24h, or ?from=ISO&to=ISO.
export class TrafficWindowQueryDto {
	@IsOptional()
	@IsIn(TRAFFIC_WINDOW_NAMES)
	window?: TrafficWindowName;

	@IsOptional()
	@IsISO8601()
	from?: string;

	@IsOptional()
	@IsISO8601()
	to?: string;
}

// The cursor here is a list index, not a keyset cursor: the page DTO's
// shape, read differently by RequestLogService.
export class RequestLogQueryDto extends PageQueryDto {
	@IsOptional()
	@IsUUID()
	routeId?: string;

	@IsOptional()
	@IsUUID()
	consumerId?: string;

	@IsOptional()
	@IsUUID()
	instanceId?: string;

	@IsOptional()
	@IsIn(STATUS_CLASS_NAMES)
	statusClass?: StatusClassName;
}

export function toTrafficWindowInput(query: TrafficWindowQueryDto): TrafficWindowInput {
	const hasRange = query.from !== undefined || query.to !== undefined;

	if (!hasRange) {
		return { kind: 'named', window: query.window ?? DEFAULT_TRAFFIC_WINDOW };
	}

	if (query.window !== undefined) {
		throw new ConfigValidationError('Use either "window" or "from"/"to", not both');
	}

	if (query.from === undefined || query.to === undefined) {
		throw new ConfigValidationError('"from" and "to" go together');
	}

	return { kind: 'range', from: new Date(query.from), to: new Date(query.to) };
}
