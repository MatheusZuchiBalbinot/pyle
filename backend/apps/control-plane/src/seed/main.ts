import { parseArgs } from 'node:util';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';

import { ensureAdminAccount, type AdminAccountDependencies, type EnsuredAdminAccount } from '../auth/application/ensure-admin-account.js';
import { PasswordHasher } from '../auth/application/password-hasher.js';
import { AdminUserRepository } from '../auth/infrastructure/admin-user.repository.js';
import { ControlPlaneRedisService } from '../control-plane/redis/control-plane-redis.service.js';
import { deleteManifest, mergeManifests, readManifest, writeManifest } from './consumer-keys-manifest.js';
import { readDevAdminAccount } from './dev-admin-account.js';
import { SeedAdminApiClient } from './seed-admin-api.client.js';
import { readSeedConfig, type SeedConfig } from './seed-config.js';
import { SeedGatewayService } from './seed-gateway.service.js';
import { SeedTrafficRepository } from './seed-traffic.repository.js';
import { SeedModule } from './seed.module.js';
import { createSeededRandom, synthesizeTraffic } from './synthesize-traffic.js';

const USAGE = [
	'Usage:',
	'  npm run seed         dev admin, the demo gateway (services, routes, consumers, keys) and 24 h of traffic history',
	'  npm run seed:clean   removes the demo gateway and its history',
	'  npm run seed:admin   only the dev admin account',
	'',
	'The gateway is created through the admin API: the control plane must be running (npm run start:dev).',
	'The dev admin account comes from DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD.',
].join('\n');

// Fixed, so every fresh seed tells the same story.
const HISTORY_RANDOM_SEED = 20_260_926;
const PROGRESS_LOG_EVERY = 50_000;

type SeedCommand = 'seed' | 'clean' | 'admin';

function parseCommand(argv: readonly string[]): SeedCommand {
	const { values, positionals } = parseArgs({ args: [...argv], options: { help: { type: 'boolean' } }, allowPositionals: true });

	if (values.help) {
		console.log(USAGE);
		process.exit(0);
	}

	if (positionals[0] === 'clean') {
		return 'clean';
	}

	if (positionals[0] === 'admin') {
		return 'admin';
	}

	return 'seed';
}

const DEV_ADMIN_OUTCOME_LABELS: Readonly<Record<EnsuredAdminAccount['outcome'], string>> = { created: 'created', 'password-reset': 'password set' };

// Set on every run, so the password is always the one in .env.
async function seedDevAdmin(app: INestApplicationContext, logger: Logger): Promise<void> {
	const account = readDevAdminAccount(process.env);
	const dependencies: AdminAccountDependencies = { repository: app.get(AdminUserRepository), hasher: app.get(PasswordHasher) };
	const ensured = await ensureAdminAccount(dependencies, account);

	logger.log(`Dev admin ${DEV_ADMIN_OUTCOME_LABELS[ensured.outcome]}: ${ensured.email} (password from DEV_ADMIN_PASSWORD)`);
}

async function seedGateway(config: SeedConfig, logger: Logger): Promise<void> {
	const client = new SeedAdminApiClient({ baseUrl: config.controlPlaneUrl, token: config.adminApiToken });
	const result = await new SeedGatewayService({ client, instanceHost: config.instanceHost, log: (message) => logger.log(message) }).seed();

	logger.log(`Gateway: ${result.createdCount} created, ${result.skippedCount} kept as they were`);
	const hasNewKeys = Object.keys(result.keys).length > 0;

	if (!hasNewKeys) {
		return;
	}

	writeManifest(config.manifestPath, mergeManifests(readManifest(config.manifestPath), result.keys));
	logger.warn(`API keys written IN CLEAR to ${config.manifestPath} (git-ignored; the load bot reads them). Never commit it.`);
}

// Logs about every PROGRESS_LOG_EVERY rows, and the last batch.
function progressLogger(logger: Logger): (written: number, total: number) => void {
	let nextMilestone = PROGRESS_LOG_EVERY;

	return (written, total) => {
		const isMilestone = written >= nextMilestone || written === total;

		if (!isMilestone) {
			return;
		}

		nextMilestone = written + PROGRESS_LOG_EVERY;
		logger.log(`  ${written}/${total}`);
	};
}

async function seedHistory(app: INestApplicationContext, logger: Logger): Promise<void> {
	const repository = app.get(SeedTrafficRepository);

	if (await repository.hasHistory()) {
		logger.log('Traffic history already present; kept as it is (npm run seed:clean to start over)');

		return;
	}

	const catalog = await repository.loadCatalog();
	const history = synthesizeTraffic({
		catalog,
		nowMs: Date.now(),
		random: createSeededRandom(HISTORY_RANDOM_SEED),
		hourOf: (timestampMs) => new Date(timestampMs).getHours(),
	});

	logger.log(`Writing 24 h of traffic history: ${history.instanceSamples.length + history.consumerSamples.length} samples`);
	await repository.writeHistory(history, progressLogger(logger));
	logger.log(
		`History written: ${history.stateEvents.length} instance state changes, ${history.alerts.length} resolved alerts, ${history.configChanges.length} configuration change`,
	);
}

async function clean(app: INestApplicationContext, config: SeedConfig, logger: Logger): Promise<void> {
	await app.get(SeedTrafficRepository).clean();
	deleteManifest(config.manifestPath);
	// The gateways would reload within GATEWAY_CONFIG_REFRESH_MS anyway;
	// this makes it immediate.
	const change = JSON.stringify({ entity: 'service', id: 'seed', action: 'deleted' });

	await app.get(ControlPlaneRedisService).publish(CONFIG_CHANGED_CHANNEL, change);
	logger.log('Demo gateway, its history and the key manifest removed');
}

async function run(command: SeedCommand, app: INestApplicationContext, logger: Logger): Promise<void> {
	if (command === 'admin') {
		return seedDevAdmin(app, logger);
	}

	const config = readSeedConfig();

	if (command === 'clean') {
		return clean(app, config, logger);
	}

	if (command === 'seed') {
		await seedDevAdmin(app, logger);
		await seedGateway(config, logger);

		return seedHistory(app, logger);
	}

	return assertUnreachable(command);
}

async function main(): Promise<void> {
	const command = parseCommand(process.argv.slice(2));
	const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'warn', 'error'] });

	try {
		await run(command, app, new Logger('seed'));
	} finally {
		await app.close();
	}
}

main().catch((error: unknown) => {
	console.error(`[seed] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
