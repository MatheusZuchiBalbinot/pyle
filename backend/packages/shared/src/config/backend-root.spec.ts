import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { backendPath } from './backend-root.js';

describe('backendPath', () => {
	it('points at backend/, wherever the process runs from', () => {
		expect(existsSync(backendPath('package.json'))).toBe(true);
		expect(existsSync(backendPath('apps', 'control-plane', 'package.json'))).toBe(true);
	});
});
