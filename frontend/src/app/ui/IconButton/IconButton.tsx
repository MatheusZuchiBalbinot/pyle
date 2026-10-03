import type { ButtonHTMLAttributes, ReactElement } from 'react';

import './IconButton.css';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	readonly label: string;
};

export function IconButton({ label, children, className = '', ...props }: IconButtonProps): ReactElement {
	return (
		<button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} data-tooltip={label} {...props}>
			{children}
		</button>
	);
}
