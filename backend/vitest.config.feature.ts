import { defineConfig } from 'vitest/config';

import { coverageConfig, workspaceAliases } from './vitest.shared.js';

// Between unit and e2e: real Postgres and Redis, no HTTP flow.
export default defineConfig({
	resolve: { alias: workspaceAliases },
	test: {
		globals: true,
		root: './',
		include: ['**/*.feature-spec.ts'],
		setupFiles: ['./test/setup-env.ts'],
		// One file at a time: the files share the same Redis channels.
		fileParallelism: false,
		coverage: coverageConfig('coverage/feature'),
	},
});
