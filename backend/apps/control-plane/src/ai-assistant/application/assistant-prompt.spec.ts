import { describe, expect, it } from 'vitest';

import { buildAssistantSystemPrompt } from './assistant-prompt.js';

describe('buildAssistantSystemPrompt', () => {
	it('states the clock and the operator’s time zone, and that the model only proposes', () => {
		const prompt = buildAssistantSystemPrompt({ now: new Date('2026-09-24T15:00:00.000Z'), timeZone: 'America/Sao_Paulo' });

		expect(prompt).toContain("Current time: 2026-09-24T12:00:00-03:00 (the operator's time zone, America/Sao_Paulo)");
		expect(prompt).toContain('never in UTC');
		expect(prompt).toContain('You never execute anything');
	});

	it('explains the gateway, the method and the output the console renders', () => {
		const prompt = buildAssistantSystemPrompt({ now: new Date('2026-09-24T15:00:00.000Z'), timeZone: 'UTC' });

		expect(prompt).toContain('circuit breaker');
		expect(prompt).toContain('get_config_changes');
		expect(prompt).toContain('**bold**');
		expect(prompt).toContain('Not proposed');
		expect(prompt).not.toContain('—');
	});
});
