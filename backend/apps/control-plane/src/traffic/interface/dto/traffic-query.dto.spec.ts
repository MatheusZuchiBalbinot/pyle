import { describe, expect, it } from 'vitest';

import { toTrafficWindowInput } from './traffic-query.dto.js';

describe('toTrafficWindowInput', () => {
	it('defaults to the last hour', () => {
		expect(toTrafficWindowInput({})).toEqual({ kind: 'named', window: '1h' });
		expect(toTrafficWindowInput({ window: '6h' })).toEqual({ kind: 'named', window: '6h' });
	});

	it('takes a range as both ends', () => {
		expect(toTrafficWindowInput({ from: '2026-09-26T10:00:00Z', to: '2026-09-26T11:00:00Z' })).toEqual({
			kind: 'range',
			from: new Date('2026-09-26T10:00:00Z'),
			to: new Date('2026-09-26T11:00:00Z'),
		});
	});

	it('refuses half a range, or a range with a named window', () => {
		expect(() => toTrafficWindowInput({ to: '2026-09-26T11:00:00Z' })).toThrow('go together');
		expect(() => toTrafficWindowInput({ window: '1h', from: 'x', to: 'y' })).toThrow('not both');
	});
});
