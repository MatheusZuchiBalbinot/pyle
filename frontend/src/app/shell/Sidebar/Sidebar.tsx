import { useQueryClient } from '@tanstack/react-query';
import { Activity, Bot, Gauge, KeyRound, Route, Server, Settings, Sparkles, X, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useGateway } from '@/app/core/gateway/useGateway';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';
import { PyleLogo } from '@/app/ui/PyleLogo/PyleLogo';

import { AccountMenu } from '../AccountMenu/AccountMenu';
import { prefetchPage } from '../lib/pagePrefetch';
import { NAV_GROUPS, type NavIconName, type PageId } from './navItems';

import './Sidebar.css';

const ICONS: Readonly<Record<NavIconName, LucideIcon>> = {
	gauge: Gauge,
	activity: Activity,
	route: Route,
	server: Server,
	'key-round': KeyRound,
	bot: Bot,
	sparkles: Sparkles,
	settings: Settings,
};

export type SidebarCounts = Readonly<Partial<Record<PageId, number | null | undefined>>>;

type SidebarProps = {
	readonly counts: SidebarCounts;
};

export function Sidebar({ counts }: SidebarProps): ReactElement {
	const { t } = useTranslation();
	const { activePage, navigate, setIsNavOpen } = useGateway();
	const queryClient = useQueryClient();

	function handleCloseClick(): void {
		setIsNavOpen(false);
	}

	return (
		<aside className="sidebar" aria-label={t('sidebar.ariaLabel')}>
			<div className="sidebar-brand">
				<IconButton className="sidebar-close" onClick={handleCloseClick} label={t('sidebar.closeNav')}>
					<X size={16} aria-hidden="true" />
				</IconButton>
				<PyleLogo className="brand-mark" />
				<div>
					<div className="brand-name">Pyle</div>
					<div className="brand-sub">{t('sidebar.brandSubtitle')}</div>
				</div>
			</div>

			<nav className="sidebar-nav">
				{NAV_GROUPS.map((group) => (
					<div className="nav-group" key={group.labelKey}>
						<div className="nav-group-label">{t(group.labelKey)}</div>
						{group.items.map((item) => {
							const Icon = ICONS[item.icon];
							const count = counts[item.id];

							const isActive = activePage === item.id;

							function handleClick(): void {
								navigate(item.id);
							}

							// Intent, not the click: by the time it lands, the data is usually in.
							function handleIntent(): void {
								prefetchPage(queryClient, item.id);
							}

							return (
								<Button
									key={item.id}
									variant="nav-item"
									isActive={isActive}
									onClick={handleClick}
									onPointerEnter={handleIntent}
									onFocus={handleIntent}
									aria-current={isActive ? 'page' : undefined}
									data-tooltip={t('sidebar.navigateTooltip', { page: t(item.labelKey) })}
								>
									<Icon size={16} aria-hidden="true" />
									<span className="nav-label">{t(item.labelKey)}</span>
									{count != null && <span className="nav-count">{count}</span>}
								</Button>
							);
						})}
					</div>
				))}
			</nav>

			<div className="sidebar-footer">
				<AccountMenu />
			</div>
		</aside>
	);
}
