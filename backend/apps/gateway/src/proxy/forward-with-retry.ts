import type { IncomingMessage } from 'node:http';

import type { InstanceConfig, ServiceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { AttemptObserver, AttemptOutcome } from '../contracts/attempt-observer.js';
import type { InstanceAvailability } from '../contracts/instance-availability.js';
import type { LoadBalancer } from '../contracts/load-balancer.js';
import type { RetryDecisionInput, RetryPolicy } from '../contracts/retry-policy.js';
import type { UpstreamAgents } from './upstream-agents.js';
import type { AttemptInput, AttemptResult } from './upstream-attempt.js';
import type { UpstreamRequest } from './upstream-request.js';

export type SendAttempt = (input: AttemptInput) => Promise<AttemptResult>;

export type ForwardDependencies = {
	readonly availability: InstanceAvailability;
	readonly attemptObserver: AttemptObserver;
	readonly retryPolicy: RetryPolicy;
	readonly agents: UpstreamAgents;
	readonly sendAttempt: SendAttempt;
	readonly now: () => number;
};

export type ForwardRequest = {
	readonly service: ServiceConfig;
	readonly balancer: LoadBalancer;
	readonly method: string;
	// Null when the request has no body; a body can only be sent once.
	readonly body: IncomingMessage | null;
	readonly buildTarget: (instance: InstanceConfig) => UpstreamRequest;
	readonly perAttemptTimeoutMs: number;
	// Epoch ms by which the whole request, retries included, must be done.
	readonly deadlineMs: number;
	readonly signal: AbortSignal;
};

export type ForwardResult =
	// An instance answered; the caller relays this response.
	| { readonly kind: 'response'; readonly instance: InstanceConfig; readonly response: IncomingMessage; readonly attempts: number }
	// Nothing to send to: every instance is drained, ejected or open.
	| { readonly kind: 'no_instance'; readonly attempts: number }
	// Every attempt failed before any instance answered.
	| {
			readonly kind: 'failed';
			readonly instance: InstanceConfig;
			readonly outcome: Exclude<AttemptOutcome, { readonly kind: 'response' }>;
			readonly attempts: number;
	  };

type EligibilityInput = {
	readonly tried: ReadonlySet<string>;
	readonly availability: InstanceAvailability;
};

// A retried response is drained and dropped; the last answer is the one relayed.
export async function forwardWithRetry(request: ForwardRequest, dependencies: ForwardDependencies): Promise<ForwardResult> {
	const tried = new Set<string>();
	const eligibility: EligibilityInput = { tried, availability: dependencies.availability };

	for (;;) {
		const candidates = eligibleCandidates(request.service, eligibility);

		if (candidates.length === 0) {
			return { kind: 'no_instance', attempts: tried.size };
		}

		const instance = request.balancer.select({ service: request.service, candidates });

		tried.add(instance.id);
		const result = await attempt(request, instance, dependencies);
		const retryInput: RetryDecisionInput = {
			method: request.method,
			hasRequestBody: request.body !== null,
			outcome: toOutcome(result),
			attemptNumber: tried.size,
			maxAttempts: request.service.retryMaxAttempts,
			remainingBudgetMs: request.deadlineMs - dependencies.now(),
		};
		const hasAnotherCandidate = eligibleCandidates(request.service, eligibility).length > 0;
		const shouldRetry = hasAnotherCandidate && dependencies.retryPolicy.shouldRetry(retryInput);

		if (!shouldRetry) {
			return settle(result, instance, tried.size);
		}

		if (result.kind === 'response') {
			result.response.resume();
		}
	}
}

function toOutcome(result: AttemptResult): AttemptOutcome {
	if (result.kind === 'response') {
		return { kind: 'response', status: result.response.statusCode ?? 0 };
	}

	return result;
}

// Enabled (not drained), not tried yet by this request, and not ejected by
// a health check or an open circuit.
function eligibleCandidates(service: ServiceConfig, eligibility: EligibilityInput): readonly InstanceConfig[] {
	return service.instances.filter(
		(instance) => instance.isEnabled && !eligibility.tried.has(instance.id) && eligibility.availability.isAvailable(instance.id),
	);
}

function settle(result: AttemptResult, instance: InstanceConfig, attempts: number): ForwardResult {
	if (result.kind === 'response') {
		return { kind: 'response', instance, response: result.response, attempts };
	}

	return { kind: 'failed', instance, outcome: result, attempts };
}

async function attempt(request: ForwardRequest, instance: InstanceConfig, dependencies: ForwardDependencies): Promise<AttemptResult> {
	const target = request.buildTarget(instance);
	const remainingMs = request.deadlineMs - dependencies.now();
	const timeoutMs = Math.max(1, Math.min(request.perAttemptTimeoutMs, remainingMs));
	const agent = dependencies.agents.forInstance(instance.id, target.url);

	dependencies.attemptObserver.onAttemptStart(instance.id);
	const input: AttemptInput = { target, method: request.method, agent, timeoutMs, body: request.body, signal: request.signal };
	const result = await dependencies.sendAttempt(input);

	dependencies.attemptObserver.onAttemptEnd(instance.id, toOutcome(result));

	return result;
}
