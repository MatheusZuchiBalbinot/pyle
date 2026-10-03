import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { SystemHealthModule } from '../system-health/system-health.module.js';
import { AlertEvaluatorScheduler } from './alerts/application/alert-evaluator.scheduler.js';
import { AlertRuleConfigService } from './alerts/application/alert-rule-config.service.js';
import { GatewayAlertService } from './alerts/application/gateway-alert.service.js';
import { AlertRuleConfigRepository } from './alerts/infrastructure/alert-rule-config.repository.js';
import { GatewayAlertRepository } from './alerts/infrastructure/gateway-alert.repository.js';
import { AlertRuleConfigController } from './alerts/interface/alert-rule-config.controller.js';
import { AlertsController } from './alerts/interface/alerts.controller.js';
import { AdminOverviewService } from './application/admin-overview.service.js';
import { GatewayEventRelayService } from './application/gateway-event-relay.service.js';
import { InstanceStateEventsService } from './application/instance-state-events.service.js';
import { RequestLogService } from './application/request-log.service.js';
import { TrafficQueryService } from './application/traffic-query.service.js';
import { InstanceStateEventRepository } from './infrastructure/instance-state-event.repository.js';
import { RequestLogReader } from './infrastructure/request-log.reader.js';
import { TrafficNamesRepository } from './infrastructure/traffic-names.repository.js';
import { TrafficSampleRepository } from './infrastructure/traffic-sample.repository.js';
import { AdminOverviewController } from './interface/admin-overview.controller.js';
import { TrafficController } from './interface/traffic.controller.js';
import { GatewayStatusModule } from './gateway-status.module.js';

@Module({
	imports: [ControlPlaneModule, AuthModule, RealtimeModule, GatewayConfigModule, SystemHealthModule, GatewayStatusModule],
	controllers: [TrafficController, AlertsController, AlertRuleConfigController, AdminOverviewController],
	providers: [
		TrafficSampleRepository,
		TrafficNamesRepository,
		RequestLogReader,
		InstanceStateEventRepository,
		GatewayAlertRepository,
		AlertRuleConfigRepository,
		TrafficQueryService,
		RequestLogService,
		AlertRuleConfigService,
		GatewayAlertService,
		AlertEvaluatorScheduler,
		InstanceStateEventsService,
		GatewayEventRelayService,
		AdminOverviewService,
	],
	exports: [
		TrafficQueryService,
		GatewayAlertService,
		AlertRuleConfigService,
		RequestLogService,
		RequestLogReader,
		InstanceStateEventRepository,
		TrafficNamesRepository,
	],
})
export class TrafficModule {}
