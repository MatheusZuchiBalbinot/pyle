import { describe, expect, it } from 'vitest';

import { ProposalCollector } from './assistant-proposal.js';

describe('ProposalCollector', () => {
	it('keeps a proposal repeated in the same turn once, in first-seen order', () => {
		const collector = new ProposalCollector();
		const platform = { type: 'generate_analysis', scope: 'platform', subjectId: null, subjectName: null, windowMinutes: null, reason: 'r' } as const;
		const rule = { type: 'update_alert_rule', kind: 'circuit_open', isEnabled: false, threshold: null, sustainedWindows: 1, reason: 'r' } as const;

		collector.add(platform);
		collector.add(rule);
		collector.add({ ...platform });

		expect(collector.list()).toEqual([platform, rule]);
	});
});
