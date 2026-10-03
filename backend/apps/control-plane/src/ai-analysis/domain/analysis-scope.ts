import type { AiAnalysisScope } from '@prisma/control-plane-client';

export const ANALYSIS_SCOPES: readonly AiAnalysisScope[] = ['platform', 'route', 'service'];

// Every scope but `platform` is about exactly one route or service.
export function isSubjectScope(scope: AiAnalysisScope): boolean {
	return scope !== 'platform';
}
