import { fileURLToPath } from 'node:url';
import type { CoverageV8Options } from 'vitest/node';

type ModuleAlias = { readonly find: RegExp; readonly replacement: string };

const SHARED_SOURCE_DIR = fileURLToPath(new URL('./packages/shared/src/', import.meta.url));

// Tests run against @pyle/shared's sources, like the typecheck does, so no build is needed
// first.
export const workspaceAliases: ReadonlyArray<ModuleAlias> = [{ find: /^@pyle\/shared\/(.*)\.js$/, replacement: `${SHARED_SOURCE_DIR}$1.ts` }];

// Shared by the three tiers, which run as separate processes; test:cov:merge adds their
// reports up. Every tier reports every source file, so the merge sums whatever tier
// exercises a file.
export function coverageConfig(reportsDirectory: string): CoverageV8Options {
	return {
		provider: 'v8',
		include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
		// Operator tooling (seed, CLI) and the entry points: only running them for real
		// would catch a break, so they stay out of the number.
		exclude: ['**/*.spec.ts', 'apps/*/src/main.ts', 'apps/control-plane/src/seed/**', 'apps/*/src/**/cli/**'],
		reportsDirectory,
		reporter: ['json'],
		reportOnFailure: true,
	};
}
