import { defineConfig } from 'vitest/config';

import { coverageConfig, workspaceAliases } from './vitest.shared.js';

export default defineConfig({
	resolve: { alias: workspaceAliases },
	test: {
		globals: true,
		root: './',
		include: ['**/*.e2e-spec.ts'],
		setupFiles: ['./test/setup-env.ts'],
		// Each file boots a full app against the same Postgres and Redis; in parallel, one
		// file's shutdown would close connections another still uses.
		fileParallelism: false,
		coverage: coverageConfig('coverage/e2e'),
	},
});
