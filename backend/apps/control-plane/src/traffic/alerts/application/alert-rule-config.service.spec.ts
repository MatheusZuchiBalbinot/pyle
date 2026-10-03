import type { AlertRuleConfig } from '@prisma/control-plane-client';
import { describe, expect, it, vi } from 'vitest';

import type { ControlPlanePrismaService } from '../../../control-plane/prisma/control-plane-prisma.service.js';
import type { ConfigChangeRecorder } from '../../../gateway-config/application/config-change-recorder.js';
import { ConfigValidationError } from '../../../gateway-config/domain/config-errors.js';
import { DEFAULT_ALERT_RULES } from '../domain/alert-rule-kinds.js';
import type { AlertRuleConfigRepository } from '../infrastructure/alert-rule-config.repository.js';
import { AlertRuleConfigService } from './alert-rule-config.service.js';

const ROW: AlertRuleConfig = {
	id: 'rule-1',
	kind: 'route_p95_latency',
	isEnabled: false,
	threshold: 1200,
	sustainedWindows: 5,
	updatedAt: new Date(),
};
const ACTOR = { email: 'ops@pyle.local' };

function build(rows: readonly AlertRuleConfig[] = [ROW]) {
	const repository = {
		listAll: vi.fn().mockResolvedValue(rows),
		ensureRows: vi.fn().mockResolvedValue(0),
		upsert: vi.fn(async (kind: AlertRuleConfig['kind'], settings: object) => ({ ...ROW, kind, ...settings })),
	};
	const recorder = { record: vi.fn().mockResolvedValue(undefined), announce: vi.fn().mockResolvedValue(undefined) };
	const prisma = { $transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work('tx')) };
	const service = new AlertRuleConfigService(
		prisma as unknown as ControlPlanePrismaService,
		repository as unknown as AlertRuleConfigRepository,
		recorder as unknown as ConfigChangeRecorder,
	);

	return { service, repository, recorder };
}

describe('AlertRuleConfigService', () => {
	it('creates the missing default rows on boot, and survives a database that is not up', async () => {
		const { service, repository } = build();

		repository.ensureRows.mockResolvedValueOnce(3).mockRejectedValueOnce(new Error('db down'));

		await service.onModuleInit();
		await service.onModuleInit();

		expect(repository.ensureRows).toHaveBeenCalledWith(expect.arrayContaining([{ kind: 'circuit_open', ...DEFAULT_ALERT_RULES.circuit_open }]));
	});

	it('lists every kind, from its row or its default', async () => {
		const { service } = build();

		const rules = await service.listAll();

		expect(rules).toEqual([
			{ kind: 'route_p95_latency', isEnabled: false, threshold: 1200, sustainedWindows: 5 },
			{ kind: 'route_error_rate', ...DEFAULT_ALERT_RULES.route_error_rate },
			{ kind: 'instance_unhealthy', ...DEFAULT_ALERT_RULES.instance_unhealthy },
			{ kind: 'circuit_open', ...DEFAULT_ALERT_RULES.circuit_open },
		]);
	});

	it('changes a rule in one transaction with its audit row, then announces it', async () => {
		const { service, repository, recorder } = build();

		const updated = await service.update('route_error_rate', { isEnabled: true, threshold: 10, sustainedWindows: 2 }, ACTOR);

		expect(updated).toEqual({ kind: 'route_error_rate', isEnabled: true, threshold: 10, sustainedWindows: 2 });
		expect(repository.upsert).toHaveBeenCalledWith('route_error_rate', { isEnabled: true, threshold: 10, sustainedWindows: 2 }, 'tx');
		const detail = { kind: 'alert_rule', alertKind: 'route_error_rate', isEnabled: true, threshold: 10, sustainedWindows: 2 };
		const change = { entityType: 'alert_rule', entityId: 'rule-1', entityName: 'route_error_rate', action: 'updated', detail };

		expect(recorder.record).toHaveBeenCalledWith(change, ACTOR, 'tx');
		expect(recorder.announce).toHaveBeenCalledWith([change]);
	});

	it.each([
		{ name: 'an unknown kind', kind: 'high_cpu', threshold: 10 },
		{ name: 'a threshold on an instance kind', kind: 'circuit_open', threshold: 10 },
		{ name: 'no threshold on a route kind', kind: 'route_p95_latency', threshold: null },
		{ name: 'a threshold out of range', kind: 'route_error_rate', threshold: 101 },
	])('rejects $name', async ({ kind, threshold }) => {
		const { service, repository } = build();

		await expect(service.update(kind, { isEnabled: true, threshold, sustainedWindows: 1 }, ACTOR)).rejects.toThrow(ConfigValidationError);
		expect(repository.upsert).not.toHaveBeenCalled();
	});

	it('records a disabled instance rule without a threshold', async () => {
		const { service, recorder } = build();

		await service.update('instance_unhealthy', { isEnabled: false, threshold: null, sustainedWindows: 1 }, ACTOR);

		const detail = { kind: 'alert_rule', alertKind: 'instance_unhealthy', isEnabled: false, threshold: null, sustainedWindows: 1 };

		expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ detail }), ACTOR, 'tx');
	});
});
