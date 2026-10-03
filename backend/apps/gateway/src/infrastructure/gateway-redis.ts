import { Redis } from 'ioredis';

// A subscribed ioredis client cannot run commands, so the data plane holds
// two connections: one for commands (rate limits, state, log), one for
// pub/sub.
export type GatewayRedis = {
	readonly commands: Redis;
	readonly subscriber: Redis;
};

// Fail a command fast instead of queueing it while Redis is down: a rate
// limit check must not hold a request hostage.
const MAX_RETRIES_PER_REQUEST = 1;

export function createGatewayRedis(url: string): GatewayRedis {
	const options = { maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST, lazyConnect: true };

	return { commands: new Redis(url, options), subscriber: new Redis(url, options) };
}
