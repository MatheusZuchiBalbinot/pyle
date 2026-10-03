import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import {
	ALL_ANALYSES,
	analysisSubjectKey,
	analysisSubjectLabel,
	describeAnalysisSubject,
	subjectOptions,
	subjectScopeOf,
	toListAnalysesFilter,
} from './analysisSubject';

const t = ((key: string) => key) as unknown as TFunction;

describe('analysis subject', () => {
	it('names a route or service by the name recorded with the analysis', () => {
		expect(analysisSubjectLabel({ subjectName: 'Pedidos' }, t)).toBe('Pedidos');
	});

	it('names the gateway for a platform analysis', () => {
		expect(analysisSubjectLabel({ subjectName: null }, t)).toBe('aiAnalysis.platformSubject');
	});

	it('keys each subject once and the platform once', () => {
		expect(analysisSubjectKey({ subjectId: 'r1' })).toBe('r1');
		expect(analysisSubjectKey({ subjectId: null })).toBe('platform');
	});
});

describe('describeAnalysisSubject', () => {
	const route = { scope: 'route', subjectId: 'r1', subjectName: 'Pedidos' } as const;

	it('marks a subject that no longer exists', () => {
		expect(describeAnalysisSubject(route, t, new Set(['r2']))).toBe('aiAnalysis.removedSubject.route');
	});

	it('keeps the name while the subject exists or the lists are loading', () => {
		expect(describeAnalysisSubject(route, t, new Set(['r1']))).toBe('Pedidos');
		expect(describeAnalysisSubject(route, t, null)).toBe('Pedidos');
	});

	it('never marks the platform', () => {
		expect(describeAnalysisSubject({ scope: 'platform', subjectId: null, subjectName: null }, t, new Set())).toBe('aiAnalysis.platformSubject');
	});
});

describe('analyses list filter', () => {
	it('asks for everything, a scope, or one subject of a scope', () => {
		expect(toListAnalysesFilter(ALL_ANALYSES)).toEqual({});
		expect(toListAnalysesFilter({ scope: 'route', subjectId: null })).toEqual({ scope: 'route' });
		expect(toListAnalysesFilter({ scope: 'service', subjectId: 's1' })).toEqual({ scope: 'service', subjectId: 's1' });
	});

	it('offers every subject by name, after "all"', () => {
		const options = subjectOptions(
			[
				{ id: 'b', name: 'Pedidos' },
				{ id: 'a', name: 'Catálogo' },
			],
			t,
		);

		expect(options).toEqual([
			{ value: '', label: 'aiAnalysis.allSubjects' },
			{ value: 'a', label: 'Catálogo' },
			{ value: 'b', label: 'Pedidos' },
		]);
	});
});

describe('subjectScopeOf', () => {
	it('picks the scopes that name a subject', () => {
		expect(subjectScopeOf('route')).toBe('route');
		expect(subjectScopeOf('service')).toBe('service');
		expect(subjectScopeOf('platform')).toBeNull();
		expect(subjectScopeOf('all')).toBeNull();
	});
});
