import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { TrafficWindowName } from '@/app/api/adminApiTypes';
import { TRAFFIC_WINDOW_NAMES } from '@/app/features/traffic/hooks/useTrafficWindow';
import { PillGroup, type PillOption } from '@/app/ui/PillGroup/PillGroup';

export type TrafficWindowPickerProps = {
	readonly value: TrafficWindowName;
	readonly onChange: (value: TrafficWindowName) => void;
};

export function TrafficWindowPicker({ value, onChange }: TrafficWindowPickerProps): ReactElement {
	const { t } = useTranslation();
	const options: readonly PillOption<TrafficWindowName>[] = TRAFFIC_WINDOW_NAMES.map((name) => {
		const label = t(`gateway.window.${name}`);

		return { value: name, label, tooltip: t('gateway.window.tooltip', { window: label }) };
	});

	return <PillGroup options={options} value={value} onChange={onChange} ariaLabel={t('gateway.window.label')} />;
}
