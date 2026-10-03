import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/app/core/auth/useAuth';
import { useDismissableMenu } from '@/app/hooks/useDismissableMenu';

import { UserAvatar } from './UserAvatar';

import './AccountMenu.css';

export function AccountMenu(): ReactElement | null {
	const { t } = useTranslation();
	const { state, signOut } = useAuth();
	const [isOpen, setIsOpen] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const closeMenu = useCallback(() => setIsOpen(false), []);

	useDismissableMenu({ containerRef, isOpen, onDismiss: closeMenu });

	if (state.status !== 'signed-in') {
		return null;
	}

	const { user } = state;

	async function handleSignOut(): Promise<void> {
		setIsSigningOut(true);

		try {
			await signOut();
		} finally {
			setIsSigningOut(false);
		}
	}

	function handleToggleClick(): void {
		setIsOpen((current) => !current);
	}

	function handleSignOutClick(): void {
		void handleSignOut();
	}

	return (
		<div className="account-menu" ref={containerRef}>
			<button
				type="button"
				className={`account-trigger ${isOpen ? 'is-open' : ''}`.trim()}
				onClick={handleToggleClick}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-label={t('topbar.account.openLabel', { name: user.name })}
				data-tooltip={t('topbar.accountTooltip', { email: user.email })}
			>
				<UserAvatar name={user.name} email={user.email} size="small" />
				<span className="account-trigger-text">
					<span className="account-trigger-name">{user.name}</span>
					<span className="account-trigger-email">{user.email}</span>
				</span>
				<ChevronsUpDown size={14} className="account-trigger-chevron" aria-hidden="true" />
			</button>

			{isOpen && (
				<div className="account-dropdown" role="menu" aria-label={t('topbar.account.menuLabel')}>
					<div className="account-dropdown-identity">
						<UserAvatar name={user.name} email={user.email} size="large" />
						<span className="account-dropdown-text">
							<strong>{user.name}</strong>
							<small>{user.email}</small>
						</span>
					</div>
					<span className="account-dropdown-role">{t('topbar.account.role')}</span>
					<div className="account-dropdown-divider" />
					<button
						type="button"
						role="menuitem"
						className="account-dropdown-item is-danger"
						onClick={handleSignOutClick}
						disabled={isSigningOut}
						data-tooltip={t('topbar.signOutTooltip')}
					>
						<LogOut size={15} aria-hidden="true" />
						{isSigningOut ? t('topbar.account.signingOut') : t('topbar.signOut')}
					</button>
				</div>
			)}
		</div>
	);
}
