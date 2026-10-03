import type { ReactElement } from 'react';

import './Switch.css';

export type SwitchProps = {
	readonly isOn: boolean;
	readonly label: string;
	readonly onToggle: () => void;
	readonly isDisabled?: boolean;
	readonly tooltip?: string;
};

export function Switch({ isOn, label, onToggle, isDisabled = false, tooltip }: SwitchProps): ReactElement {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={isOn}
			aria-label={label}
			className={`switch ${isOn ? 'is-on' : ''}`}
			onClick={onToggle}
			disabled={isDisabled}
			data-tooltip={tooltip ?? label}
		>
			<span className="switch-thumb" aria-hidden="true" />
		</button>
	);
}
