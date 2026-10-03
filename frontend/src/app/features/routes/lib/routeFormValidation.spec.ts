import { describe, expect, it } from 'vitest';

import { buildRoute } from '@/test/gatewayFixtures';

import { describeRewrite, EMPTY_ROUTE_FORM, routeToFormValues, toRouteInput, validateRouteForm, type RouteFormValues } from './routeFormValidation';

const VALID: RouteFormValues = { ...EMPTY_ROUTE_FORM, name: 'Pedidos', pathPrefix: '/api/orders', serviceSlug: 'orders' };

describe('validateRouteForm', () => {
	it('accepts a valid route', () => {
		expect(Object.values(validateRouteForm(VALID)).filter(Boolean)).toEqual([]);
	});

	it.each([
		['/', undefined],
		['/api/v2/orders_x-1', undefined],
		['', 'common.validation.required'],
		['api/orders', 'routes.form.errors.prefixFormat'],
		['/api/orders/', 'routes.form.errors.prefixFormat'],
		['/API/orders', 'routes.form.errors.prefixFormat'],
		['/api//orders', 'routes.form.errors.prefixFormat'],
		[`/${'a'.repeat(200)}`, 'routes.form.errors.prefixFormat'],
	])('checks the prefix %s', (pathPrefix, expected) => {
		expect(validateRouteForm({ ...VALID, pathPrefix }).pathPrefix).toBe(expected);
	});

	it('checks the name, the service and the numeric ranges', () => {
		const errors = validateRouteForm({ ...VALID, name: '', serviceSlug: '', rateLimitPerMinute: '0', timeoutMs: '99' });

		expect(errors).toMatchObject({
			name: 'common.validation.required',
			serviceSlug: 'routes.form.errors.serviceRequired',
			rateLimitPerMinute: 'common.validation.range',
			timeoutMs: 'common.validation.range',
		});
		expect(validateRouteForm({ ...VALID, rateLimitPerMinute: '100000', timeoutMs: '60000' })).toMatchObject({
			rateLimitPerMinute: undefined,
			timeoutMs: undefined,
		});
	});
});

describe('route form values', () => {
	it('turns the form into the API input, empty numbers as not set', () => {
		expect(toRouteInput({ ...VALID, name: ' Pedidos ', rateLimitPerMinute: '600' })).toEqual({
			name: 'Pedidos',
			pathPrefix: '/api/orders',
			serviceSlug: 'orders',
			stripPrefix: true,
			methods: [],
			isAuthRequired: true,
			rateLimitPerMinute: 600,
			timeoutMs: null,
		});
	});

	it('fills the form from a route and back', () => {
		const route = buildRoute('/api/orders', { rateLimitPerMinute: 60, timeoutMs: null });

		expect(routeToFormValues(route)).toMatchObject({ pathPrefix: '/api/orders', rateLimitPerMinute: '60', timeoutMs: '' });
	});
});

describe('describeRewrite', () => {
	it('shows what the instance receives', () => {
		expect(describeRewrite('/api/orders', true)).toEqual({ incoming: '/api/orders/42', forwarded: '/42' });
		expect(describeRewrite('/api/orders', false)).toEqual({ incoming: '/api/orders/42', forwarded: '/api/orders/42' });
		expect(describeRewrite('/', true)).toEqual({ incoming: '/42', forwarded: '/42' });
		expect(describeRewrite('/api/', false)).toEqual({ incoming: '/api/42', forwarded: '/api/42' });
	});
});
