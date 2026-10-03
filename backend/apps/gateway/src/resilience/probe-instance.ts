import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { HealthCheckConfig, InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { UpstreamAgent } from '../proxy/upstream-agents.js';
import type { ProbeResult } from './probe-result.js';

const HTTPS_PROTOCOL = 'https:';
const SUCCESS_STATUS_FLOOR = 200;
const SUCCESS_STATUS_CEILING = 299;
const TIMEOUT_DETAIL = 'timeout';
const UNKNOWN_ERROR_DETAIL = 'UNKNOWN';

export type ProbeTarget = {
	readonly instance: InstanceConfig;
	readonly healthCheck: HealthCheckConfig;
};

export type ProbeInstance = (target: ProbeTarget) => Promise<ProbeResult>;

type ProbeDependencies = {
	readonly agentFor: (instance: InstanceConfig, url: URL) => UpstreamAgent;
	readonly now: () => number;
};

class ProbeTimeoutError extends Error {}

// GET {instance url}{health check path}: healthy on any 2xx within the
// timeout. Never throws; a failure is a result.
export function createProbe(dependencies: ProbeDependencies): ProbeInstance {
	return (target) =>
		new Promise((resolve) => {
			const startedAt = dependencies.now();
			const url = new URL(`${target.instance.url}${target.healthCheck.path}`);
			const requestFunction = url.protocol === HTTPS_PROTOCOL ? httpsRequest : httpRequest;
			const options: RequestOptions = { method: 'GET', agent: dependencies.agentFor(target.instance, url) };
			const finish = (isSuccess: boolean, detail: string): void => resolve({ isSuccess, detail, latencyMs: dependencies.now() - startedAt });
			const probe = requestFunction(url, options, (response) => {
				response.resume();
				const status = response.statusCode ?? 0;

				finish(isSuccessStatus(status), `HTTP ${status}`);
			});

			probe.setTimeout(target.healthCheck.timeoutMs, () => probe.destroy(new ProbeTimeoutError()));
			probe.once('error', (error) => finish(false, errorDetail(error)));
			probe.end();
		});
}

function isSuccessStatus(status: number): boolean {
	return status >= SUCCESS_STATUS_FLOOR && status <= SUCCESS_STATUS_CEILING;
}

function errorDetail(error: unknown): string {
	if (error instanceof ProbeTimeoutError) {
		return TIMEOUT_DETAIL;
	}

	const code = (error as { readonly code?: unknown } | null)?.code;

	return typeof code === 'string' ? code : UNKNOWN_ERROR_DETAIL;
}
