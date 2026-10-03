import { useEffect, type FormEvent, type ReactElement, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ESCAPE_KEY } from '@/app/lib/keyboardKeys';

import { Button } from '../Button/Button';

import '../ConfirmDialog/ConfirmDialog.css';
import './FormDialog.css';

export type FormDialogProps = {
	readonly title: string;
	readonly description?: string;
	readonly submitLabel: string;
	readonly submitTooltip: string;
	readonly isSubmitting: boolean;
	// A failure that belongs to no single field.
	readonly errorMessage: string | null;
	readonly onSubmit: () => void;
	readonly onCancel: () => void;
	readonly children: ReactNode;
};

export function FormDialog({
	title,
	description,
	submitLabel,
	submitTooltip,
	isSubmitting,
	errorMessage,
	onSubmit,
	onCancel,
	children,
}: FormDialogProps): ReactElement {
	const { t } = useTranslation();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent): void {
			if (event.key === ESCAPE_KEY) {
				onCancel();
			}
		}

		document.addEventListener('keydown', handleKeyDown);

		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [onCancel]);

	function handleSubmit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		onSubmit();
	}

	// Only a click on the backdrop itself closes: one inside the dialog lands on another target.
	function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
		if (event.target !== event.currentTarget) {
			return;
		}

		onCancel();
	}

	return (
		<div className="confirm-dialog-backdrop" role="presentation" onClick={handleBackdropClick}>
			<form
				className="confirm-dialog form-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="form-dialog-title"
				onSubmit={handleSubmit}
				noValidate
			>
				<div id="form-dialog-title" className="confirm-dialog-title">
					{title}
				</div>
				{description && <div className="confirm-dialog-message">{description}</div>}
				<div className="form-dialog-body">{children}</div>
				{errorMessage !== null && (
					<div className="form-dialog-error" role="alert">
						{errorMessage}
					</div>
				)}
				<div className="confirm-dialog-actions">
					<Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting} data-tooltip={t('common.cancelTooltip')}>
						{t('common.cancel')}
					</Button>
					<Button type="submit" variant="primary" isPending={isSubmitting} data-tooltip={submitTooltip}>
						{submitLabel}
					</Button>
				</div>
			</form>
		</div>
	);
}
