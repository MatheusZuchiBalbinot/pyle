// INCR, and start the expiry on the first hit. Returns [hits, remaining ms].
const INCREMENT_FIXED_WINDOW_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {hits, redis.call('PTTL', KEYS[1])}
`;

export type RedisScriptRunner = {
	eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
};

export type FixedWindowCount = {
	readonly count: number;
	// Epoch ms when the window's counter expires.
	readonly resetAtMs: number;
};

export type FixedWindowInput = {
	readonly key: string;
	readonly windowMs: number;
	readonly nowMs: number;
};

type ScriptResult = readonly [hits: number, ttlMs: number];

// The key carries the window start, so every process agrees on the window. A key that lost
// its TTL resets after one window.
export async function incrementFixedWindow(redis: RedisScriptRunner, input: FixedWindowInput): Promise<FixedWindowCount> {
	const result = (await redis.eval(INCREMENT_FIXED_WINDOW_SCRIPT, 1, input.key, input.windowMs)) as ScriptResult;
	const [count, ttlMs] = result;
	const remainingMs = ttlMs > 0 ? ttlMs : input.windowMs;

	return { count, resetAtMs: input.nowMs + remainingMs };
}
