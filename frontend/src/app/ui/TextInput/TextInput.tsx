import type { ComponentProps, ReactElement, ReactNode } from 'react';

import './TextInput.css';

export type TextInputProps = ComponentProps<'input'> & {
	readonly label: string;
	// Compact inputs show the label to screen readers only; form fields show it.
	readonly isLabelVisible?: boolean;
	readonly icon?: ReactNode;
	readonly suffix?: ReactNode;
};

export function TextInput({ label, isLabelVisible = false, icon, suffix, className = '', ...props }: TextInputProps): ReactElement {
	return (
		<label className={`text-input ${isLabelVisible ? 'has-visible-label' : ''} ${className}`.trim()}>
			<span className={isLabelVisible ? 'field-label' : 'sr-only'}>{label}</span>
			{icon && (
				<span className="text-input-icon" aria-hidden="true">
					{icon}
				</span>
			)}
			<input aria-label={label} {...props} />
			{suffix && <span className="text-input-suffix">{suffix}</span>}
		</label>
	);
}
