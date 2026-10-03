import type { AiAnalysis } from '@prisma/control-plane-client';
import { describe, expect, it, vi } from 'vitest';

import type { SystemHealthService } from '../../system-health/application/system-health.service.js';
import type { AiAnalysisRepository } from '../infrastructure/ai-analysis.repository.js';
import type { AnalysisSubject } from './ai-model-client.js';
import type { AiTool } from './ai-tool.js';
import { AnalysisToolFactory } from './analysis-tools.factory.js';

const SUBJECT: AnalysisSubject = { id: 'route-1', name: 'Pedidos' };
const COMPONENTS = [{ component: 'gateway', status: 'up', detail: null }];
const PREVIOUS = {
	id: 'a0',
	scope: 'route',
	subjectId: 'route-1',
	subjectName: 'Pedidos',
	windowMinutes: 60,
	summary: 'Tranquilo',
	riskLevel: 'low',
	highlights: [],
	recommendations: [],
	suggestedActions: [],
	trend: null,
	trendSummary: null,
	previousAnalysisId: null,
	model: 'test-model',
	requestedAt: new Date('2026-09-25T10:00:00.000Z'),
} as AiAnalysis;

type Fakes = {
	readonly systemHealthService: SystemHealthService;
	readonly analysisRepository: AiAnalysisRepository;
};

function buildFakes(): Fakes {
	return {
		systemHealthService: {
			getCurrentStatus: vi.fn().mockReturnValue(COMPONENTS),
			listRecentEvents: vi.fn().mockResolvedValue([]),
		} as unknown as SystemHealthService,
		analysisRepository: { listRecent: vi.fn().mockResolvedValue([PREVIOUS]) } as unknown as AiAnalysisRepository,
	};
}

function findTool(tools: readonly AiTool[], name: string): AiTool {
	const tool = tools.find((candidate) => candidate.name === name);

	if (!tool) {
		throw new Error(`no tool ${name}`);
	}

	return tool;
}

function buildFactory(fakes: Fakes): AnalysisToolFactory {
	const unused = {} as never;

	return new AnalysisToolFactory(
		fakes.systemHealthService,
		fakes.analysisRepository,
		unused,
		unused,
		unused,
		unused,
		unused,
		unused,
		unused,
		unused,
		unused,
		unused,
	);
}

async function runTool(fakes: Fakes, subject: AnalysisSubject, name: string, input: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
	const tools = buildFactory(fakes).buildTools(subject);

	return JSON.parse(await findTool(tools, name).run(input)) as unknown;
}

describe('AnalysisToolFactory', () => {
	it('reports the platform health with its recent transitions', async () => {
		const fakes = buildFakes();

		expect(await runTool(fakes, null, 'get_system_health')).toEqual({ components: COMPONENTS, recentEvents: [] });
	});

	// An empty history would read as "nothing ever happened" at exactly the
	// moment the control plane could not look.
	it('says the history is unavailable instead of empty when it cannot be read', async () => {
		const fakes = buildFakes();

		fakes.systemHealthService.listRecentEvents = vi.fn().mockRejectedValue(new Error('db down'));

		const result = (await runTool(fakes, null, 'get_system_health')) as { recentEvents: { unavailable: string } };

		expect(result.recentEvents.unavailable).toContain('not the same as there being none');
	});

	it('looks only at previous analyses of the same subject', async () => {
		const fakes = buildFakes();

		const analyses = (await runTool(fakes, SUBJECT, 'get_previous_analyses')) as readonly { id: string }[];

		expect(analyses.map((analysis) => analysis.id)).toEqual(['a0']);
		expect(fakes.analysisRepository.listRecent).toHaveBeenCalledWith({ scope: undefined, subjectId: 'route-1' }, 3);
	});

	it('looks at platform analyses for a platform run', async () => {
		const fakes = buildFakes();

		await runTool(fakes, null, 'get_previous_analyses');

		expect(fakes.analysisRepository.listRecent).toHaveBeenCalledWith({ scope: undefined, subjectId: null }, 3);
	});

	it('looks at another scope or subject when asked, and offers every tool', async () => {
		const fakes = buildFakes();

		await runTool(fakes, SUBJECT, 'get_previous_analyses', { scope: 'service', subjectId: 's1', limit: 1 });

		expect(fakes.analysisRepository.listRecent).toHaveBeenCalledWith({ scope: 'service', subjectId: 's1' }, 1);
		expect(
			buildFactory(fakes)
				.buildTools(null)
				.map((tool) => tool.name),
		).toEqual([
			'get_traffic_overview',
			'get_route_stats',
			'get_consumer_usage',
			'get_service_instances',
			'get_health_events',
			'get_recent_errors',
			'get_config_changes',
			'get_open_alerts',
			'get_alert_rules',
			'get_system_health',
			'get_previous_analyses',
		]);
	});
});
