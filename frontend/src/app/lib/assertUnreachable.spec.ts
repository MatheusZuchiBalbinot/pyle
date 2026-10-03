import { describe, expect, it } from 'vitest';

import { assertUnreachable } from './assertUnreachable';

describe('assertUnreachable', () => {
	it('throws with the value that slipped through', () => {
		expect(() => assertUnreachable('surprise' as never)).toThrow('surprise');
	});
});
