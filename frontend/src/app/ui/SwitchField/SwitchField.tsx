import type { ReactElement } from 'react';

import { Switch } from '../Switch/Switch';

import './SwitchField.css';

export type SwitchFieldProps = {
	readonly isOn: boolean;
	readonly label: string;
	readonly hint: string;
	readonly onToggle: () => void;
};

// A <label>, so clicking the text toggles too: the browser forwards the click to the switch.
export function SwitchField({ isOn, label, hint, onToggle }: SwitchFieldProps): ReactElement {
	return (
		<label className="switch-field">
			<Switch isOn={isOn} label={label} onToggle={onToggle} tooltip={hint} />
			<span className="switch-field-text">
				<span className="switch-field-label">{label}</span>
				<span className="switch-field-hint">{hint}</span>
			</span>
		</label>
	);
}
