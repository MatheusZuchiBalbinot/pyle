import { Injectable } from '@nestjs/common';

import { readGatewayConfig } from '@pyle/shared/config/gateway.js';

import { getAiApiKey, getAiModelId, getAiProvider } from '../../config/ai-provider.js';
import { getChaosConfig } from '../../config/chaos.js';
import { getRealtimeConfig } from '../../config/realtime.js';
import { getScalingConfig } from '../../config/scaling.js';
import { getSystemHealthCheckIntervalMs } from '../../config/system-health.js';
import { getAlertEvaluationIntervalMs, getConsumerPurgeAfterDays, getTrafficRetentionHours } from '../../config/traffic.js';
import { MAX_MANAGED_REPLICAS } from '../../scaling/domain/scaling-limits.js';
import type { PlatformSettingsDto } from '../interface/dto/platform-settings.dto.js';

@Injectable()
export class PlatformSettingsService {
	getSettings(): PlatformSettingsDto {
		const modelId = readOptional(getAiModelId);
		const hasApiKey = readOptional(getAiApiKey) !== null;
		// The gateway reads the same environment and has no page of its own.
		const gateway = readGatewayConfig();

		return {
			systemHealthCheckIntervalMs: getSystemHealthCheckIntervalMs(),
			gateway: {
				port: gateway.port,
				adminPort: gateway.adminPort,
				configRefreshMs: gateway.configRefreshMs,
				metricsFlushMs: gateway.metricsFlushMs,
				heartbeatMs: gateway.heartbeatMs,
				maxRequestTimeoutMs: gateway.maxRequestTimeoutMs,
				requestLogMaxEntries: gateway.requestLogMaxEntries,
				requestLogSuccessSampleRate: gateway.requestLogSuccessSampleRate,
			},
			traffic: {
				retentionHours: getTrafficRetentionHours(),
				alertEvaluationIntervalMs: getAlertEvaluationIntervalMs(),
				consumerPurgeAfterDays: getConsumerPurgeAfterDays(),
				isChaosAllowed: getChaosConfig().isAllowed,
			},
			scaling: { isAllowed: getScalingConfig().isAllowed, maxManagedReplicas: MAX_MANAGED_REPLICAS },
			ai: { provider: getAiProvider(), isConfigured: modelId !== null && hasApiKey, modelId },
			realtime: { consoleWebSocketUrl: getRealtimeConfig().publicWebSocketUrl },
		};
	}
}

// The lazily-read AI settings throw when absent — here that just means
// "not configured", which is exactly what the page should show.
function readOptional(read: () => string): string | null {
	try {
		return read();
	} catch {
		return null;
	}
}
