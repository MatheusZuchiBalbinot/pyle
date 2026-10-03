import { describe, expect, it } from 'vitest';

import { buildService } from '@/test/gatewayFixtures';

import { EMPTY_SERVICE_FORM, serviceToFormValues, toServiceInput, validateServiceForm } from './serviceFormValidation';

const VALID = { ...EMPTY_SERVICE_FORM, slug: 'orders', name: 'Pedidos' };

function errorsOf(overrides: Partial<typeof VALID>) {
	return Object.fromEntries(Object.entries(validateServiceForm({ ...VALID, ...overrides })).filter(([, error]) => error !== undefined));
}

describe('validateServiceForm', () => {
	it('accepts the defaults with a slug and a name', () => {
		expect(errorsOf({})).toEqual({});
	});

	it('checks the slug, the name and the description', () => {
		expect(errorsOf({ slug: 'Orders', name: '', description: 'x'.repeat(501) })).toEqual({
			slug: 'common.validation.slug',
			name: 'common.validation.required',
			description: 'common.validation.length',
		});
	});

	it.each([
		['timeoutMs', '99'],
		['retryMaxAttempts', '6'],
		['healthCheckIntervalMs', '999'],
		['healthyThreshold', '0'],
		['unhealthyThreshold', '11'],
		['circuitFailureThreshold', '101'],
		['circuitCooldownMs', '300001'],
	])('checks the range of %s', (field, value) => {
		expect(errorsOf({ [field]: value })).toMatchObject({ [field]: 'common.validation.range' });
	});

	it('wants the health check to finish before the next one, on a path', () => {
		expect(errorsOf({ healthCheckTimeoutMs: '5000', healthCheckIntervalMs: '5000' })).toEqual({
			healthCheckTimeoutMs: 'services.form.errors.timeoutBelowInterval',
		});
		expect(errorsOf({ healthCheckTimeoutMs: 'x' })).toEqual({ healthCheckTimeoutMs: 'common.validation.integer' });
		expect(errorsOf({ healthCheckPath: 'health' })).toEqual({ healthCheckPath: 'services.form.errors.healthPath' });
	});
});

describe('service form values', () => {
	it('round-trips a service through the form', () => {
		const service = buildService('orders', { name: 'Pedidos', description: null });
		const input = toServiceInput(serviceToFormValues(service));

		expect(input).toMatchObject({
			slug: 'orders',
			name: 'Pedidos',
			description: '',
			timeoutMs: service.timeoutMs,
			healthCheckPath: service.healthCheck.path,
			circuitCooldownMs: service.circuit.cooldownMs,
		});
	});
});
