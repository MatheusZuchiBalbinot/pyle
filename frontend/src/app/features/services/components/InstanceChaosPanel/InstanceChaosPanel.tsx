import { Ban, CircleCheck, FlaskConical, SlidersHorizontal, Snail, Zap } from 'lucide-react';
import { useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChaosState } from '@/app/api/adminApiTypes';
import {
	CHAOS_PRESET_NAMES,
	chaosModeOf,
	NO_CHAOS,
	useInstanceChaos,
	type ChaosMode,
	type ChaosPreset,
	type InstanceTarget,
} from '@/app/features/services/hooks/useInstanceChaos';
import { Button } from '@/app/ui/Button/Button';
import { FormField } from '@/app/ui/FormField/FormField';
import { SwitchField } from '@/app/ui/SwitchField/SwitchField';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import '@/app/ui/DetailPanel/DetailPanel.css';
import './InstanceChaosPanel.css';

export type InstanceChaosPanelProps = { readonly target: InstanceTarget; readonly current: ChaosState | null };

type PresetOptionProps = {
	readonly preset: ChaosPreset;
	readonly isActive: boolean;
	readonly isDisabled: boolean;
	readonly onApply: (preset: ChaosPreset) => void;
};

const PERCENT = 100;
const PRESET_ICONS = { slow: Snail, flaky: Zap, down: Ban } as const;

// The three faults as cards that show which one runs, the way the instance is now in the
// header, and the hand-set values one step away.
export function InstanceChaosPanel({ target, current }: InstanceChaosPanelProps): ReactElement {
	const { t } = useTranslation();
	const { applyPreset, apply, normalize, isApplying, errorKey } = useInstanceChaos(target);
	const [isAdvanced, setIsAdvanced] = useState(false);
	const [draft, setDraft] = useState<ChaosState>(current ?? NO_CHAOS);
	const mode = chaosModeOf(current);
	const isActive = mode.kind !== 'off';

	function numberField(field: 'latencyMs' | 'jitterMs') {
		return (event: ChangeEvent<HTMLInputElement>): void => setDraft((value) => ({ ...value, [field]: Number(event.target.value) || 0 }));
	}

	function handleErrorRate(event: ChangeEvent<HTMLInputElement>): void {
		setDraft((value) => ({ ...value, errorRate: (Number(event.target.value) || 0) / PERCENT }));
	}

	function handleToggleDown(): void {
		setDraft((value) => ({ ...value, isDown: !value.isDown }));
	}

	function handleApplyPreset(preset: ChaosPreset): void {
		void applyPreset(preset);
	}

	function handleApplyDraft(): void {
		void apply(draft);
	}

	function handleNormalize(): void {
		void normalize();
	}

	// Opens on what the instance runs now, so a tweak starts from the current fault.
	function handleToggleAdvanced(): void {
		if (!isAdvanced) {
			setDraft(current ?? NO_CHAOS);
		}

		setIsAdvanced(!isAdvanced);
	}

	return (
		<section className="chaos-panel" aria-label={t('chaos.title')}>
			<header className="detail-section-head">
				<h4>
					<FlaskConical size={14} aria-hidden="true" />
					{t('chaos.title')}
				</h4>
				<span className={`badge ${isActive ? 'badge-warning' : 'badge-muted'}`}>
					<span className="dot" aria-hidden="true" />
					{t(statusKeyOf(mode))}
				</span>
			</header>
			<p className="detail-help">{t('chaos.help')}</p>
			<div className="chaos-options" role="group" aria-label={t('chaos.optionsLabel')}>
				{CHAOS_PRESET_NAMES.map((preset) => (
					<PresetOption key={preset} preset={preset} isActive={isPresetActive(mode, preset)} isDisabled={isApplying} onApply={handleApplyPreset} />
				))}
			</div>
			<div className="chaos-footer">
				<Button isSmall variant="primary" onClick={handleNormalize} disabled={isApplying || !isActive} data-tooltip={t('chaos.normalizeTooltip')}>
					<CircleCheck size={13} aria-hidden="true" />
					{t('chaos.normalize')}
				</Button>
				<Button isSmall aria-expanded={isAdvanced} onClick={handleToggleAdvanced} data-tooltip={t('chaos.advancedTooltip')}>
					<SlidersHorizontal size={13} aria-hidden="true" />
					{isAdvanced ? t('chaos.advancedHide') : t('chaos.advanced')}
				</Button>
			</div>
			{isAdvanced && (
				<div className="chaos-advanced form-grid">
					<FormField label={t('chaos.fields.latency')} hint={t('chaos.fields.latencyHint')}>
						<TextInput label={t('chaos.fields.latency')} inputMode="numeric" value={String(draft.latencyMs)} onChange={numberField('latencyMs')} />
					</FormField>
					<FormField label={t('chaos.fields.jitter')} hint={t('chaos.fields.jitterHint')}>
						<TextInput label={t('chaos.fields.jitter')} inputMode="numeric" value={String(draft.jitterMs)} onChange={numberField('jitterMs')} />
					</FormField>
					<FormField label={t('chaos.fields.errorRate')} hint={t('chaos.fields.errorRateHint')}>
						<TextInput
							label={t('chaos.fields.errorRate')}
							inputMode="numeric"
							value={String(Math.round(draft.errorRate * PERCENT))}
							onChange={handleErrorRate}
						/>
					</FormField>
					<SwitchField isOn={draft.isDown} label={t('chaos.fields.down')} hint={t('chaos.fields.downHint')} onToggle={handleToggleDown} />
					<div className="is-wide">
						<Button isSmall variant="primary" onClick={handleApplyDraft} disabled={isApplying} data-tooltip={t('chaos.applyTooltip')}>
							{t('chaos.apply')}
						</Button>
					</div>
				</div>
			)}
			{errorKey !== null && (
				<p className="chaos-error" role="alert">
					{t(errorKey)}
				</p>
			)}
		</section>
	);
}

function PresetOption({ preset, isActive, isDisabled, onApply }: PresetOptionProps): ReactElement {
	const { t } = useTranslation();
	const Icon = PRESET_ICONS[preset];

	function handleClick(): void {
		onApply(preset);
	}

	return (
		<button
			type="button"
			className={`chaos-option ${isActive ? 'is-active' : ''}`.trim()}
			aria-pressed={isActive}
			disabled={isDisabled}
			onClick={handleClick}
			data-tooltip={t(`chaos.presets.${preset}Tooltip`)}
		>
			<span className="chaos-option-icon" aria-hidden="true">
				<Icon size={15} />
			</span>
			<span className="chaos-option-text">
				<span className="chaos-option-title">{t(`chaos.presets.${preset}`)}</span>
				<span className="chaos-option-effect">{t(`chaos.presets.${preset}Effect`)}</span>
			</span>
		</button>
	);
}

function isPresetActive(mode: ChaosMode, preset: ChaosPreset): boolean {
	return mode.kind === 'preset' && mode.preset === preset;
}

function statusKeyOf(mode: ChaosMode): string {
	if (mode.kind === 'off') {
		return 'chaos.status.off';
	}

	if (mode.kind === 'custom') {
		return 'chaos.status.custom';
	}

	return `chaos.status.${mode.preset}`;
}
