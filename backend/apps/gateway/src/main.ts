// Must run before any other import: the configuration readers need
// process.env populated.
import '@pyle/shared/config/load-backend-env.js';

import { readGatewayConfig } from '@pyle/shared/config/gateway.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { GatewayLogger } from './infrastructure/gateway-logger.js';
import { createGatewayPrisma } from './infrastructure/gateway-prisma.js';
import { createGatewayRedis } from './infrastructure/gateway-redis.js';
import { buildResilienceExtensions } from './resilience/resilience-extension.js';
import { buildTelemetryExtensions } from './telemetry/telemetry-extension.js';
import { GatewayApp, type GatewayAppOptions } from './gateway-app.js';

async function main(): Promise<void> {
	const config = readGatewayConfig();
	const logger = new GatewayLogger(config.gatewayId);
	const options: GatewayAppOptions = {
		config,
		logger,
		redis: createGatewayRedis(config.redisUrl),
		prisma: createGatewayPrisma(config.databaseUrl),
		extensions: [buildResilienceExtensions, buildTelemetryExtensions],
	};
	const app = new GatewayApp(options);

	const shutdown = (signal: string): void => {
		logger.info('Shutting down', { signal });
		app.stop().then(
			() => process.exit(0),
			(error: unknown) => {
				logger.error('Shutdown failed', { error: toErrorMessage(error) });
				process.exit(1);
			},
		);
	};

	process.once('SIGINT', () => shutdown('SIGINT'));
	process.once('SIGTERM', () => shutdown('SIGTERM'));
	await app.start();
}

main().catch((error: unknown) => {
	process.stderr.write(`[gateway] ${toErrorMessage(error)}\n`);
	process.exit(1);
});
