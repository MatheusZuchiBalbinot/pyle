import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiAnalysisScope } from '@/app/api/adminApiTypes';
import { Button } from '@/app/ui/Button/Button';

export type ScopeFilter = AiAnalysisScope | 'all';

const SCOPE_FILTERS: readonly ScopeFilter[] = ['all', 'platform', 'route', 'service'];

export type ScopeFiltersProps = {
	readonly value: ScopeFilter;
	readonly onChange: (scope: ScopeFilter) => void;
};

type ScopeFilterButtonProps = {
	readonly scope: ScopeFilter;
	readonly isActive: boolean;
	readonly onSelect: (scope: ScopeFilter) => void;
};

export function ScopeFilters({ value, onChange }: ScopeFiltersProps): ReactElement {
	const { t } = useTranslation();

	return (
		<span className="ai-analyses-filters" role="group" aria-label={t('aiAnalysis.filterAriaLabel')}>
			{SCOPE_FILTERS.map((scope) => (
				<ScopeFilterButton key={scope} scope={scope} isActive={scope === value} onSelect={onChange} />
			))}
		</span>
	);
}

function ScopeFilterButton({ scope, isActive, onSelect }: ScopeFilterButtonProps): ReactElement {
	const { t } = useTranslation();
	const scopeLabel = t(`aiAnalysis.scope.${scope}`);

	function handleClick(): void {
		onSelect(scope);
	}

	return (
		<Button variant="pill" isActive={isActive} onClick={handleClick} data-tooltip={t('aiAnalysis.filterTooltip', { scope: scopeLabel })}>
			{scopeLabel}
		</Button>
	);
}
