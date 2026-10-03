import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

import './Button.css';

export type ButtonVariant =
	'default' | 'primary' | 'danger' | 'secondary' | 'pill' | 'filter' | 'row-action' | 'nav-item' | 'toast' | 'scope-option' | 'table-heading';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	readonly variant?: ButtonVariant;
	readonly isSmall?: boolean;
	// Only for variant="pill".
	readonly isActive?: boolean;
	// Shown before the label; a pending button swaps it for the spinner.
	readonly icon?: ReactNode;
	// The action is running: disabled, aria-busy, and a spinner in place of the icon (or over
	// the label, without one). The button keeps its width either way.
	readonly isPending?: boolean;
};

const SPINNER_SIZE_PX = 14;

type LabelSlotProps = {
	readonly isPending: boolean;
	readonly isSpinnerOverLabel: boolean;
	readonly children: ReactNode;
};

export function Button({
	children,
	variant = 'default',
	isSmall = false,
	isActive = false,
	icon,
	isPending = false,
	disabled = false,
	className = '',
	type = 'button',
	...props
}: ButtonProps): ReactElement {
	const variantClassName = variant === 'default' ? '' : `btn-${variant}`;
	const sizeClassName = isSmall ? 'btn-sm' : '';
	const activeClassName = isActive ? 'is-on' : '';
	const pendingClassName = isPending ? 'is-pending' : '';
	const classNames = `btn ${variantClassName} ${sizeClassName} ${activeClassName} ${pendingClassName} ${className}`;
	const buttonClassName = classNames.replace(/\s+/g, ' ').trim();
	const isDisabled = disabled || isPending;
	const hasIcon = icon !== undefined && icon !== null;

	return (
		<button type={type} className={buttonClassName} disabled={isDisabled} aria-busy={isPending || undefined} {...props}>
			{hasIcon && <IconSlot icon={icon} isPending={isPending} />}
			<LabelSlot isPending={isPending} isSpinnerOverLabel={!hasIcon}>
				{children}
			</LabelSlot>
		</button>
	);
}

function Spinner(): ReactElement {
	return <LoaderCircle className="btn-spinner" size={SPINNER_SIZE_PX} aria-hidden="true" />;
}

// The icon stays in place, hidden, so the slot keeps its width under the spinner.
function IconSlot({ icon, isPending }: { readonly icon: ReactNode; readonly isPending: boolean }): ReactElement {
	return (
		<span className="btn-icon-slot">
			{icon}
			{isPending && <Spinner />}
		</span>
	);
}

// Without an icon the label hides (still laid out, so the width holds) under a centered spinner.
// Idle, the children render bare, so variant selectors on direct children keep matching.
function LabelSlot({ isPending, isSpinnerOverLabel, children }: LabelSlotProps): ReactNode {
	const shouldCoverLabel = isPending && isSpinnerOverLabel;

	if (!shouldCoverLabel) {
		return children;
	}

	return (
		<>
			<span className="btn-pending-label">{children}</span>
			<span className="btn-pending-overlay">
				<Spinner />
			</span>
		</>
	);
}
