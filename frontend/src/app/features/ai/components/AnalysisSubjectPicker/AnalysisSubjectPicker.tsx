import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { subjectOptions } from '@/app/features/ai/lib/analysisSubject';
import { SelectInput } from '@/app/ui/SelectInput/SelectInput';

type NamedSubject = { readonly id: string; readonly name: string };

type AnalysisSubjectPickerProps = {
	readonly scope: 'route' | 'service';
	readonly subjects: readonly NamedSubject[];
	// Null = every subject of the scope.
	readonly value: string | null;
	readonly onChange: (subjectId: string | null) => void;
};

export function AnalysisSubjectPicker({ scope, subjects, value, onChange }: AnalysisSubjectPickerProps): ReactElement {
	const { t } = useTranslation();
	const label = t(`aiAnalysis.subjectPicker.${scope}`);

	function handleChange(subjectId: string): void {
		onChange(subjectId === '' ? null : subjectId);
	}

	return <SelectInput label={label} tooltip={label} options={subjectOptions(subjects, t)} value={value ?? ''} onChange={handleChange} />;
}
