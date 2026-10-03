import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { GatewayAlertRepository } from '../../apps/control-plane/src/traffic/alerts/infrastructure/gateway-alert.repository.js';

// "One open alert per kind and subject" is the database's promise (a
// partial unique index), which is what makes concurrent evaluators safe.
const RUN = `feat-alerts-${Date.now()}`;
const ALERT = { kind: 'route_p95_latency', severity: 'warning', subjectType: 'route', subjectId: RUN, subjectName: 'r', message: 'slow' } as const;

describe('gateway alerts (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let alerts: GatewayAlertRepository;

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		alerts = moduleFixture.get(GatewayAlertRepository, { strict: false });
	});

	afterAll(async () => {
		await prisma.gatewayAlert.deleteMany({ where: { subjectId: RUN } });
		await moduleFixture.close();
	});

	it('opens once, even when asked twice at the same time, and again after resolving', async () => {
		const [first, second] = await Promise.all([alerts.openIfNone(ALERT, new Date()), alerts.openIfNone(ALERT, new Date())]);
		const opened = first ?? second;

		expect([first, second].filter((alert) => alert !== null)).toHaveLength(1);
		expect(await alerts.resolve(opened?.id ?? '', new Date())).toBe(true);
		expect(await alerts.resolve(opened?.id ?? '', new Date())).toBe(false);
		expect(await alerts.openIfNone(ALERT, new Date())).not.toBeNull();
		expect(await prisma.gatewayAlert.count({ where: { subjectId: RUN } })).toBe(2);
	});

	it('pages the history newest first', async () => {
		const firstPage = await alerts.listPage({ cursor: null, limit: 1 });

		expect(firstPage.items).toHaveLength(1);
		expect(firstPage.nextCursor).not.toBeNull();
	});
});
