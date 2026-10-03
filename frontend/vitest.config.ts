import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit and component specs (src/**/*.spec.ts[x]); the browser smoke test is
// Playwright's (e2e/). Coverage gates: see thresholds below.
export default defineConfig({
	plugins: [react()],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.spec.{ts,tsx}'],
		coverage: {
			// istanbul, not v8: with Vitest 5, v8 reports a component no spec loads as 0 of 0
			// statements, so it counts as covered and the whole-app floor checks nothing.
			provider: 'istanbul',
			// Everything, components and pages included, so the report says what is
			// really tested; the stricter gate below is for the logic.
			include: ['src/app/**/*.{ts,tsx}'],
			exclude: ['src/**/*.spec.{ts,tsx}', 'src/app/api/adminApiTypes.ts', 'src/app/api/notificationTypes.ts'],
			reportsDirectory: 'coverage',
			reporter: ['text-summary', 'json-summary', 'html'],
			// Two gates, and both fail the run. Logic (.ts: hooks, pure helpers, the
			// API client) keeps the backend's bar. The whole app, components
			// included, has a floor that only moves up: components are covered by
			// the e2e smoke test (e2e/) and by specs where they hold real logic.
			thresholds: {
				statements: 57,
				lines: 56,
				branches: 53,
				functions: 50,
				'src/app/**/*.ts': { statements: 90, lines: 90, branches: 85, functions: 85 },
			},
		},
	},
});
