import { describe, expect, it } from 'vitest';

import type { AiTool } from '../../ai-analysis/application/ai-tool.js';
import { localizeTimestamps, toOperatorTime, withOperatorTimes } from './operator-time.js';

const SAO_PAULO = 'America/Sao_Paulo';

describe('operator time', () => {
	it('writes an instant as the operator wall clock, with its offset', () => {
		expect(toOperatorTime(new Date('2026-10-02T18:06:00.000Z'), SAO_PAULO)).toBe('2026-10-02T15:06:00-03:00');
		expect(toOperatorTime(new Date('2026-10-02T18:06:00.000Z'), 'UTC')).toBe('2026-10-02T18:06:00+00:00');
		expect(toOperatorTime(new Date('2026-10-03T01:30:00Z'), SAO_PAULO)).toBe('2026-10-02T22:30:00-03:00');
	});

	it('rewrites every UTC timestamp in a tool answer and leaves the rest alone', () => {
		const answer = '{"from":"2026-10-02T18:00:00Z","to":"2026-10-02T18:06:00.123Z","label":"T18:00Z is not a date","p95":45}';

		expect(localizeTimestamps(answer, SAO_PAULO)).toBe(
			'{"from":"2026-10-02T15:00:00-03:00","to":"2026-10-02T15:06:00-03:00","label":"T18:00Z is not a date","p95":45}',
		);
	});

	it('wraps tools so the model only ever reads local times', async () => {
		const tool: AiTool = {
			name: 'get',
			description: '',
			inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
			run: async () => '{"at":"2026-10-02T18:06:00Z"}',
		};
		const [wrapped] = withOperatorTimes([tool], SAO_PAULO);

		expect(await wrapped.run({})).toBe('{"at":"2026-10-02T15:06:00-03:00"}');
		expect(wrapped.name).toBe('get');
	});
});
