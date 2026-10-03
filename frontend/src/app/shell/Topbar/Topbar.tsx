import { Menu } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useGateway } from '@/app/core/gateway/useGateway';
import { NotificationsDrawer } from '@/app/features/notifications/components/NotificationsDrawer/NotificationsDrawer';
import { IconButton } from '@/app/ui/IconButton/IconButton';

import { GlobalSearch } from '../GlobalSearch/GlobalSearch';
import { LiveIndicator } from '../LiveIndicator/LiveIndicator';

import './Topbar.css';

export function Topbar(): ReactElement {
	const { t } = useTranslation();
	const { setIsNavOpen } = useGateway();

	function handleOpenNav(): void {
		setIsNavOpen(true);
	}

	return (
		<header className="topbar">
			<IconButton className="menu-btn" onClick={handleOpenNav} label={t('topbar.openNav')}>
				<Menu size={18} />
			</IconButton>

			<GlobalSearch />

			<div className="topbar-spacer" />

			<LiveIndicator />

			<NotificationsDrawer />
		</header>
	);
}
