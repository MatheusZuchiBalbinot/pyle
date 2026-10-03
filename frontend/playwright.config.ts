import { defineConfig } from '@playwright/test';

const CI_RETRIES = 1;
const isCi = process.env.CI === 'true';

// The console against a running stack (control plane, gateway, seed): see e2e/README.md.
export default defineConfig({
	testDir: './e2e',
	// One login for the whole run: the login endpoint is rate limited.
	workers: 1,
	fullyParallel: false,
	retries: isCi ? CI_RETRIES : 0,
	forbidOnly: isCi,
	reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
