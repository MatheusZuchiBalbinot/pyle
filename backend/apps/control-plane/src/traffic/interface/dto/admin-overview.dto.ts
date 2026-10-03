import { ApiProperty } from '@nestjs/swagger';

import { ConfigChangeEventDto, ServiceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';
import { SystemHealthComponentStatusDto } from '../../../system-health/interface/dto/system-health-component-status.dto.js';
import { GatewayAlertDto } from '../../alerts/interface/dto/gateway-alert.dto.js';
import type { GatewayStatusDto, TrafficOverviewDto } from '../../domain/traffic-responses.js';

export class AdminOverviewDto {
	readonly generatedAt!: string;
	@ApiProperty({ type: [SystemHealthComponentStatusDto] })
	readonly systemHealth!: readonly SystemHealthComponentStatusDto[];
	readonly gateway!: GatewayStatusDto;
	readonly traffic!: TrafficOverviewDto;
	@ApiProperty({ type: [ServiceDto] })
	readonly services!: readonly ServiceDto[];
	@ApiProperty({ type: [GatewayAlertDto] })
	readonly openAlerts!: readonly GatewayAlertDto[];
	@ApiProperty({ type: [ConfigChangeEventDto] })
	readonly recentChanges!: readonly ConfigChangeEventDto[];
}
