import { useMemo } from 'react';

import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import type { SubjectScope } from '../lib/analysisSubject';

export type AnalysisSubjects = {
	readonly byScope: Readonly<Record<SubjectScope, readonly NamedSubject[]>>;
	// Null until both lists loaded: nothing can be called removed before.
	readonly existingIds: ReadonlySet<string> | null;
};

type NamedSubject = { readonly id: string; readonly name: string };

const NO_SUBJECTS: readonly NamedSubject[] = [];

export function useAnalysisSubjects(): AnalysisSubjects {
	const routesState = useConfigList('routes').loadState;
	const servicesState = useConfigList('services').loadState;

	return useMemo(() => {
		const routes = routesState.status === LOAD_STATUS.loaded ? routesState.data : null;
		const services = servicesState.status === LOAD_STATUS.loaded ? servicesState.data : null;
		const byScope = { route: routes ?? NO_SUBJECTS, service: services ?? NO_SUBJECTS };
		const isComplete = routes !== null && services !== null;
		const existingIds = isComplete ? new Set([...routes, ...services].map((subject) => subject.id)) : null;

		return { byScope, existingIds };
	}, [routesState, servicesState]);
}
