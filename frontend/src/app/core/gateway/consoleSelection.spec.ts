import { describe, expect, it } from 'vitest';

import { pageForSelection } from './consoleSelection';

describe('pageForSelection', () => {
	it.each([
		[{ type: 'route', routeId: 'r1' }, 'routes'],
		[{ type: 'route-traffic', routeId: 'r1' }, 'traffic'],
		[{ type: 'service', serviceSlug: 'orders', instanceId: null }, 'services'],
		[{ type: 'consumer', consumerSlug: 'web-app' }, 'consumers'],
	] as const)('opens %j on the %s page', (selection, page) => {
		expect(pageForSelection(selection)).toBe(page);
	});
});
