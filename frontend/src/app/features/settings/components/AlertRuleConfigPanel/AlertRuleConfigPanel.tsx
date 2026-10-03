import type { TFunction } from 'i18next';
import { CircleSlash, Gauge, ServerCrash, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, updateAlertRule } from '@/app/api/adminApiClient';
import type { AlertRuleConfig, GatewayAlertKind, UpdateAlertRuleConfigInput } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import type { AlertRulesLoadState } from '@/app/features/settings/hooks/useAlertRules';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { AlertRuleCard } from './AlertRuleCard';
import { AlertRuleConfigPanelSkeleton } from './AlertRuleConfigPanelSkeleton';

import './AlertRuleConfigPanel.css';

type AlertRuleConfigPanelProps = {
	// Owned by the page (useAlertRules) so its hero reads the same rows.
	readonly loadState: AlertRulesLoadState;
	readonly refetch: () => Promise<void>;
};

// A kind without a draft renders the persisted rule; a save refetches, then drops the
// draft.
type DraftByKind = Partial<Record<GatewayAlertKind, AlertRuleConfig>>;

const KIND_ICONS: Readonly<Record<GatewayAlertKind, LucideIcon>> = {
	route_p95_latency: Gauge,
	route_error_rate: TriangleAlert,
	instance_unhealthy: ServerCrash,
	circuit_open: CircleSlash,
};

export function AlertRuleConfigPanel({ loadState, refetch }: AlertRuleConfigPanelProps): ReactElement {
	const { t } = useTranslation();
	const emitLocalEvent = useEmitLocalEvent();
	const [drafts, setDrafts] = useState<DraftByKind>({});
	const [savingKind, setSavingKind] = useState<GatewayAlertKind | null>(null);
	const [errorByKind, setErrorByKind] = useState<Partial<Record<GatewayAlertKind, string>>>({});

	function handleDraftChange(rule: AlertRuleConfig, patch: Partial<AlertRuleConfig>): void {
		setDrafts((current) => ({ ...current, [rule.kind]: { ...(current[rule.kind] ?? rule), ...patch } }));
	}

	function clearDraft(kind: GatewayAlertKind): void {
		setDrafts((current) => {
			const { [kind]: _dropped, ...rest } = current;

			return rest;
		});
	}

	function handleSaveRule(rule: AlertRuleConfig): void {
		void handleSave(rule.kind);
	}

	function handleDiscardRule(rule: AlertRuleConfig): void {
		clearDraft(rule.kind);
	}

	async function handleSave(kind: GatewayAlertKind): Promise<void> {
		const draft = drafts[kind];

		if (!draft) {
			return;
		}

		setSavingKind(kind);
		setErrorByKind((current) => ({ ...current, [kind]: undefined }));
		const input: UpdateAlertRuleConfigInput = { isEnabled: draft.isEnabled, threshold: draft.threshold, sustainedWindows: draft.sustainedWindows };

		try {
			await updateAlertRule(kind, input);
			// Every other view of the rules (the page hero, another panel)
			// refetches on this; the backend's own event follows.
			const ruleChangedEvent = stampLocalEvent({ type: 'entity.changed', entity: 'AlertRuleConfig', action: 'updated', id: null });

			emitLocalEvent(ruleChangedEvent);
			await refetch();
			clearDraft(kind);
		} catch (error) {
			const message = error instanceof AdminApiError ? error.message : t('alertRuleConfigPanel.saveError');

			setErrorByKind((current) => ({ ...current, [kind]: message }));
		} finally {
			setSavingKind(null);
		}
	}

	if (loadState.status === LOAD_STATUS.loading) {
		return <AlertRuleConfigPanelSkeleton />;
	}

	if (loadState.status === LOAD_STATUS.error) {
		return <div className="panel error-state">{loadState.message}</div>;
	}

	const kindLabels = buildKindLabels(t);
	const kindDescriptions = buildKindDescriptions(t);

	return (
		<div className="alert-rules-grid" data-card="settings-alert-rules">
			{loadState.data.map((rule) => (
				<AlertRuleCard
					key={rule.kind}
					rule={rule}
					draft={drafts[rule.kind] ?? rule}
					isDirty={drafts[rule.kind] !== undefined}
					isSaving={savingKind === rule.kind}
					errorMessage={errorByKind[rule.kind]}
					label={kindLabels[rule.kind]}
					description={kindDescriptions[rule.kind]}
					icon={KIND_ICONS[rule.kind]}
					onDraftChange={handleDraftChange}
					onSave={handleSaveRule}
					onDiscard={handleDiscardRule}
				/>
			))}
		</div>
	);
}

function buildKindDescriptions(t: TFunction): Readonly<Record<GatewayAlertKind, string>> {
	return {
		route_p95_latency: t('alertRuleConfigPanel.kindDescriptions.routeP95Latency'),
		route_error_rate: t('alertRuleConfigPanel.kindDescriptions.routeErrorRate'),
		instance_unhealthy: t('alertRuleConfigPanel.kindDescriptions.instanceUnhealthy'),
		circuit_open: t('alertRuleConfigPanel.kindDescriptions.circuitOpen'),
	};
}

function buildKindLabels(t: TFunction): Readonly<Record<GatewayAlertKind, string>> {
	return {
		route_p95_latency: t('alertKinds.routeP95Latency'),
		route_error_rate: t('alertKinds.routeErrorRate'),
		instance_unhealthy: t('alertKinds.instanceUnhealthy'),
		circuit_open: t('alertKinds.circuitOpen'),
	};
}
