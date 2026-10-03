import { describe, expect, it } from 'vitest';

import { buildUpstreamRequest, toClientResponseHeaders, type UpstreamRequestInput } from './upstream-request.js';

const INPUT: UpstreamRequestInput = {
	instanceUrl: 'http://localhost:48101',
	forwardedPath: '/42',
	query: '?expand=items&x=%2F',
	headers: {
		host: 'gateway.local',
		authorization: 'Bearer pyle_live_secret',
		'x-chaos-token': 'nope',
		'x-pyle-consumer': 'spoofed',
		'x-pyle-route': 'spoofed',
		'x-request-id': 'client-id',
		connection: 'keep-alive',
		'content-type': 'application/json',
		'x-forwarded-for': '203.0.113.9',
		traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
		tracestate: 'vendor=value',
	},
	consumerSlug: 'web-app',
	routeName: 'Pedidos',
	requestId: 'req-1',
	traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-01',
	clientIp: '10.0.0.1',
	protocol: 'http',
	host: 'gateway.local',
};

describe('buildUpstreamRequest', () => {
	it('appends the rewritten path and the raw query to the instance URL', () => {
		expect(buildUpstreamRequest(INPUT).url.toString()).toBe('http://localhost:48101/42?expand=items&x=%2F');
	});

	it('forwards the message headers, never the gateway-only or hop-by-hop ones', () => {
		const { headers } = buildUpstreamRequest(INPUT);

		expect(headers).toEqual({
			'content-type': 'application/json',
			tracestate: 'vendor=value',
			'x-forwarded-for': '203.0.113.9, 10.0.0.1',
			'x-forwarded-proto': 'http',
			'x-forwarded-host': 'gateway.local',
			'x-pyle-consumer': 'web-app',
			'x-pyle-route': 'Pedidos',
			'x-request-id': 'req-1',
			traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-01',
		});
	});

	it('names no consumer for an anonymous call and handles a missing host', () => {
		const { headers } = buildUpstreamRequest({ ...INPUT, consumerSlug: null, host: undefined, headers: { 'x-forwarded-for': ['a', 'b'] } });

		expect(headers).not.toHaveProperty('x-pyle-consumer');
		expect(headers).not.toHaveProperty('x-forwarded-host');
		expect(headers['x-forwarded-for']).toBe('a, b, 10.0.0.1');
	});
});

describe('toClientResponseHeaders', () => {
	it('drops hop-by-hop headers and empty ones', () => {
		expect(toClientResponseHeaders({ 'content-type': 'application/json', 'transfer-encoding': 'chunked', 'x-empty': undefined })).toEqual({
			'content-type': 'application/json',
		});
	});
});
