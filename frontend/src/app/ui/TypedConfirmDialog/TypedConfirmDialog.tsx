import { useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { TextInput } from '../TextInput/TextInput';

import './TypedConfirmDialog.css';

export type TypedConfirmDialogProps = {
	readonly title: string;
	readonly message: ReactNode;
	// What the operator must type (a prefix, a slug, an instance name).
	readonly expected: string;
	readonly confirmLabel: string;
	readonly confirmTooltip: string;
	readonly isConfirming: boolean;
	// Shown under the field when the action failed (a 409, a network error).
	readonly errorMessage: string | null;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
};

// A second click alone is too easy to give on the wrong row.
export function TypedConfirmDialog({
	title,
	message,
	expected,
	confirmLabel,
	confirmTooltip,
	isConfirming,
	errorMessage,
	onConfirm,
	onCancel,
}: TypedConfirmDialogProps): ReactElement {
	const { t } = useTranslation();
	const [typed, setTyped] = useState('');
	const isMatch = typed.trim() === expected;

	function handleChange(event: ChangeEvent<HTMLInputElement>): void {
		setTyped(event.target.value);
	}

	const body = (
		<div className="typed-confirm">
			<div>{message}</div>
			<TextInput
				label={t('common.typeToConfirm', { value: expected })}
				isLabelVisible
				value={typed}
				onChange={handleChange}
				placeholder={expected}
				autoFocus
				autoComplete="off"
				spellCheck={false}
				className="typed-confirm-input mono"
			/>
			{errorMessage !== null && (
				<div className="typed-confirm-error" role="alert">
					{errorMessage}
				</div>
			)}
		</div>
	);

	return (
		<ConfirmDialog
			title={title}
			message={body}
			confirmLabel={confirmLabel}
			confirmTooltip={confirmTooltip}
			tone="danger"
			isConfirming={isConfirming}
			isConfirmDisabled={!isMatch}
			onConfirm={onConfirm}
			onCancel={onCancel}
		/>
	);
}
