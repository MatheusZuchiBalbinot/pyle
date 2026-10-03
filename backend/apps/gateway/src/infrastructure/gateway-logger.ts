// JSON lines on stdout, with the gateway id on each.
type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Readonly<Record<string, unknown>>;

type LogWriter = (line: string) => void;

type Clock = () => number;

export class GatewayLogger {
	private readonly lastThrottledAt = new Map<string, number>();

	constructor(
		private readonly gatewayId: string,
		private readonly write: LogWriter = (line) => process.stdout.write(`${line}\n`),
		private readonly now: Clock = Date.now,
	) {}

	info(message: string, fields: LogFields = {}): void {
		this.log('info', message, fields);
	}

	warn(message: string, fields: LogFields = {}): void {
		this.log('warn', message, fields);
	}

	error(message: string, fields: LogFields = {}): void {
		this.log('error', message, fields);
	}

	// For conditions that repeat on every request (Redis down): one line per
	// key per interval, not one per request.
	warnThrottled(key: string, intervalMs: number, message: string, fields: LogFields = {}): void {
		const now = this.now();
		const last = this.lastThrottledAt.get(key);
		const isThrottled = last !== undefined && now - last < intervalMs;

		if (isThrottled) {
			return;
		}

		this.lastThrottledAt.set(key, now);
		this.warn(message, fields);
	}

	private log(level: LogLevel, message: string, fields: LogFields): void {
		const time = new Date(this.now()).toISOString();

		this.write(JSON.stringify({ ...fields, level, time, gatewayId: this.gatewayId, message }));
	}
}
