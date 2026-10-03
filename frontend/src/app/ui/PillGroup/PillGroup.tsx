import type { ReactElement } from 'react';

import { Button } from '../Button/Button';

import './PillGroup.css';

export type PillOption<Value extends string> = {
	readonly value: Value;
	readonly label: string;
	readonly tooltip: string;
};

export type PillGroupProps<Value extends string> = {
	readonly options: readonly PillOption<Value>[];
	readonly value: Value;
	readonly onChange: (value: Value) => void;
	readonly ariaLabel: string;
};

type PillProps<Value extends string> = {
	readonly option: PillOption<Value>;
	readonly isActive: boolean;
	readonly onSelect: (value: Value) => void;
};

export function PillGroup<Value extends string>({ options, value, onChange, ariaLabel }: PillGroupProps<Value>): ReactElement {
	return (
		<span className="pill-group" role="group" aria-label={ariaLabel}>
			{options.map((option) => (
				<Pill key={option.value} option={option} isActive={option.value === value} onSelect={onChange} />
			))}
		</span>
	);
}

function Pill<Value extends string>({ option, isActive, onSelect }: PillProps<Value>): ReactElement {
	function handleClick(): void {
		onSelect(option.value);
	}

	return (
		<Button variant="pill" isSmall isActive={isActive} onClick={handleClick} data-tooltip={option.tooltip} aria-pressed={isActive}>
			{option.label}
		</Button>
	);
}
