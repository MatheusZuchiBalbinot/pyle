// The pure half of the benchmark: reading a k6 summary into a step, deciding where a
// target's knee is, and writing the report.

export type StepResult = {
	readonly target: string;
	readonly offeredRps: number;
	readonly achievedRps: number;
	readonly errorRate: number;
	readonly p50Ms: number;
	readonly p95Ms: number;
	readonly p99Ms: number;
	readonly droppedIterations: number;
};

type ReportInput = {
	readonly title: string;
	readonly environment: readonly string[];
	readonly targets: readonly string[];
	readonly steps: readonly StepResult[];
	// The step whose latency compares the targets under a comfortable load.
	readonly referenceRps: number;
};

// A step the target sustained: it kept up with the offered rate, without errors, and its
// p99 stayed within a budget a user would not notice.
const HEALTHY_STEP_RULES = { minAchievedShare: 0.95, maxErrorRate: 0.001, maxP99Ms: 50 } as const;
// Two failed steps in a row: past the knee, the next ones only take longer to fail.
const FAILED_STEPS_BEFORE_STOP = 2;

export function parseK6Summary(target: string, offeredRps: number, metrics: unknown): StepResult {
	const duration = readMetricValues(metrics, 'http_req_duration');
	const requests = readMetricValues(metrics, 'http_reqs');
	const failed = readMetricValues(metrics, 'http_req_failed');
	const dropped = readOptionalMetricValues(metrics, 'dropped_iterations');

	return {
		target,
		offeredRps,
		achievedRps: readNumber(requests, 'rate'),
		errorRate: readNumber(failed, 'rate'),
		p50Ms: readNumber(duration, 'med'),
		p95Ms: readNumber(duration, 'p(95)'),
		p99Ms: readNumber(duration, 'p(99)'),
		droppedIterations: dropped === null ? 0 : readNumber(dropped, 'count'),
	};
}

export function isHealthyStep(step: StepResult): boolean {
	const isKeepingUp = step.achievedRps >= step.offeredRps * HEALTHY_STEP_RULES.minAchievedShare;
	const isErrorFree = step.errorRate <= HEALTHY_STEP_RULES.maxErrorRate;
	const isFast = step.p99Ms <= HEALTHY_STEP_RULES.maxP99Ms;

	return isKeepingUp && isErrorFree && isFast;
}

// The last healthy step before the first failed one: a lucky step past the knee is noise.
export function kneeOf(steps: readonly StepResult[]): StepResult | null {
	const firstFailure = steps.findIndex((step) => !isHealthyStep(step));
	const sustained = firstFailure === -1 ? steps : steps.slice(0, firstFailure);

	return sustained.at(-1) ?? null;
}

export function shouldStopTarget(steps: readonly StepResult[]): boolean {
	const recent = steps.slice(-FAILED_STEPS_BEFORE_STOP);
	const hasEnoughSteps = recent.length === FAILED_STEPS_BEFORE_STOP;

	return hasEnoughSteps && recent.every((step) => !isHealthyStep(step));
}

export function renderReport(input: ReportInput): string {
	const summaryRows = input.targets.map((target) => renderSummaryRow(target, input));
	const stepRows = input.steps.map(renderStepRow);

	return [
		`# ${input.title}`,
		'',
		...input.environment.map((line) => `- ${line}`),
		'',
		`Knee: the highest offered rate a target sustained (at least ${HEALTHY_STEP_RULES.minAchievedShare * 100}% of it served, at most ${HEALTHY_STEP_RULES.maxErrorRate * 100}% errors, p99 within ${HEALTHY_STEP_RULES.maxP99Ms} ms).`,
		'',
		`| Target | Knee (req/s) | p50 at ${input.referenceRps} req/s | p99 at ${input.referenceRps} req/s |`,
		'| --- | --- | --- | --- |',
		...summaryRows,
		'',
		'| Target | Offered | Served | Errors | p50 | p95 | p99 | Dropped |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |',
		...stepRows,
		'',
	].join('\n');
}

function renderSummaryRow(target: string, input: ReportInput): string {
	const steps = input.steps.filter((step) => step.target === target);
	const knee = kneeOf(steps);
	const reference = steps.find((step) => step.offeredRps === input.referenceRps);
	const kneeText = knee === null ? 'below the first step' : formatCount(knee.offeredRps);
	const p50Text = reference === undefined ? '-' : formatMs(reference.p50Ms);
	const p99Text = reference === undefined ? '-' : formatMs(reference.p99Ms);

	return `| ${target} | ${kneeText} | ${p50Text} | ${p99Text} |`;
}

function renderStepRow(step: StepResult): string {
	const cells = [
		step.target,
		formatCount(step.offeredRps),
		formatCount(Math.round(step.achievedRps)),
		formatPercent(step.errorRate),
		formatMs(step.p50Ms),
		formatMs(step.p95Ms),
		formatMs(step.p99Ms),
		formatCount(step.droppedIterations),
	];

	return `| ${cells.join(' | ')} |`;
}

function readMetricValues(metrics: unknown, name: string): Record<string, unknown> {
	const values = readOptionalMetricValues(metrics, name);

	if (values === null) {
		throw new Error(`k6 summary has no "${name}" metric`);
	}

	return values;
}

function readOptionalMetricValues(metrics: unknown, name: string): Record<string, unknown> | null {
	const metric = isRecord(metrics) ? metrics[name] : undefined;
	const values = isRecord(metric) ? metric.values : undefined;

	return isRecord(values) ? values : null;
}

function readNumber(values: Record<string, unknown>, key: string): number {
	const value = values[key];

	if (typeof value !== 'number') {
		throw new Error(`k6 summary value "${key}" is not a number`);
	}

	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}

function formatMs(value: number): string {
	return `${value.toFixed(2)} ms`;
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(2)}%`;
}
