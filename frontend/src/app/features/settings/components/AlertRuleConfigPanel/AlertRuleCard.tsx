import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AlertRuleConfig, GatewayAlertKind } from '@/app/api/adminApiTypes';
import { Button } from '@/app/ui/Button/Button';
import { Switch } from '@/app/ui/Switch/Switch';
import { TextInput } from '@/app/ui/TextInput/TextInput';

export type AlertRuleCardProps = {
	readonly rule: AlertRuleConfig;
	// The pending edit, or the persisted rule when there is none.
	readonly draft: AlertRuleConfig;
	readonly isDirty: boolean;
	readonly isSaving: boolean;
	readonly errorMessage: string | undefined;
	readonly label: string;
	readonly description: string;
	readonly icon: LucideIcon;
	readonly onDraftChange: (rule: AlertRuleConfig, patch: Partial<AlertRuleConfig>) => void;
	readonly onSave: (rule: AlertRuleConfig) => void;
	readonly onDiscard: (rule: AlertRuleConfig) => void;
};

type ThresholdBounds = { readonly min: number; readonly max: number; readonly labelKey: string };

// Latency in milliseconds, error rate in percent; the two instance kinds
// have no threshold. The minimum doubles as the fallback for a cleared
// field: a threshold of 0 would fire on every window.
// The traffic bucket every rule window is made of.
const TRAFFIC_WINDOW_SECONDS = 10;
const THRESHOLD_BOUNDS_BY_KIND: Readonly<Record<GatewayAlertKind, ThresholdBounds | null>> = {
	route_p95_latency: { min: 1, max: 60_000, labelKey: 'alertRuleConfigPanel.thresholdMsLabel' },
	route_error_rate: { min: 1, max: 100, labelKey: 'alertRuleConfigPanel.thresholdPercentLabel' },
	instance_unhealthy: null,
	circuit_open: null,
};
const MIN_SUSTAINED_WINDOWS = 1;
const MAX_SUSTAINED_WINDOWS = 30;

export function AlertRuleCard({
	rule,
	draft,
	isDirty,
	isSaving,
	errorMessage,
	label,
	description,
	icon: Icon,
	onDraftChange,
	onSave,
	onDiscard,
}: AlertRuleCardProps): ReactElement {
	const { t } = useTranslation();
	const thresholdBounds = THRESHOLD_BOUNDS_BY_KIND[rule.kind];

	function handleToggleEnabled(): void {
		onDraftChange(rule, { isEnabled: !draft.isEnabled });
	}

	function handleThresholdChange(event: ChangeEvent<HTMLInputElement>): void {
		const fallback = thresholdBounds?.min ?? null;
		const threshold = fallback === null ? null : parseNumberOr(event.target.value, fallback);

		onDraftChange(rule, { threshold });
	}

	function handleSustainedWindowsChange(event: ChangeEvent<HTMLInputElement>): void {
		const sustainedWindows = parseNumberOr(event.target.value, MIN_SUSTAINED_WINDOWS);

		onDraftChange(rule, { sustainedWindows });
	}

	function handleSaveClick(): void {
		onSave(rule);
	}

	function handleDiscardClick(): void {
		onDiscard(rule);
	}

	return (
		<article className={`alert-rule-card ${draft.isEnabled ? 'is-enabled' : 'is-disabled'}`} data-card={`settings-rule-${rule.kind}`}>
			<header className="alert-rule-card-head">
				<span className="alert-rule-card-icon" aria-hidden="true">
					<Icon size={16} />
				</span>
				<span className="alert-rule-card-title">
					<strong>{label}</strong>
					<small>{description}</small>
				</span>
				<Switch
					isOn={draft.isEnabled}
					label={t('alertRuleConfigPanel.toggleLabel', { rule: label })}
					onToggle={handleToggleEnabled}
					isDisabled={isSaving}
					tooltip={t('alertRuleConfigPanel.toggleTooltip')}
				/>
			</header>
			<div className="alert-rule-card-fields">
				{thresholdBounds && (
					<TextInput
						label={t(thresholdBounds.labelKey)}
						isLabelVisible
						className="alert-rule-field-input"
						type="number"
						min={thresholdBounds.min}
						max={thresholdBounds.max}
						value={draft.threshold ?? ''}
						onChange={handleThresholdChange}
						disabled={isSaving}
					/>
				)}
				<TextInput
					label={t('alertRuleConfigPanel.sustainedWindowsLabel')}
					isLabelVisible
					className="alert-rule-field-input"
					type="number"
					min={MIN_SUSTAINED_WINDOWS}
					max={MAX_SUSTAINED_WINDOWS}
					value={draft.sustainedWindows}
					onChange={handleSustainedWindowsChange}
					disabled={isSaving}
				/>
				<span className="alert-rule-card-hint">
					{t('alertRuleConfigPanel.windowsHint', { count: draft.sustainedWindows, seconds: draft.sustainedWindows * TRAFFIC_WINDOW_SECONDS })}
				</span>
			</div>
			<footer className={`alert-rule-card-foot ${isDirty ? 'is-dirty' : ''}`}>
				{errorMessage && <span className="alert-rule-row-error">{errorMessage}</span>}
				{isDirty ? (
					<>
						<Button variant="pill" isSmall onClick={handleDiscardClick} disabled={isSaving} data-tooltip={t('alertRuleConfigPanel.discardTooltip')}>
							{t('alertRuleConfigPanel.discard')}
						</Button>
						<Button variant="primary" isSmall onClick={handleSaveClick} disabled={isSaving} data-tooltip={t('alertRuleConfigPanel.saveTooltip')}>
							{isSaving ? t('common.saving') : t('common.save')}
						</Button>
					</>
				) : (
					<span className="alert-rule-card-saved">{t('alertRuleConfigPanel.saved')}</span>
				)}
			</footer>
		</article>
	);
}

function parseNumberOr(rawValue: string, fallback: number): number {
	const value = Number(rawValue);

	if (Number.isNaN(value)) {
		return fallback;
	}

	return value;
}
