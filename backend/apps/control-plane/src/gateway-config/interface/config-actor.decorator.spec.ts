import { describe, expect, it } from 'vitest';

import { toConfigActor } from './config-actor.decorator.js';

describe('toConfigActor', () => {
	it('records an operator by e-mail', () => {
		expect(toConfigActor({ kind: 'user', userId: 'u1', email: 'ops@pyle.local' })).toEqual({ email: 'ops@pyle.local' });
	});

	it('records the service token, or an unknown caller, as nobody in particular', () => {
		expect(toConfigActor({ kind: 'service' })).toEqual({ email: null });
		expect(toConfigActor(undefined)).toEqual({ email: null });
	});
});
