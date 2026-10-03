// The console declares the admin API's responses by hand (frontend/src/app/api).
// This file fails to compile when one of them stops matching the DTO the control
// plane really sends: `npm run typecheck:contract`, in CI. Nothing here runs.

import type { GatewayHeartbeat } from '@pyle/shared/contracts/instance-live-state.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import type * as Console from '../../../frontend/src/app/api/adminApiTypes.ts';
import type { AdminSession as ConsoleAdminSession } from '../../../frontend/src/app/api/authSession.ts';
import type {
	AdminNotification as ConsoleNotification,
	AdminNotificationsPage as ConsoleNotificationsPage,
} from '../../../frontend/src/app/api/notificationTypes.ts';
import type {
	RealtimeConnection as ConsoleRealtimeConnection,
	RealtimeEvent as ConsoleRealtimeEvent,
} from '../../../frontend/src/app/api/realtimeEvents.ts';
import type {
	AdminNotificationDto,
	AdminNotificationsPageDto,
} from '../../apps/control-plane/src/admin-notifications/interface/dto/admin-notification.dto.js';
import type { AiAnalysisDto, AiAnalysisMessageDto } from '../../apps/control-plane/src/ai-analysis/interface/dto/ai-analysis.dto.js';
import type { GenerateAnalysisDto } from '../../apps/control-plane/src/ai-analysis/interface/dto/generate-analysis.dto.js';
import type { AssistantReply } from '../../apps/control-plane/src/ai-assistant/application/ai-assistant.service.js';
import type { AssistantTurnDto } from '../../apps/control-plane/src/ai-assistant/interface/dto/assistant-turn.dto.js';
import type { LoggedInResponse } from '../../apps/control-plane/src/auth/interface/dto/admin-session.dto.js';
import type { Page } from '../../apps/control-plane/src/common/pagination.js';
import type { ChaosStateDto } from '../../apps/control-plane/src/gateway-config/interface/dto/chaos.dto.js';
import type { CreateConsumerDto, IssueApiKeyDto, UpdateConsumerDto } from '../../apps/control-plane/src/gateway-config/interface/dto/consumer.dto.js';
import type {
	ApiKeyCreatedDto,
	ApiKeyDto,
	ConfigChangeEventDto,
	ConsumerCreatedDto,
	ConsumerDto,
	InstanceDto,
	RouteDto,
	ServiceDto,
} from '../../apps/control-plane/src/gateway-config/interface/dto/gateway-config-responses.js';
import type { CreateInstanceDto, UpdateInstanceDto } from '../../apps/control-plane/src/gateway-config/interface/dto/instance.dto.js';
import type { CreateRouteDto, UpdateRouteDto } from '../../apps/control-plane/src/gateway-config/interface/dto/route.dto.js';
import type { CreateServiceDto, UpdateServiceDto } from '../../apps/control-plane/src/gateway-config/interface/dto/service.dto.js';
import type { PlatformSettingsDto } from '../../apps/control-plane/src/platform-settings/interface/dto/platform-settings.dto.js';
import type { RealtimeEvent } from '../../apps/control-plane/src/realtime/domain/realtime-event.js';
import type { RealtimeConnectionDto } from '../../apps/control-plane/src/realtime/interface/dto/realtime-connection.dto.js';
import type { SystemHealthComponentStatusDto } from '../../apps/control-plane/src/system-health/interface/dto/system-health-component-status.dto.js';
import type { SystemHealthEventDto } from '../../apps/control-plane/src/system-health/interface/dto/system-health-event.dto.js';
import type { AlertRuleConfigDto } from '../../apps/control-plane/src/traffic/alerts/interface/dto/alert-rule-config.dto.js';
import type { GatewayAlertDto } from '../../apps/control-plane/src/traffic/alerts/interface/dto/gateway-alert.dto.js';
import type { UpdateAlertRuleConfigDto } from '../../apps/control-plane/src/traffic/alerts/interface/dto/update-alert-rule-config.dto.js';
import type {
	ConsumerRouteUsageDto,
	ConsumerTrafficDto,
	GatewayStatusDto,
	InstanceTrafficDto,
	RouteTrafficDto,
	RouteTrafficSummaryDto,
	ServiceTrafficDto,
	StatusBreakdownDto,
	TopConsumerDto,
	TrafficOverviewDto,
} from '../../apps/control-plane/src/traffic/domain/traffic-responses.js';
import type { AdminOverviewDto } from '../../apps/control-plane/src/traffic/interface/dto/admin-overview.dto.js';

export type AdminApiContract = [
	Matches<IsSame<ServiceDto, Console.Service>>,
	Matches<IsSame<InstanceDto, Console.ServiceInstance>>,
	Matches<IsSame<RouteDto, Console.Route>>,
	Matches<IsSame<ConsumerDto, Console.Consumer>>,
	Matches<IsSame<ConsumerCreatedDto, Console.ConsumerCreated>>,
	Matches<IsSame<ApiKeyDto, Console.ApiKey>>,
	Matches<IsSame<ApiKeyCreatedDto, Console.ApiKeyCreated>>,
	Matches<IsSame<ConfigChangeEventDto, Console.ConfigChangeEvent>>,
	Matches<IsSame<Page<ConfigChangeEventDto>, Console.Page<Console.ConfigChangeEvent>>>,
	Matches<IsSame<TrafficOverviewDto, Console.TrafficOverview>>,
	Matches<IsSame<RouteTrafficSummaryDto, Console.RouteTrafficSummary>>,
	Matches<IsSame<TopConsumerDto, Console.TopConsumer>>,
	Matches<IsSame<RouteTrafficDto, Console.RouteTraffic>>,
	Matches<IsSame<InstanceTrafficDto, Console.InstanceTraffic>>,
	Matches<IsSame<StatusBreakdownDto, Console.StatusBreakdown>>,
	Matches<IsSame<ServiceTrafficDto, Console.ServiceTraffic>>,
	Matches<IsSame<ConsumerTrafficDto, Console.ConsumerTraffic>>,
	Matches<IsSame<ConsumerRouteUsageDto, Console.ConsumerRouteUsage>>,
	Matches<IsSame<GatewayStatusDto, Console.GatewayStatus>>,
	Matches<IsSame<GatewayHeartbeat, Console.GatewayHeartbeat>>,
	Matches<IsSame<RequestLogEntry, Console.RequestLogEntry>>,
	Matches<IsSame<GatewayAlertDto, Console.GatewayAlert>>,
	Matches<IsSame<AlertRuleConfigDto, Console.AlertRuleConfig>>,
	Matches<IsSame<SystemHealthComponentStatusDto, Console.SystemHealthComponentStatus>>,
	Matches<IsSame<SystemHealthEventDto, Console.SystemHealthEvent>>,
	Matches<IsSame<PlatformSettingsDto, Console.PlatformSettings>>,
	Matches<IsSame<AdminOverviewDto, Console.AdminOverview>>,
	Matches<IsSame<AiAnalysisDto, Console.AiAnalysis>>,
	Matches<IsSame<AiAnalysisMessageDto, Console.AiAnalysisMessage>>,
	Matches<IsSame<AssistantReply, Console.AssistantReply>>,
	Matches<IsSame<AdminNotificationDto, ConsoleNotification>>,
	Matches<IsSame<AdminNotificationsPageDto, ConsoleNotificationsPage>>,
	Matches<IsSame<RealtimeConnectionDto, ConsoleRealtimeConnection>>,
	Matches<IsSame<RealtimeEvent, ConsoleRealtimeEvent>>,
	Matches<IsSame<LoggedInResponse, ConsoleAdminSession>>,
];

export type AdminApiRequestContract = [
	Matches<IsAccepted<Console.CreateServiceInput, CreateServiceDto>>,
	Matches<IsAccepted<Console.UpdateServiceInput, UpdateServiceDto>>,
	Matches<IsAccepted<Console.CreateInstanceInput, CreateInstanceDto>>,
	Matches<IsAccepted<Console.UpdateInstanceInput, UpdateInstanceDto>>,
	Matches<IsAccepted<Console.ChaosState, ChaosStateDto>>,
	Matches<IsAccepted<Console.CreateRouteInput, CreateRouteDto>>,
	Matches<IsAccepted<Console.UpdateRouteInput, UpdateRouteDto>>,
	Matches<IsAccepted<Console.CreateConsumerInput, CreateConsumerDto>>,
	Matches<IsAccepted<Console.UpdateConsumerInput, UpdateConsumerDto>>,
	Matches<IsAccepted<Console.IssueApiKeyInput, IssueApiKeyDto>>,
	Matches<IsAccepted<Console.UpdateAlertRuleConfigInput, UpdateAlertRuleConfigDto>>,
	Matches<IsAccepted<Console.GenerateAiAnalysisInput, GenerateAnalysisDto>>,
	Matches<IsAccepted<Console.AssistantTurnInput, AssistantTurnDto>>,
];

// What JSON.stringify leaves of a value, with readonly-ness ignored on both
// sides: the console only reads, so mutability is not part of the contract.
type Wire<T> = T extends Date
	? string
	: T extends readonly (infer Item)[]
		? readonly Wire<Item>[]
		: T extends object
			? { readonly [Key in keyof T as T[Key] extends (...args: never[]) => unknown ? never : Key]: Wire<T[Key]> }
			: T;

type IsSame<Sent, Declared> = [Wire<Sent>] extends [Wire<Declared>] ? ([Wire<Declared>] extends [Wire<Sent>] ? true : false) : false;

// Everything the console may send passes the endpoint's validation DTO.
type IsAccepted<Sent, Accepted> = [Wire<Sent>] extends [Wire<Accepted>] ? true : false;

// A pair that drifted fails here, naming the alias.
type Matches<Check extends true> = Check;
