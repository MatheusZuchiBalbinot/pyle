import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { HttpMethodName } from '@/app/api/adminApiTypes';
import { Button } from '@/app/ui/Button/Button';

import './RouteMethodsPicker.css';

const HTTP_METHODS: readonly HttpMethodName[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export type RouteMethodsPickerProps = {
	// Empty: every method.
	readonly value: readonly HttpMethodName[];
	readonly onChange: (methods: readonly HttpMethodName[]) => void;
};

type MethodChipProps = { readonly method: HttpMethodName; readonly isOn: boolean; readonly onToggle: (method: HttpMethodName) => void };

export function RouteMethodsPicker({ value, onChange }: RouteMethodsPickerProps): ReactElement {
	const { t } = useTranslation();

	function handleToggle(method: HttpMethodName): void {
		const isOn = value.includes(method);
		const next = isOn
			? value.filter((candidate) => candidate !== method)
			: HTTP_METHODS.filter((candidate) => candidate === method || value.includes(candidate));

		onChange(next);
	}

	return (
		<div className="route-methods" role="group" aria-label={t('routes.form.methods')}>
			{HTTP_METHODS.map((method) => (
				<MethodChip key={method} method={method} isOn={value.includes(method)} onToggle={handleToggle} />
			))}
		</div>
	);
}

function MethodChip({ method, isOn, onToggle }: MethodChipProps): ReactElement {
	const { t } = useTranslation();

	function handleClick(): void {
		onToggle(method);
	}

	return (
		<Button
			type="button"
			variant="pill"
			isSmall
			isActive={isOn}
			aria-pressed={isOn}
			onClick={handleClick}
			data-tooltip={t('routes.form.methodTooltip', { method })}
		>
			<span className="mono">{method}</span>
		</Button>
	);
}
