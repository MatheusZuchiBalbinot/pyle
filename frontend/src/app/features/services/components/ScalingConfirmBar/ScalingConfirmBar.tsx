import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/app/ui/Button/Button';

import './ScalingConfirmBar.css';

export type ScalingConfirmBarProps = {
	readonly from: number;
	readonly to: number;
	readonly isSaving: boolean;
	readonly onCancel: () => void;
	readonly onApply: () => void;
};

// The pending change, shown only while the stepper differs from what is applied.
export function ScalingConfirmBar({ from, to, isSaving, onCancel, onApply }: ScalingConfirmBarProps): ReactElement {
	const { t } = useTranslation();
	const isReduction = to < from;
	const Icon = isReduction ? ArrowDownRight : ArrowUpRight;

	return (
		<div className="scaling-confirm-bar" data-direction={isReduction ? 'down' : 'up'}>
			<p className="scaling-confirm-text">
				<Icon size={14} aria-hidden="true" />
				<strong className="mono">{t('services.scaling.diff', { from, to })}</strong>
				{isReduction && <span className="muted">{t('services.scaling.reduceNote')}</span>}
			</p>
			<span className="scaling-confirm-actions">
				<Button isSmall onClick={onCancel} disabled={isSaving} data-tooltip={t('services.scaling.cancelTooltip')}>
					{t('services.scaling.cancel')}
				</Button>
				<Button isSmall variant="primary" onClick={onApply} disabled={isSaving} data-tooltip={t('services.scaling.applyTooltip')}>
					{t('services.scaling.apply')}
				</Button>
			</span>
		</div>
	);
}
