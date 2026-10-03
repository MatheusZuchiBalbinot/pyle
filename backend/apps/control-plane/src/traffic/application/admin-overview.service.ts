import { Injectable } from '@nestjs/common';

import { ConfigActivityService } from '../../gateway-config/application/config-activity.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { SystemHealthService } from '../../system-health/application/system-health.service.js';
import { GatewayAlertService } from '../alerts/application/gateway-alert.service.js';
import type { AdminOverviewDto } from '../interface/dto/admin-overview.dto.js';
import { GatewayStatusService } from './gateway-status.service.js';
import { TrafficQueryService } from './traffic-query.service.js';

const RECENT_CHANGES_LIMIT = 20;
const OVERVIEW_TRAFFIC_WINDOW = '1h';

@Injectable()
export class AdminOverviewService {
	constructor(
		private readonly systemHealth: SystemHealthService,
		private readonly gatewayStatus: GatewayStatusService,
		private readonly traffic: TrafficQueryService,
		private readonly services: ServicesService,
		private readonly alerts: GatewayAlertService,
		private readonly activity: ConfigActivityService,
	) {}

	async overview(): Promise<AdminOverviewDto> {
		const [gateway, traffic, services, openAlerts, recentChanges] = await Promise.all([
			this.gatewayStatus.status(),
			this.traffic.overview({ kind: 'named', window: OVERVIEW_TRAFFIC_WINDOW }),
			this.services.list(),
			this.alerts.listOpen(),
			this.activity.list({}, { cursor: null, limit: RECENT_CHANGES_LIMIT }),
		]);
		const systemHealth = this.systemHealth.getCurrentStatus();

		return { generatedAt: new Date().toISOString(), systemHealth, gateway, traffic, services, openAlerts, recentChanges: recentChanges.items };
	}
}
