import { describe, expect, it } from 'vitest';

import { locationOfPage, locationOfSelection, parseConsolePath, toConsolePath, type ConsoleLocation } from './consoleLocation';

const ROUND_TRIPS: ReadonlyArray<readonly [string, ConsoleLocation]> = [
	['/', locationOfPage('overview')],
	['/traffic', locationOfPage('traffic')],
	['/traffic/routes/r-1', locationOfSelection({ type: 'route-traffic', routeId: 'r-1' })],
	['/routes', locationOfPage('routes')],
	['/routes/r-1', locationOfSelection({ type: 'route', routeId: 'r-1' })],
	['/services', locationOfPage('services')],
	['/services/orders', locationOfSelection({ type: 'service', serviceSlug: 'orders', instanceId: null })],
	['/services/orders/instances/i-2', locationOfSelection({ type: 'service', serviceSlug: 'orders', instanceId: 'i-2' })],
	['/consumers', locationOfPage('consumers')],
	['/consumers/web-app', locationOfSelection({ type: 'consumer', consumerSlug: 'web-app' })],
	['/assistant', locationOfPage('assistant')],
	['/ai', locationOfPage('ai')],
	['/ai/a-9', locationOfSelection({ type: 'analysis', analysisId: 'a-9' })],
	['/settings', locationOfPage('settings')],
];

describe('console location', () => {
	it.each(ROUND_TRIPS)('reads %s and writes it back the same', (path, location) => {
		expect(parseConsolePath(path)).toEqual(location);
		expect(toConsolePath(location)).toBe(path);
	});

	it('puts each selection on its own page', () => {
		expect(locationOfSelection({ type: 'route-traffic', routeId: 'r-1' }).page).toBe('traffic');
		expect(locationOfSelection({ type: 'analysis', analysisId: 'a-1' }).page).toBe('ai');
	});

	it('falls back to the overview for a path it does not know', () => {
		expect(parseConsolePath('/nowhere/at/all')).toEqual(locationOfPage('overview'));
	});

	it('opens the page itself when the rest of the path makes no sense for it', () => {
		expect(parseConsolePath('/settings/extra')).toEqual(locationOfPage('settings'));
		expect(parseConsolePath('/traffic/r-1')).toEqual(locationOfPage('traffic'));
		expect(parseConsolePath('/services/orders/oops/i-2')).toEqual(locationOfSelection({ type: 'service', serviceSlug: 'orders', instanceId: null }));
	});

	it('ignores a trailing slash and escapes ids, reading a broken escape as typed', () => {
		const odd = locationOfSelection({ type: 'consumer', consumerSlug: 'a/b c' });

		expect(parseConsolePath('/routes/')).toEqual(locationOfPage('routes'));
		expect(toConsolePath(odd)).toBe('/consumers/a%2Fb%20c');
		expect(parseConsolePath('/consumers/a%2Fb%20c')).toEqual(odd);
		expect(parseConsolePath('/consumers/100%')).toEqual(locationOfSelection({ type: 'consumer', consumerSlug: '100%' }));
	});
});
