import { AlertTriangle, CircleAlert, Info, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import {
	toNotificationSeverity,
	toNotificationTarget,
	type NotificationItem,
	type NotificationSeverity,
} from '@/app/features/notifications/hooks/useNotifications';
import { ALERT_KIND_LABEL_KEYS, SYSTEM_COMPONENT_LABELS } from '@/app/lib/adminLabels';
import { assertUnreachable } from '@/app/lib/assertUnreachable';
import { Button } from '@/app/ui/Button/Button';

export type ConditionRowProps = {
	readonly item: NotificationItem;
	readonly onOpen: (item: NotificationItem) => void;
};

type NotificationCopy = { readonly title: string; readonly detail: string };

// A live condition (something currently wrong or in flight), derived from
// state by useNotifications — it disappears on its own when resolved.
const SEVERITY_ICONS: Readonly<Record<NotificationSeverity, LucideIcon>> = {
	danger: CircleAlert,
	warning: AlertTriangle,
	info: Info,
};

export function ConditionRow({ item, onOpen }: ConditionRowProps): ReactElement {
	const { t } = useTranslation();
	const toCopy = useNotificationCopy();
	const severity = toNotificationSeverity(item);
	const Icon = SEVERITY_ICONS[severity];
	const { title, detail } = toCopy(item);
	const targetLabel = t(`sidebar.nav.${toNotificationTarget(item).page}`);

	function handleClick(): void {
		onOpen(item);
	}

	return (
		<li>
			<Button
				variant="scope-option"
				className={`notification-row is-${severity}`}
				onClick={handleClick}
				data-tooltip={t('notifications.openTooltip', { page: targetLabel })}
			>
				<span className="notification-row-icon">
					<Icon size={15} aria-hidden="true" />
				</span>
				<span>
					<strong>{title}</strong>
					<small>{detail}</small>
				</span>
			</Button>
		</li>
	);
}

function useNotificationCopy(): (item: NotificationItem) => NotificationCopy {
	const { t } = useTranslation();

	return function toCopy(item: NotificationItem): NotificationCopy {
		switch (item.kind) {
			case 'source-unavailable':
				return {
					title: t(`notifications.sourceUnavailable.${item.source}`),
					detail: t('notifications.sourceUnavailable.detail'),
				};
			case 'gateway-alert':
				return {
					title: t('notifications.gatewayAlert.title', { subject: item.alert.subjectName, kind: t(ALERT_KIND_LABEL_KEYS[item.alert.kind]) }),
					detail: item.alert.message,
				};

			case 'instance-down': {
				const reasonKey = item.instance.live?.circuit === 'open' ? 'circuitOpen' : 'unhealthy';

				return {
					title: t('notifications.instanceDown.title', { instance: item.instance.name, service: item.service.name }),
					detail: t(`notifications.instanceDown.${reasonKey}`),
				};
			}

			case 'system-component':
				return {
					title: t('notifications.systemComponent.title', { name: SYSTEM_COMPONENT_LABELS[item.component.component] }),
					detail: item.component.detail ?? t(`statusBadge.${item.component.status}`),
				};
			default:
				return assertUnreachable(item);
		}
	};
}
