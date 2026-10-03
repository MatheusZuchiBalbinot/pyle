import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

// One signed-in page walks the whole console: every area loads its data, live,
// without an error state or a console error. Needs the seeded demo (npm run seed).

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@pyle.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'pyle-admin-dev';

type Area = { readonly nav: string; readonly page: string; readonly ready: string };

// What each page shows once its data is in, not just its frame.
const AREAS: readonly Area[] = [
	{ nav: 'Visão geral', page: 'overview', ready: '[data-card="overview-changes"] li' },
	{ nav: 'Tráfego', page: 'traffic', ready: '[data-card="traffic-routes"] tbody tr' },
	{ nav: 'Rotas', page: 'routes', ready: 'tbody tr' },
	{ nav: 'Serviços', page: 'services', ready: '.service-card' },
	{ nav: 'Consumidores', page: 'consumers', ready: 'tbody tr' },
	{ nav: 'Assistente IA', page: 'assistant', ready: 'textarea' },
	{ nav: 'Análises IA', page: 'ai', ready: '.page-header' },
	{ nav: 'Ajustes', page: 'settings', ready: '[data-card]' },
];

// Expected noise: the 401 that the first silent session restore gets.
function isRelevantError(message: ConsoleMessage): boolean {
	return message.type() === 'error' && !message.text().includes('401');
}

test.describe.configure({ mode: 'serial' });

let page: Page;
const consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	page.on('console', (message) => {
		if (isRelevantError(message)) {
			consoleErrors.push(message.text());
		}
	});
	page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterAll(async () => {
	await page.close();
});

test('refuses wrong credentials without saying which part was wrong', async () => {
	await page.goto('/');
	await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
	await page.getByLabel('Senha', { exact: true }).fill('not-the-password');
	await page.getByRole('button', { name: 'Entrar' }).click();

	await expect(page.getByRole('alert')).toContainText('E-mail ou senha');
	await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
});

test('signs in', async () => {
	await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
	await page.getByLabel('Senha', { exact: true }).fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();

	await expect(page.locator('[data-page="overview"]')).toBeVisible();
});

for (const area of AREAS) {
	test(`${area.nav} loads its data`, async () => {
		await page.locator('.sidebar').getByText(area.nav, { exact: true }).click();

		const view = page.locator(`[data-page="${area.page}"]`);

		await expect(view).toBeVisible();
		await expect(view.locator(area.ready).first()).toBeVisible();
		await expect(view.locator('.error-state')).toHaveCount(0);
	});
}

test('picks a route in Traffic through the select, and the cards follow', async () => {
	await page.locator('.sidebar').getByText('Tráfego', { exact: true }).click();
	await page.getByRole('combobox', { name: 'Rota' }).click();
	await page.getByRole('option', { name: /Pedidos/ }).click();

	await expect(page.locator('[data-card="traffic-share"]')).toBeVisible();
});

test('opens and cancels the new route form', async () => {
	await page.locator('.sidebar').getByText('Rotas', { exact: true }).click();
	await page.getByRole('button', { name: 'Nova rota' }).click();
	const dialog = page.getByRole('dialog', { name: 'Nova rota' });

	await expect(dialog).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(dialog).toHaveCount(0);
});

test('finds a route with the global search', async () => {
	await page.keyboard.press('Control+k');
	await page.keyboard.type('orders');

	await expect(page.getByRole('option', { name: /Pedidos/ }).first()).toBeVisible();
	await page.keyboard.press('Escape');
});

test('keeps the place in the URL: a link, a reload and the back button', async () => {
	await page.locator('.sidebar').getByText('Rotas', { exact: true }).click();
	await page.locator('[data-page="routes"] tbody tr').filter({ hasText: '/api/orders' }).click();
	await expect(page).toHaveURL(/\/routes\/[^/]+$/);
	await expect(page).toHaveTitle('Rotas · Pyle');

	await page.reload();
	await expect(page.locator('[data-page="routes"]').getByText('/api/orders/42 → /42')).toBeVisible();

	await page.locator('.sidebar').getByText('Serviços', { exact: true }).click();
	await expect(page).toHaveURL(/\/services$/);
	await page.goBack();
	await expect(page.locator('[data-page="routes"]').getByText('/api/orders/42 → /42')).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/routes$/);
});

// Each page is pre-rendered once the shell is idle, and its first data is fetched on hover,
// so a switch shows the finished page at once instead of building it up in stages.
test('switches pages without the layout building up in stages', async () => {
	const MAX_LAYOUT_STATES = 2;
	const FILM_MS = 1500;

	await page.locator('.sidebar').getByText('Visão geral', { exact: true }).click();

	for (const [nav, pageId] of [
		['Rotas', 'routes'],
		['Serviços', 'services'],
		['Ajustes', 'settings'],
	] as const) {
		const link = page.locator('.sidebar').getByText(nav, { exact: true });

		await link.hover();
		await page.waitForTimeout(300);
		await page.evaluate(startFilming, { pageId, durationMs: FILM_MS });
		await link.click();
		await page.waitForTimeout(FILM_MS + 200);
		const layoutStates = await page.evaluate(() => (window as unknown as FilmWindow).__layoutStates);

		expect(layoutStates, `${pageId} laid out in ${layoutStates} states`).toBeLessThanOrEqual(MAX_LAYOUT_STATES);
	}
});

// The window is the only scroller: the page ends with the shell and the sidebar keeps the
// full height, down to the bottom of a long page (it once scrolled past the end).
test('scrolls to the end of a long page without running past the shell', async () => {
	await page.locator('.sidebar').getByText('Consumidores', { exact: true }).click();
	await page.locator('[data-page="consumers"] tbody tr').first().click();
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

	const layout = await page.evaluate(() => {
		const shellBottom = document.querySelector('.app-shell')?.getBoundingClientRect().bottom ?? 0;
		const sidebarBottom = document.querySelector('.sidebar')?.getBoundingClientRect().bottom ?? 0;

		return {
			documentEnd: document.documentElement.scrollHeight,
			shellEnd: Math.round(shellBottom + window.scrollY),
			sidebarBottom: Math.round(sidebarBottom),
			viewport: window.innerHeight,
		};
	});

	expect(layout.documentEnd).toBe(layout.shellEnd);
	expect(layout.sidebarBottom).toBe(layout.viewport);
});

test('logged no console errors along the way', () => {
	expect(consoleErrors).toEqual([]);
});

type FilmWindow = Window & { __layoutStates: number };

// Counts the distinct layouts the page goes through, frame by frame: the geometry of its
// first cards and its height. Runs in the browser.
function startFilming({ pageId, durationMs }: { readonly pageId: string; readonly durationMs: number }): void {
	const film = window as unknown as FilmWindow;
	const startedAt = performance.now();
	let previous = '';

	film.__layoutStates = 0;

	function snapshot(): void {
		const frame = document.querySelector<HTMLElement>(`[data-page-frame="${pageId}"]`);
		const isVisible = frame !== null && frame.offsetParent !== null;
		const boxes = isVisible ? [...frame.querySelectorAll('.page > *, .page .card')].slice(0, 12) : [];
		const layout = boxes.map((box) => `${Math.round(box.getBoundingClientRect().top)}:${Math.round(box.getBoundingClientRect().height)}`).join(',');
		const current = isVisible ? `${layout}|${frame.scrollHeight}` : '';

		if (current !== '' && current !== previous) {
			film.__layoutStates += 1;
			previous = current;
		}

		if (performance.now() - startedAt < durationMs) {
			requestAnimationFrame(snapshot);
		}
	}

	requestAnimationFrame(snapshot);
}
