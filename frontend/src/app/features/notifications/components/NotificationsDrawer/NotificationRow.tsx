import { AlertTriangle, Check, CheckCircle2, CircleAlert, Info, RotateCcw, type LucideIcon } from 'lucide-react';
import type { MouseEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminNotification, AdminNotificationSeverity } from '@/app/api/notificationTypes';
import { toRealtimeEventCopy, type RealtimeEventCopy } from '@/app/features/notifications/lib/realtimeEventCopy';
import { formatDateTime } from '@/app/lib/format';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';

export type NotificationRowProps = {
	readonly notification: AdminNotification;
	// How many identical notifications in a row this one stands for.
	readonly repeatCount: number;
	readonly onOpen: (notification: AdminNotification, copy: RealtimeEventCopy) => void;
	readonly onToggleRead: () => void;
};

const SEVERITY_ICONS: Readonly<Record<AdminNotificationSeverity, LucideIcon>> = {
	danger: CircleAlert,
	warning: AlertTriangle,
	success: CheckCircle2,
	info: Info,
};

export function NotificationRow({ notification, repeatCount, onOpen, onToggleRead }: NotificationRowProps): ReactElement {
	const { t, i18n } = useTranslation();
	const copy = toRealtimeEventCopy(notification.event, t);
	const Icon = SEVERITY_ICONS[notification.severity];
	const targetLabel = t(`sidebar.nav.${copy.targetPage}`);

	function handleClick(): void {
		onOpen(notification, copy);
	}

	function handleToggleReadClick(event: MouseEvent<HTMLButtonElement>): void {
		event.stopPropagation();
		onToggleRead();
	}

	return (
		<li className={`notification-entry is-${notification.severity} ${notification.isRead ? 'is-read' : 'is-unread'}`}>
			<Button
				variant="scope-option"
				className="notification-entry-body"
				onClick={handleClick}
				data-tooltip={t('notifications.openTooltip', { page: targetLabel })}
			>
				<span className="notification-row-icon">
					<Icon size={15} aria-hidden="true" />
				</span>
				<span className="notification-entry-text">
					<strong>
						{copy.title}
						{repeatCount > 1 && (
							<span className="notification-repeat" data-tooltip={t('notifications.repeatTooltip', { count: repeatCount })}>
								×{repeatCount}
							</span>
						)}
					</strong>
					<small>{copy.detail}</small>
					<span className="notification-entry-meta">
						<span className="badge badge-muted">{t(`notifications.category.${notification.category}`)}</span>
						{formatDateTime(notification.createdAt, i18n.language)}
					</span>
				</span>
			</Button>
			<IconButton
				className="notification-entry-toggle"
				label={notification.isRead ? t('notifications.markUnread') : t('notifications.markRead')}
				onClick={handleToggleReadClick}
			>
				{notification.isRead ? <RotateCcw size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
			</IconButton>
		</li>
	);
}
