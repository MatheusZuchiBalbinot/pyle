import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { PT_BR_TRANSLATION } from '@/i18n/loadLocale';

import type { ConfigChangeDetail } from '../api/adminApiTypes';
import { configChangeSubject, describeConfigChange, describeConfigChangeDetail, type TranslateFn } from './describeConfigChange';

// Echoes the key and its options, so each assertion names the message and what fills it.
const t: TranslateFn = (key, options) => (options === undefined ? key : `${key} ${JSON.stringify(options)}`);

const labelled: TranslateFn = (key, options) => {
	if (key === 'overviewPage.changes.field.lbStrategy') {
		return 'Balanceamento';
	}

	if (key === 'overviewPage.changes.field.timeoutMs') {
		return 'Timeout';
	}

	if (key === 'overviewPage.changes.field.methods') {
		return 'Métodos';
	}

	if (key === 'overviewPage.changes.field.isEnabled') {
		return 'Ativa';
	}

	if (key === 'overviewPage.changes.field.rateLimitPerMinute') {
		return 'Limite por minuto';
	}

	if (key === 'overviewPage.changes.value.ms') {
		return `${String(options?.value)} ms`;
	}

	if (key === 'overviewPage.changes.value.all') {
		return 'todos';
	}

	if (key === 'overviewPage.changes.value.unlimited') {
		return 'sem limite';
	}

	if (key === 'overviewPage.changes.value.none') {
		return 'nenhum';
	}

	if (key === 'overviewPage.changes.value.yes') {
		return 'sim';
	}

	if (key === 'overviewPage.changes.value.no') {
		return 'não';
	}

	if (key === 'gateway.strategy.round_robin') {
		return 'Round-robin';
	}

	if (key === 'gateway.strategy.least_connections') {
		return 'Menos conexões';
	}

	return key;
};

function describe_(detail: ConfigChangeDetail, translate: TranslateFn = t): string | null {
	return describeConfigChangeDetail(detail, translate);
}

describe('describeConfigChangeDetail', () => {
	it('leaves created and deleted to the action badge', () => {
		expect(describe_({ kind: 'created' })).toBeNull();
		expect(describe_({ kind: 'deleted' })).toBeNull();
	});

	it('labels fields and formats their values for the reader', () => {
		const detail: ConfigChangeDetail = {
			kind: 'fields',
			changes: [
				{ field: 'lbStrategy', before: 'round_robin', after: 'least_connections' },
				{ field: 'timeoutMs', before: 10000, after: 2000 },
				{ field: 'isEnabled', before: true, after: false },
			],
		};

		expect(describe_(detail, labelled)).toBe('Balanceamento: Round-robin → Menos conexões · Timeout: 10000 ms → 2000 ms · Ativa: sim → não');
	});

	it('says what an empty list or an unset limit means for that field', () => {
		const detail: ConfigChangeDetail = {
			kind: 'fields',
			changes: [
				{ field: 'methods', before: [], after: ['GET', 'HEAD'] },
				{ field: 'rateLimitPerMinute', before: null, after: 120 },
				{ field: 'scalingProfile', before: null, after: 'orders' },
			],
		};

		expect(describe_(detail, labelled)).toBe('Métodos: todos → GET, HEAD · Limite por minuto: sem limite → 120 · scalingProfile: nenhum → orders');
	});

	it('says so when an edit changed nothing', () => {
		expect(describe_({ kind: 'fields', changes: [] })).toBe('overviewPage.changes.noChange');
	});

	it('describes keys, route access and replicas', () => {
		expect(describe_({ kind: 'key_issued', keyPrefix: 'pyle_live_Ab' })).toBe('overviewPage.changes.key.issued {"prefix":"pyle_live_Ab"}');
		expect(describe_({ kind: 'key_revoked', keyPrefix: 'pyle_live_Ab' })).toBe('overviewPage.changes.key.revoked {"prefix":"pyle_live_Ab"}');
		expect(describe_({ kind: 'route_scope', allowedRouteCount: 0 })).toBe('overviewPage.changes.routeScope.all');
		expect(describe_({ kind: 'route_scope', allowedRouteCount: 2 })).toBe('overviewPage.changes.routeScope.some {"count":2}');
		expect(describe_({ kind: 'managed_replicas', from: 0, to: 2 })).toBe('overviewPage.changes.managedReplicas {"from":0,"to":2}');
		expect(describe_({ kind: 'replica_running' })).toBe('overviewPage.changes.replica.running');
		expect(describe_({ kind: 'replica_draining' })).toBe('overviewPage.changes.replica.draining');
		expect(describe_({ kind: 'replica_failed', reason: 'port taken' })).toBe('overviewPage.changes.replica.failed {"reason":"port taken"}');
	});

	it('lists only the faults chaos injected, or says it was cleared', () => {
		const chaos: ConfigChangeDetail = { kind: 'chaos', latencyMs: 800, jitterMs: 0, errorRate: 0.2, isDown: true };
		const faults = [
			'overviewPage.changes.chaos.latency {"latencyMs":800}',
			'overviewPage.changes.chaos.errors {"percent":20}',
			'overviewPage.changes.chaos.down',
		];

		expect(describe_(chaos)).toBe(`overviewPage.changes.chaos.applied ${JSON.stringify({ faults: faults.join(', ') })}`);
		expect(describe_({ kind: 'chaos', latencyMs: 0, jitterMs: 150, errorRate: 0, isDown: false })).toContain('chaos.jitter');
		expect(describe_({ kind: 'chaos', latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false })).toBe('overviewPage.changes.chaos.cleared');
	});

	it('describes an alert rule with or without a threshold', () => {
		const base = { kind: 'alert_rule', alertKind: 'route_p95_latency', sustainedWindows: 3 } as const;

		expect(describe_({ ...base, isEnabled: false, threshold: 800 })).toBe('overviewPage.changes.alertRule.disabled');
		expect(describe_({ ...base, isEnabled: true, threshold: null })).toBe('overviewPage.changes.alertRule.enabled {"count":3}');
		expect(describe_({ ...base, isEnabled: true, threshold: 800 })).toBe(
			'overviewPage.changes.alertRule.enabledWithThreshold {"threshold":800,"count":3}',
		);
	});
});

describe('describeConfigChange', () => {
	it('falls back to the recorded summary on rows without a detail', () => {
		expect(describeConfigChange({ detail: null, summary: 'weight 1 -> 3' }, t)).toBe('weight 1 -> 3');
	});
});

describe('configChangeSubject', () => {
	it('names an alert rule by its kind and anything else by its recorded name', () => {
		const rule: ConfigChangeDetail = { kind: 'alert_rule', alertKind: 'circuit_open', isEnabled: true, threshold: null, sustainedWindows: 1 };

		expect(configChangeSubject({ detail: rule, entityName: 'circuit_open' }, t)).toBe('alertKinds.circuitOpen');
		expect(configChangeSubject({ detail: { kind: 'created' }, entityName: 'Pedidos' }, t)).toBe('Pedidos');
		expect(configChangeSubject({ detail: null, entityName: null }, t)).toBeNull();
	});
});

// The real i18next and the real pt-BR strings: a fake t cannot catch an
// interpolation name i18next reserves (keyPrefix once turned a key line into
// "pyle_live_ap.overviewPage.changes.key.revoked").
describe('with the real translations', () => {
	const real = i18next.createInstance();

	void real.init({ resources: { 'pt-BR': { translation: PT_BR_TRANSLATION } }, lng: 'pt-BR', interpolation: { escapeValue: false } });
	const translate: TranslateFn = (key, options) => real.t(key, options);
	const everyKind: readonly ConfigChangeDetail[] = [
		{ kind: 'fields', changes: [{ field: 'lbStrategy', before: 'round_robin', after: 'least_connections' }] },
		{ kind: 'key_issued', keyPrefix: 'pyle_live_Ab' },
		{ kind: 'key_revoked', keyPrefix: 'pyle_live_Ab' },
		{ kind: 'route_scope', allowedRouteCount: 0 },
		{ kind: 'route_scope', allowedRouteCount: 2 },
		{ kind: 'chaos', latencyMs: 800, jitterMs: 100, errorRate: 0.3, isDown: true },
		{ kind: 'chaos', latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false },
		{ kind: 'alert_rule', alertKind: 'route_p95_latency', isEnabled: true, threshold: 800, sustainedWindows: 3 },
		{ kind: 'alert_rule', alertKind: 'circuit_open', isEnabled: true, threshold: null, sustainedWindows: 1 },
		{ kind: 'alert_rule', alertKind: 'circuit_open', isEnabled: false, threshold: null, sustainedWindows: 1 },
		{ kind: 'managed_replicas', from: 0, to: 2 },
		{ kind: 'replica_running' },
		{ kind: 'replica_draining' },
		{ kind: 'replica_failed', reason: 'port taken' },
	];

	it('renders every kind as Portuguese text, never a raw key', () => {
		const texts = everyKind.map((detail) => describeConfigChangeDetail(detail, translate) ?? '');

		expect(texts.filter((text) => text.includes('overviewPage.'))).toEqual([]);
		expect(texts[1]).toBe('chave pyle_live_Ab… emitida');
		expect(texts[0]).toBe('Balanceamento: Round-robin → Menos conexões');
	});
});
