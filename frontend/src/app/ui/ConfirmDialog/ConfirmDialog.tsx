import { useEffect, type ReactElement, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ESCAPE_KEY } from '@/app/lib/keyboardKeys';

import { Button } from '../Button/Button';

import './ConfirmDialog.css';

export type ConfirmDialogTone = 'default' | 'danger';

export type ConfirmDialogProps = {
	readonly title: string;
	readonly message: ReactNode;
	readonly confirmLabel: string;
	readonly confirmTooltip: string;
	readonly tone?: ConfirmDialogTone;
	readonly isConfirming?: boolean;
	// Keeps the confirm button off until the caller is satisfied (a typed
	// confirmation, a required choice).
	readonly isConfirmDisabled?: boolean;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
};

// An overlay, not a relabeled button: the second click must be deliberate, away from where
// the first landed.
export function ConfirmDialog({
	title,
	message,
	confirmLabel,
	confirmTooltip,
	tone = 'default',
	isConfirming = false,
	isConfirmDisabled = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps): ReactElement {
	const { t } = useTranslation();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === ESCAPE_KEY) {
				onCancel();
			}
		}

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [onCancel]);

	// Only a click on the backdrop itself closes: one inside the dialog lands on another target.
	function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
		if (event.target !== event.currentTarget) {
			return;
		}

		onCancel();
	}

	return (
		<div className="confirm-dialog-backdrop" role="presentation" onClick={handleBackdropClick}>
			<div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
				<div id="confirm-dialog-title" className="confirm-dialog-title">
					{title}
				</div>
				<div className="confirm-dialog-message">{message}</div>
				<div className="confirm-dialog-actions">
					<Button variant="secondary" onClick={onCancel} disabled={isConfirming} data-tooltip={t('common.cancelTooltip')}>
						{t('common.cancel')}
					</Button>
					<Button
						variant={tone === 'danger' ? 'danger' : 'primary'}
						onClick={onConfirm}
						isPending={isConfirming}
						disabled={isConfirmDisabled}
						data-tooltip={confirmTooltip}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
