import { describe, expect, it, vi } from 'vitest';

import { NoopAttemptObserver } from './attempt-observer.js';
import { NoopGatewayEventSink } from './gateway-event-sink.js';
import { AlwaysAvailable } from './instance-availability.js';
import { EmptyInstanceStateSource } from './instance-state-source.js';
import { composeRequestObservers, NoopRequestObserver, type CompletedRequest } from './request-observer.js';
import { NoRetryPolicy } from './retry-policy.js';

const REQUEST = { requestId: 'r' } as CompletedRequest;

describe('core defaults', () => {
	it('do nothing and never block a request', () => {
		expect(new AlwaysAvailable().isAvailable()).toBe(true);
		expect(new NoRetryPolicy().shouldRetry()).toBe(false);
		expect(new EmptyInstanceStateSource().list()).toEqual([]);
		expect(new EmptyInstanceStateSource().onChange()()).toBeUndefined();
		expect(() => new NoopAttemptObserver().onAttemptStart()).not.toThrow();
		expect(() => new NoopAttemptObserver().onAttemptEnd()).not.toThrow();
		expect(() => new NoopGatewayEventSink().emit()).not.toThrow();
		expect(() => new NoopRequestObserver().onRequestCompleted()).not.toThrow();
	});
});

describe('composeRequestObservers', () => {
	it('tells every observer, even past one that throws', () => {
		const first = {
			onRequestCompleted: vi.fn(() => {
				throw new Error('boom');
			}),
		};
		const second = { onRequestCompleted: vi.fn() };
		const onError = vi.fn();

		composeRequestObservers([first, second], onError).onRequestCompleted(REQUEST);

		expect(second.onRequestCompleted).toHaveBeenCalledWith(REQUEST);
		expect(onError).toHaveBeenCalledWith(new Error('boom'));
	});
});
