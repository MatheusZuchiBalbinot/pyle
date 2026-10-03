import { describe, expect, it } from 'vitest';

import { describeChangeDetail, diffFields, readChangeDetail, type ConfigChangeDetail } from './config-change-detail.js';

type Instance = {
	readonly weight: number;
	readonly isEnabled: boolean;
	readonly url: string;
	readonly methods: readonly string[];
	readonly timeoutMs: number | null | undefined;
};

const BEFORE: Instance = { weight: 1, isEnabled: true, url: 'http://a', methods: [], timeoutMs: null };

describe('diffFields', () => {
	it('keeps only the fields that changed, in the order given', () => {
		const after: Instance = { ...BEFORE, weight: 3, isEnabled: false };

		expect(diffFields(BEFORE, after, ['isEnabled', 'weight', 'url'])).toEqual({
			kind: 'fields',
			changes: [
				{ field: 'isEnabled', before: true, after: false },
				{ field: 'weight', before: 1, after: 3 },
			],
		});
	});

	it('treats undefined as unset and compares lists by content', () => {
		const after: Instance = { ...BEFORE, timeoutMs: undefined, methods: [] };

		expect(diffFields(BEFORE, after, ['timeoutMs', 'methods'])).toEqual({ kind: 'fields', changes: [] });
	});
});

describe('describeChangeDetail', () => {
	const cases: readonly (readonly [ConfigChangeDetail, string])[] = [
		[{ kind: 'created' }, 'created'],
		[{ kind: 'deleted' }, 'deleted'],
		[
			{
				kind: 'fields',
				changes: [
					{ field: 'methods', before: [], after: ['GET', 'HEAD'] },
					{ field: 'timeoutMs', before: null, after: 2000 },
				],
			},
			'methods [] -> [GET HEAD], timeoutMs none -> 2000',
		],
		[{ kind: 'fields', changes: [] }, 'no change'],
		[{ kind: 'key_issued', keyPrefix: 'pyle_live_Ab' }, 'issued key pyle_live_Ab'],
		[{ kind: 'key_revoked', keyPrefix: 'pyle_live_Ab' }, 'revoked key pyle_live_Ab'],
		[{ kind: 'key_restored', keyPrefix: 'pyle_live_Ab' }, 'restored key pyle_live_Ab'],
		[{ kind: 'route_scope', allowedRouteCount: 0 }, 'routes: all'],
		[{ kind: 'route_scope', allowedRouteCount: 2 }, 'routes: 2 allowed'],
		[{ kind: 'chaos', latencyMs: 800, jitterMs: 200, errorRate: 0.3, isDown: false }, 'chaos latency=800ms jitter=200ms errors=30% down=false'],
		[
			{ kind: 'alert_rule', alertKind: 'route_p95_latency', isEnabled: true, threshold: 800, sustainedWindows: 3 },
			'Alert rule route_p95_latency: enabled, threshold 800, 3 window(s)',
		],
		[
			{ kind: 'alert_rule', alertKind: 'circuit_open', isEnabled: false, threshold: null, sustainedWindows: 1 },
			'Alert rule circuit_open: disabled, 1 window(s)',
		],
		[{ kind: 'managed_replicas', from: 0, to: 2 }, 'managed replicas: 0 -> 2'],
		[{ kind: 'replica_running' }, 'provisioning -> running'],
		[{ kind: 'replica_draining' }, 'draining before removal'],
		[{ kind: 'replica_failed', reason: 'no healthy answer' }, 'failed: no healthy answer'],
	];

	it.each(cases)('describes %o in English', (detail, expected) => {
		expect(describeChangeDetail(detail)).toBe(expected);
	});
});

describe('readChangeDetail', () => {
	it('reads back a stored detail', () => {
		const stored = { kind: 'key_issued', keyPrefix: 'pyle_live_Ab' };

		expect(readChangeDetail(stored)).toEqual(stored);
	});

	it('returns null for rows without one, or with something it does not know', () => {
		expect(readChangeDetail(null)).toBeNull();
		expect(readChangeDetail(['created'])).toBeNull();
		expect(readChangeDetail({ kind: 'renamed' })).toBeNull();
		expect(readChangeDetail({ summary: 'created' })).toBeNull();
	});
});
