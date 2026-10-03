import { defineConfig } from 'vitest/config';

import { coverageConfig, workspaceAliases } from './vitest.shared.js';

export default defineConfig({
	resolve: { alias: workspaceAliases },
	test: {
		globals: true,
		root: './',
		include: ['**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		coverage: coverageConfig('coverage/unit'),
	},
});
