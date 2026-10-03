import { Bell, CheckCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { AdminNotification, AdminNotificationCategory, NotificationReadFilter } from '@/app/api/notificationTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useAdminNotifications, type NotificationsFilter } from '@/app/features/notifications/hooks/useAdminNotifications';
import { toNotificationTarget, useNotifications, type NotificationItem } from '@/app/features/notifications/hooks/useNotifications';
import { groupConsecutive } from '@/app/features/notifications/lib/groupConsecutive';
import { toRealtimeEventCopy, type RealtimeEventCopy } from '@/app/features/notifications/lib/realtimeEventCopy';
import { ESCAPE_KEY } from '@/app/lib/keyboardKeys';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';
import { MenuSkeleton } from '@/app/ui/MenuSkeleton/MenuSkeleton';

import { ConditionRow } from './ConditionRow';
import { NotificationRow } from './NotificationRow';

import './NotificationsDrawer.css';

const MAX_BADGE_COUNT = 99;
const CATEGORY_FILTERS: readonly (AdminNotificationCategory | 'all')[] = ['all', 'traffic', 'instance', 'system', 'ai'];
const READ_FILTERS: readonly NotificationReadFilter[] = ['unread', 'read', 'all'];

// Two halves: live conditions (gone once they clear) and the persisted inbox (read state
// shared across sessions).
export function NotificationsDrawer(): ReactElement {
	const { t } = useTranslation();
	const { navigate, openSelection, openAnalysis } = useGateway();
	const conditions = useNotifications();
	const [isOpen, setIsOpen] = useState(false);
	const [filter, setFilter] = useState<NotificationsFilter>({ category: 'all', read: 'unread' });
	const inbox = useAdminNotifications(filter);

	const close = useCallback(() => setIsOpen(false), []);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === ESCAPE_KEY) {
				close();
			}
		}

		document.addEventListener('keydown', handleKeyDown);

		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, close]);

	function handleToggle(): void {
		setIsOpen((current) => !current);
	}

	function handleOpenCondition(item: NotificationItem): void {
		close();
		const target = toNotificationTarget(item);

		if (target.selection) {
			openSelection(target.selection);

			return;
		}

		navigate(target.page);
	}

	function handleOpenNotification(notification: AdminNotification, copy: RealtimeEventCopy): void {
		close();

		if (!notification.isRead) {
			void inbox.setRead(notification, true);
		}

		if (copy.analysisId !== undefined) {
			openAnalysis(copy.analysisId);

			return;
		}

		if (copy.selection) {
			openSelection(copy.selection);

			return;
		}

		navigate(copy.targetPage);
	}

	// A folded group shares its read state, so one click flips all of it.
	function handleToggleGroupRead(notifications: readonly AdminNotification[]): void {
		for (const notification of notifications) {
			void inbox.setRead(notification, !notification.isRead);
		}
	}

	// The same message in a row (a chaos toggled five times) reads as one line with a count.
	function repeatKeyOf(notification: AdminNotification): string {
		const copy = toRealtimeEventCopy(notification.event, t);

		return [notification.severity, notification.category, String(notification.isRead), copy.title, copy.detail].join('|');
	}

	function handleMarkAllRead(): void {
		void inbox.markAllRead();
	}

	const badgeCount = conditions.items.length + inbox.unreadCount;
	const hasBadge = badgeCount > 0;
	const badgeClassName = conditions.dangerCount > 0 ? 'notification-badge is-danger' : 'notification-badge';
	const buttonLabel = hasBadge ? t('notifications.buttonLabelWithCount', { count: badgeCount }) : t('topbar.notifications');

	function renderConditions(): ReactElement {
		if (!conditions.isLoaded) {
			return <MenuSkeleton rowCount={2} />;
		}

		if (conditions.items.length === 0) {
			return <p className="notifications-hint">{t('notifications.emptyDetail')}</p>;
		}

		return (
			<ul className="notifications-list">
				{conditions.items.map((item) => (
					<ConditionRow key={item.id} item={item} onOpen={handleOpenCondition} />
				))}
			</ul>
		);
	}

	function renderInbox(): ReactElement {
		if (inbox.loadState.status === LOAD_STATUS.loading) {
			return <MenuSkeleton rowCount={4} />;
		}

		if (inbox.loadState.status === LOAD_STATUS.error) {
			return <p className="notifications-hint">{inbox.loadState.message}</p>;
		}

		const items = inbox.loadState.data.items;

		if (items.length === 0) {
			return <p className="notifications-hint">{t(`notifications.inboxEmpty.${filter.read}`)}</p>;
		}

		const groups = groupConsecutive(items, repeatKeyOf);

		return (
			<ul className="notifications-list">
				{groups.map((group) => (
					<NotificationRow
						key={group.first.id}
						notification={group.first}
						repeatCount={group.items.length}
						onOpen={handleOpenNotification}
						onToggleRead={() => handleToggleGroupRead(group.items)}
					/>
				))}
			</ul>
		);
	}

	const drawer = (
		<div className={`notifications-drawer-root ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
			<div className="notifications-scrim" role="presentation" onClick={close} />
			<aside className="notifications-drawer" role="dialog" aria-modal="true" aria-label={t('topbar.notifications')}>
				<header className="notifications-drawer-head">
					<h2>{t('topbar.notifications')}</h2>
					<Button
						variant="pill"
						isSmall
						onClick={handleMarkAllRead}
						disabled={inbox.unreadCount === 0}
						data-tooltip={t('notifications.markAllReadTooltip')}
					>
						<CheckCheck size={13} aria-hidden="true" />
						{t('notifications.markAllRead')}
					</Button>
					<IconButton className="notifications-drawer-close" label={t('notifications.close')} onClick={close}>
						<X size={16} aria-hidden="true" />
					</IconButton>
				</header>

				<section className="notifications-conditions" aria-label={t('notifications.conditionsTitle')}>
					<div className="notifications-head">
						<span className="scope-menu-title">{t('notifications.conditionsTitle')}</span>
						{conditions.items.length > 0 && (
							<span className="notifications-count">{t('notifications.count', { count: conditions.items.length })}</span>
						)}
					</div>
					{renderConditions()}
				</section>

				<section className="notifications-inbox" aria-label={t('notifications.recentTitle')}>
					<div className="notifications-inbox-toolbar">
						<div className="notifications-inbox-toolbar-row">
							<span className="scope-menu-title">{t('notifications.recentTitle')}</span>
							<div className="filter-group" role="tablist" aria-label={t('notifications.readFilterAriaLabel')}>
								{READ_FILTERS.map((read) => {
									function handleClick(): void {
										setFilter((current) => ({ ...current, read }));
									}

									const isActive = filter.read === read;

									return (
										<Button
											key={read}
											variant="filter"
											isActive={isActive}
											role="tab"
											aria-selected={isActive}
											onClick={handleClick}
											data-tooltip={t(`notifications.readFilterTooltip.${read}`)}
										>
											{t(`notifications.readFilter.${read}`)}
											{read === 'unread' && inbox.unreadCount > 0 && <span className="filter-count">{inbox.unreadCount}</span>}
										</Button>
									);
								})}
							</div>
						</div>
						<div className="notifications-category-filters" role="group" aria-label={t('notifications.categoryFilterAriaLabel')}>
							{CATEGORY_FILTERS.map((category) => {
								function handleClick(): void {
									setFilter((current) => ({ ...current, category }));
								}

								return (
									<Button
										key={category}
										variant="filter"
										isActive={filter.category === category}
										onClick={handleClick}
										data-tooltip={t('notifications.categoryFilterTooltip', { category: t(`notifications.category.${category}`) })}
									>
										{t(`notifications.category.${category}`)}
									</Button>
								);
							})}
						</div>
					</div>
					<div className="notifications-inbox-list">
						{renderInbox()}
						{inbox.hasMore && <p className="notifications-inbox-more">{t('notifications.olderBeyondPage')}</p>}
					</div>
				</section>
			</aside>
		</div>
	);

	return (
		<>
			<IconButton className="notification-btn" label={buttonLabel} onClick={handleToggle} aria-expanded={isOpen} aria-haspopup="dialog">
				<Bell size={17} />
				{hasBadge && <span className={badgeClassName}>{formatBadgeCount(badgeCount)}</span>}
			</IconButton>
			{createPortal(drawer, document.body)}
		</>
	);
}

function formatBadgeCount(count: number): string {
	if (count > MAX_BADGE_COUNT) {
		return `${MAX_BADGE_COUNT}+`;
	}

	return String(count);
}
