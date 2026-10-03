import type { ExtensionBuilder, GatewayExtensions, GatewayLifecycleHook } from '../gateway-app.js';
import type { RouteTable } from '../routing/route-table.js';
import { Heartbeat } from './heartbeat.js';
import { InstanceStateMirror } from './instance-state-mirror.js';
import { RedisEventSink } from './redis-event-sink.js';
import { RequestLogWriter } from './request-log-writer.js';
import { TrafficAggregator } from './traffic-aggregator.js';
import { createPrismaSampleWriter, TrafficFlusher } from './traffic-flusher.js';

function instanceIdsOf(table: RouteTable): ReadonlySet<string> {
	return new Set(table.snapshot.services.flatMap((service) => service.instances.map((instance) => instance.id)));
}

export const buildTelemetryExtensions: ExtensionBuilder = (context) => {
	const { config, logger, now } = context;
	const redis = context.redis.commands;
	const aggregator = new TrafficAggregator();
	const flusher = new TrafficFlusher({
		gatewayId: config.gatewayId,
		aggregator,
		write: createPrismaSampleWriter(context.prisma),
		eventSink: context.eventSink,
		logger,
		now,
	});
	const requestLog = new RequestLogWriter({
		redis,
		maxEntries: config.requestLogMaxEntries,
		successSampleRate: config.requestLogSuccessSampleRate,
		random: Math.random,
		logger,
	});
	const mirror = new InstanceStateMirror({ redis, gatewayId: config.gatewayId, source: context.instanceStates, now, logger });
	const heartbeat = new Heartbeat({
		redis,
		gatewayId: config.gatewayId,
		startedAtMs: context.startedAtMs,
		intervalMs: config.heartbeatMs,
		configVersion: context.currentConfigVersion,
		isRateLimitDegraded: context.isRateLimitDegraded,
		now,
		logger,
		onBeat: () => mirror.writeAll(),
	});

	function start(): void {
		flusher.start();
		requestLog.start();
		mirror.start();
		heartbeat.start();
	}

	// Traffic has stopped: say goodbye, then write what is left.
	async function stop(): Promise<void> {
		mirror.stop();
		await heartbeat.stop();
		await requestLog.stop();
		await flusher.stop();
	}

	const hook: GatewayLifecycleHook = { start, onConfigApplied: (table) => void mirror.retainOnly(instanceIdsOf(table)), stop };
	const extensions: Partial<GatewayExtensions> = {
		requestObservers: [aggregator, requestLog],
		eventSink: new RedisEventSink(redis, logger),
		hooks: [hook],
	};

	return extensions;
};
