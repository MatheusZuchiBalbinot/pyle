// One step of the benchmark: an open model at a constant arrival rate, so a slow target
// shows as latency and dropped iterations instead of quietly lowering the load (the
// closed-loop "coordinated omission" trap). Driven by scripts/bench.ts through env vars.
import http from 'k6/http';

const RATE = Number(__ENV.RATE);
const DURATION = __ENV.DURATION;
const TARGET_URL = __ENV.TARGET_URL;
const API_KEY = __ENV.API_KEY || '';
const SUMMARY_PATH = __ENV.SUMMARY_PATH;
// Enough virtual users that the generator never becomes the limit before the target does.
const VUS_PER_THOUSAND_RPS = 50;
const MAX_VUS = 5000;

const params = API_KEY === '' ? {} : { headers: { Authorization: `Bearer ${API_KEY}` } };

export const options = {
	discardResponseBodies: true,
	summaryTrendStats: ['med', 'p(95)', 'p(99)', 'max'],
	scenarios: {
		step: {
			executor: 'constant-arrival-rate',
			rate: RATE,
			timeUnit: '1s',
			duration: DURATION,
			preAllocatedVUs: Math.max(50, Math.ceil((RATE / 1000) * VUS_PER_THOUSAND_RPS)),
			maxVUs: MAX_VUS,
		},
	},
};

export default function () {
	http.get(TARGET_URL, params);
}

export function handleSummary(data) {
	return { [SUMMARY_PATH]: JSON.stringify(data.metrics) };
}
