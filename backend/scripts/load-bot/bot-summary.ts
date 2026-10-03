import { bucketIndexFor, emptyHistogram, percentileFromHistogram } from '@pyle/shared/contracts/latency-histogram.js';

// The whole run, for the budget check.
export type RunTotals = { readonly requests: number; readonly p95Ms: number | null; readonly serverErrorRate: number };

type BotResult = {
	readonly routePrefix: string;
	readonly status: number;
	// Null when the gateway answered itself (401, 429, 503...).
	readonly instance: string | null;
	readonly latencyMs: number;
};

type Tally = { count: number; readonly latencies: number[] };

const NO_INSTANCE_LABEL = '(gateway)';
const P50 = 0.5;
const P95 = 0.95;
const FIRST_SERVER_ERROR_STATUS = 500;
const NETWORK_ERROR_STATUS = 0;

// Bounded by distinct routes, instances and statuses, not by the number of requests.
export class BotSummary {
	private readonly byStatus = new Map<number, number>();
	private readonly byRouteInstance = new Map<string, Map<string, number>>();
	private window: Tally = { count: 0, latencies: [] };
	// Fixed buckets, like the gateway's: the whole run's percentile in constant memory.
	private readonly runHistogram = emptyHistogram();
	private total = 0;
	private serverFailures = 0;

	add(result: BotResult): void {
		this.total++;

		if (isServerFailure(result.status)) {
			this.serverFailures++;
		}

		this.runHistogram[bucketIndexFor(result.latencyMs)]++;
		this.byStatus.set(result.status, (this.byStatus.get(result.status) ?? 0) + 1);
		const instances = this.byRouteInstance.get(result.routePrefix) ?? new Map<string, number>();
		const instance = result.instance ?? NO_INSTANCE_LABEL;

		instances.set(instance, (instances.get(instance) ?? 0) + 1);
		this.byRouteInstance.set(result.routePrefix, instances);
		this.window.count++;
		this.window.latencies.push(result.latencyMs);
	}

	takeWindowLine(windowSeconds: number): string {
		const latencies = [...this.window.latencies].sort((left, right) => left - right);
		const rps = (this.window.count / windowSeconds).toFixed(1);
		const p50 = percentile(latencies, P50)?.toFixed(0) ?? '-';
		const p95 = percentile(latencies, P95)?.toFixed(0) ?? '-';

		this.window = { count: 0, latencies: [] };

		return `${rps} req/s  p50 ${p50} ms  p95 ${p95} ms  |  ${this.statusLine()}`;
	}

	totals(): RunTotals {
		const serverErrorRate = this.total === 0 ? 0 : this.serverFailures / this.total;

		return { requests: this.total, p95Ms: percentileFromHistogram(this.runHistogram, P95), serverErrorRate };
	}

	statusLine(): string {
		const statuses = [...this.byStatus.entries()].sort(([left], [right]) => left - right);

		return statuses.map(([status, count]) => `${status}: ${count}`).join('  ');
	}

	report(): string {
		const lines = [`${this.total} requests  |  ${this.statusLine()}`, ''];
		const routes = [...this.byRouteInstance.entries()].sort(([left], [right]) => left.localeCompare(right));

		for (const [route, instances] of routes) {
			const routeTotal = [...instances.values()].reduce((sum, count) => sum + count, 0);

			lines.push(`${route}  (${routeTotal})`);
			const rows = [...instances.entries()].sort(([left], [right]) => left.localeCompare(right));

			for (const [instance, count] of rows) {
				lines.push(`  ${instance.padEnd(12)} ${String(count).padStart(7)}  ${((count / routeTotal) * 100).toFixed(1).padStart(5)}%`);
			}
		}

		return lines.join('\n');
	}
}

export function percentile(sortedLatencies: readonly number[], fraction: number): number | null {
	if (sortedLatencies.length === 0) {
		return null;
	}

	const index = Math.min(sortedLatencies.length - 1, Math.floor(fraction * sortedLatencies.length));

	return sortedLatencies[index];
}

export function routePrefixOf(path: string): string {
	const segments = path.split('?')[0].split('/').filter(Boolean);

	if (segments[0] !== 'api') {
		return path;
	}

	if (segments[1] === 'public') {
		return '/api/public/health';
	}

	return `/api/${segments[1] ?? ''}`;
}

// 5xx (gateway-made or upstream) and requests that got no answer; the 4xx the
// profiles send on purpose are not failures.
function isServerFailure(status: number): boolean {
	return status === NETWORK_ERROR_STATUS || status >= FIRST_SERVER_ERROR_STATUS;
}
