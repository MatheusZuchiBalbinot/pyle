import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/control-plane-client';

import type { GatewayConfig } from '@pyle/shared/config/gateway.js';
import type { GatewayConfigSnapshot } from '@pyle/shared/contracts/config-snapshot.js';
import type { ConfigChangedMessage } from '@pyle/shared/contracts/gateway-events.js';
import { loadGatewayConfig } from '@pyle/shared/snapshot/load-gateway-config.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { createAdminServer, type AdminServerOptions } from './admin/admin-server.js';
import { ApiKeyCache, type ResolvedKey } from './auth/api-key-cache.js';
import { KeyUsageTracker, type KeyUsageTrackerOptions } from './auth/key-usage-tracker.js';
import { PerServiceLoadBalancerRegistry, roundRobinForEveryStrategy, type BalancerFactory } from './balancing/load-balancer-registry.js';
import { ConfigReloader, type ConfigReloaderOptions } from './config/config-reloader.js';
import { ConfigStore } from './config/config-store.js';
import { NoopAttemptObserver, type AttemptObserver } from './contracts/attempt-observer.js';
import { NoopGatewayEventSink, type GatewayEventSink } from './contracts/gateway-event-sink.js';
import { AlwaysAvailable, type InstanceAvailability } from './contracts/instance-availability.js';
import { EmptyInstanceStateSource, type InstanceStateSource } from './contracts/instance-state-source.js';
import { composeRequestObservers, type RequestObserver } from './contracts/request-observer.js';
import { NoRetryPolicy, type RetryPolicy } from './contracts/retry-policy.js';
import type { GatewayLogger } from './infrastructure/gateway-logger.js';
import type { GatewayRedis } from './infrastructure/gateway-redis.js';
import { createRequestHandler, type RequestHandlerDependencies } from './pipeline/handle-request.js';
import type { ForwardDependencies } from './proxy/forward-with-retry.js';
import { UpstreamAgents } from './proxy/upstream-agents.js';
import { sendAttempt } from './proxy/upstream-attempt.js';
import { GatewayRateLimiter } from './rate-limit/gateway-rate-limiter.js';
import type { RouteTable } from './routing/route-table.js';
import { GatewayMetrics, type GatewayMetricsSources } from './telemetry/gateway-metrics.js';

// Waits for the database at boot instead of crashing when the gateway comes
// up before Postgres (compose, a restart of both).
export const INITIAL_LOAD_ATTEMPTS = 10;
const INITIAL_LOAD_RETRY_MS = 1000;
// In-flight requests get this long to finish on shutdown.
const SHUTDOWN_GRACE_MS = 10_000;
// Longer than a typical load balancer's idle timeout, so the balancer (not
// the gateway) closes idle keep-alive connections.
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
const HEADERS_TIMEOUT_MS = 66_000;
// How long "rate limiting degraded" stays flagged after the last failure,
// and the log interval of repeating warnings.
const RATE_LIMIT_DEGRADED_WINDOW_MS = 60_000;

export type GatewayContext = {
	readonly config: GatewayConfig;
	readonly logger: GatewayLogger;
	readonly redis: GatewayRedis;
	readonly prisma: PrismaClient;
	readonly now: () => number;
	readonly startedAtMs: number;
	readonly currentConfigVersion: () => number | null;
	// Whether the rate limiter failed open recently (Redis unreachable).
	readonly isRateLimitDegraded: () => boolean;
	// The merged extensions' pieces, resolved at call time: one extension
	// uses what another provides (resilience emits through telemetry's sink,
	// telemetry mirrors resilience's state).
	readonly eventSink: () => GatewayEventSink;
	readonly instanceStates: () => InstanceStateSource;
};

export type GatewayLifecycleHook = {
	// After the first configuration is loaded, before traffic is accepted.
	readonly start?: (table: RouteTable) => Promise<void> | void;
	// After every configuration swap (the first one included).
	readonly onConfigApplied?: (table: RouteTable) => void;
	// On shutdown, after traffic stopped.
	readonly stop?: () => Promise<void> | void;
};

// No-op defaults: the core runs on its own.
export type GatewayExtensions = {
	readonly availability: InstanceAvailability;
	readonly attemptObserver: AttemptObserver;
	readonly retryPolicy: RetryPolicy;
	readonly balancerFactory: BalancerFactory;
	readonly requestObservers: readonly RequestObserver[];
	readonly eventSink: GatewayEventSink;
	readonly instanceStates: InstanceStateSource;
	readonly hooks: readonly GatewayLifecycleHook[];
};

export type ExtensionBuilder = (context: GatewayContext) => Partial<GatewayExtensions>;

export type GatewayAppOptions = {
	readonly config: GatewayConfig;
	readonly logger: GatewayLogger;
	readonly redis: GatewayRedis;
	readonly prisma: PrismaClient;
	readonly now?: () => number;
	readonly extensions?: readonly ExtensionBuilder[];
	readonly sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_EXTENSIONS: GatewayExtensions = {
	availability: new AlwaysAvailable(),
	attemptObserver: new NoopAttemptObserver(),
	retryPolicy: new NoRetryPolicy(),
	balancerFactory: roundRobinForEveryStrategy,
	requestObservers: [],
	eventSink: new NoopGatewayEventSink(),
	instanceStates: new EmptyInstanceStateSource(),
	hooks: [],
};

export class GatewayApp {
	private readonly now: () => number;
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly startedAtMs: number;
	private readonly store = new ConfigStore();
	private readonly agents = new UpstreamAgents();
	private readonly keys: ApiKeyCache;
	private readonly extensions: GatewayExtensions;
	private readonly balancers: PerServiceLoadBalancerRegistry;
	private readonly reloader: ConfigReloader;
	private readonly trafficServer: Server;
	private readonly adminServer: Server;
	private readonly metrics: GatewayMetrics;
	private rateLimitDegradedAt: number | null = null;
	private trafficPort: number | null = null;
	private adminPort: number | null = null;

	constructor(private readonly options: GatewayAppOptions) {
		this.now = options.now ?? Date.now;
		this.sleep = options.sleep ?? defaultSleep;
		this.startedAtMs = this.now();
		this.keys = new ApiKeyCache({ lookup: (keyHash) => this.lookupKey(keyHash), now: this.now });
		const context = this.buildContext();

		this.extensions = mergeExtensions((options.extensions ?? []).map((build) => build(context)));
		const metricsSources: GatewayMetricsSources = {
			gatewayId: options.config.gatewayId,
			startedAtMs: this.startedAtMs,
			now: this.now,
			configVersion: context.currentConfigVersion,
			isRateLimitDegraded: context.isRateLimitDegraded,
			instanceStates: context.instanceStates,
		};

		this.metrics = new GatewayMetrics(metricsSources);
		this.balancers = new PerServiceLoadBalancerRegistry(this.extensions.balancerFactory);
		const reloaderOptions: ConfigReloaderOptions = {
			load: () => loadGatewayConfig(options.prisma, this.now()),
			store: this.store,
			subscriber: options.redis.subscriber,
			logger: options.logger,
			refreshMs: options.config.configRefreshMs,
			onApplied: (table) => this.applyConfig(table),
			onChangeMessage: (message) => this.handleChangeMessage(message),
		};

		this.reloader = new ConfigReloader(reloaderOptions);
		this.trafficServer = this.buildTrafficServer();
		const adminOptions: AdminServerOptions = {
			gatewayId: options.config.gatewayId,
			startedAtMs: this.startedAtMs,
			now: this.now,
			configVersion: () => this.store.current()?.snapshot.version ?? null,
			pingRedis: () => options.redis.commands.ping(),
			pingPostgres: () => options.prisma.$queryRaw`SELECT 1`,
			renderMetrics: () => this.metrics.render(),
		};

		this.adminServer = createAdminServer(adminOptions);
	}

	// Ports actually bound (0 in the config picks a free one, as tests do).
	get ports(): { readonly traffic: number | null; readonly admin: number | null } {
		return { traffic: this.trafficPort, admin: this.adminPort };
	}

	async start(): Promise<void> {
		const { logger, config } = this.options;

		await Promise.all([this.options.redis.commands.connect(), this.options.redis.subscriber.connect()]);
		const table = await this.loadInitialConfig();

		for (const hook of this.extensions.hooks) {
			await hook.start?.(table);
		}

		await this.reloader.start();
		this.adminPort = await listen(this.adminServer, config.adminPort);
		this.trafficPort = await listen(this.trafficServer, config.port);
		this.extensions.eventSink.emit({ type: 'gateway.started', gatewayId: config.gatewayId, occurredAt: new Date(this.now()).toISOString() });
		logger.info('Gateway listening', { port: this.trafficPort, adminPort: this.adminPort, configVersion: table.snapshot.version });
	}

	async stop(): Promise<void> {
		const drained = close(this.trafficServer);
		const grace = this.sleep(SHUTDOWN_GRACE_MS).then(() => this.trafficServer.closeAllConnections());

		await Promise.race([drained, grace]);
		await this.reloader.stop();

		for (const hook of this.extensions.hooks) {
			await hook.stop?.();
		}

		await close(this.adminServer);
		this.agents.destroyAll();
		await Promise.allSettled([this.options.redis.commands.quit(), this.options.redis.subscriber.quit(), this.options.prisma.$disconnect()]);
		this.options.logger.info('Gateway stopped');
	}

	private buildContext(): GatewayContext {
		return {
			config: this.options.config,
			logger: this.options.logger,
			redis: this.options.redis,
			prisma: this.options.prisma,
			now: this.now,
			startedAtMs: this.startedAtMs,
			currentConfigVersion: () => this.store.current()?.snapshot.version ?? null,
			isRateLimitDegraded: () => this.isRateLimitDegraded(),
			eventSink: () => this.extensions.eventSink,
			instanceStates: () => this.extensions.instanceStates,
		};
	}

	private buildTrafficServer(): Server {
		const { logger, config } = this.options;
		const keyUsageOptions: KeyUsageTrackerOptions = {
			write: (keyId, usedAt) => this.recordKeyUsage(keyId, usedAt),
			onError: (error) =>
				logger.warnThrottled('key-usage', RATE_LIMIT_DEGRADED_WINDOW_MS, 'Could not record API key usage', { error: toErrorMessage(error) }),
			now: this.now,
		};
		const forward: ForwardDependencies = {
			availability: this.extensions.availability,
			attemptObserver: this.extensions.attemptObserver,
			retryPolicy: this.extensions.retryPolicy,
			agents: this.agents,
			sendAttempt,
			now: this.now,
		};

		const reportObserverError = (error: unknown): void => {
			logger.warnThrottled('request-observer', RATE_LIMIT_DEGRADED_WINDOW_MS, 'A request observer failed', { error: toErrorMessage(error) });
		};

		const dependencies: RequestHandlerDependencies = {
			store: this.store,
			keys: this.keys,
			keyUsage: new KeyUsageTracker(keyUsageOptions),
			rateLimiter: new GatewayRateLimiter(this.options.redis.commands),
			balancers: this.balancers,
			forward,
			requestObserver: composeRequestObservers([this.metrics, ...this.extensions.requestObservers], reportObserverError),
			logger,
			maxRequestTimeoutMs: config.maxRequestTimeoutMs,
			now: this.now,
			onRateLimitDegraded: () => this.markRateLimitDegraded(),
		};
		const server = createServer(createRequestHandler(dependencies));

		server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
		server.headersTimeout = HEADERS_TIMEOUT_MS;

		return server;
	}

	private async recordKeyUsage(keyId: string, usedAt: Date): Promise<void> {
		await this.options.prisma.apiKey.updateMany({ where: { id: keyId }, data: { lastUsedAt: usedAt } });
	}

	private markRateLimitDegraded(): void {
		this.rateLimitDegradedAt = this.now();
	}

	// A key or a consumer changed: forget every cached key (a revoked one
	// must stop working now, not when its cache entry expires).
	private handleChangeMessage(message: ConfigChangedMessage): void {
		const touchesKeys = message.entity === 'api_key' || message.entity === 'consumer';

		if (touchesKeys) {
			this.keys.clear();
		}
	}

	private isRateLimitDegraded(): boolean {
		if (this.rateLimitDegradedAt === null) {
			return false;
		}

		return this.now() - this.rateLimitDegradedAt < RATE_LIMIT_DEGRADED_WINDOW_MS;
	}

	private async loadInitialConfig(): Promise<RouteTable> {
		for (let attempt = 1; attempt <= INITIAL_LOAD_ATTEMPTS; attempt++) {
			const isLoaded = await this.reloader.reloadNow();
			const table = this.store.current();

			if (isLoaded && table) {
				return table;
			}

			this.options.logger.warn('Configuration not loaded yet; retrying', { attempt });
			await this.sleep(INITIAL_LOAD_RETRY_MS);
		}

		throw new Error(`Could not load the gateway configuration after ${INITIAL_LOAD_ATTEMPTS} attempts`);
	}

	private applyConfig(table: RouteTable): void {
		const snapshot: GatewayConfigSnapshot = table.snapshot;

		this.balancers.retainOnly(new Set(snapshot.services.map((service) => service.id)));
		this.agents.retainOnly(new Set(snapshot.services.flatMap((service) => service.instances.map((instance) => instance.id))));
		this.metrics.onConfigApplied(table);

		for (const hook of this.extensions.hooks) {
			hook.onConfigApplied?.(table);
		}

		const occurredAt = new Date(this.now()).toISOString();

		this.extensions.eventSink.emit({
			type: 'gateway.config.applied',
			gatewayId: this.options.config.gatewayId,
			version: snapshot.version,
			occurredAt,
		});
	}

	private async lookupKey(keyHash: string): Promise<ResolvedKey | null> {
		const where = { keyHash, revokedAt: null, consumer: { deletedAt: null } };
		const key = await this.options.prisma.apiKey.findFirst({ where, select: { id: true, consumerId: true } });

		return key ? { keyId: key.id, consumerId: key.consumerId } : null;
	}
}

// Later builders win for single values; lists (observers, hooks) add up.
function mergeExtensions(parts: readonly Partial<GatewayExtensions>[]): GatewayExtensions {
	return parts.reduce<GatewayExtensions>(
		(merged, part) => ({
			...merged,
			...part,
			requestObservers: [...merged.requestObservers, ...(part.requestObservers ?? [])],
			hooks: [...merged.hooks, ...(part.hooks ?? [])],
		}),
		DEFAULT_EXTENSIONS,
	);
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, () => resolve((server.address() as AddressInfo).port));
	});
}

function close(server: Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}
