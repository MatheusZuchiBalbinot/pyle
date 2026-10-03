import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Route } from '@/app/api/adminApiTypes';
import { SwitchField } from '@/app/ui/SwitchField/SwitchField';

import './ConsumerRoutesPicker.css';

export type ConsumerRoutesPickerProps = {
	readonly routes: readonly Route[];
	// Empty: every route, including ones created later.
	readonly value: readonly string[];
	readonly onChange: (routeIds: readonly string[]) => void;
};

type RouteOptionProps = { readonly route: Route; readonly isChecked: boolean; readonly onToggle: (routeId: string) => void };

export function ConsumerRoutesPicker({ routes, value, onChange }: ConsumerRoutesPickerProps): ReactElement {
	const { t } = useTranslation();
	const isAll = value.length === 0;

	function handleToggleAll(): void {
		onChange(isAll ? routes.map((route) => route.id) : []);
	}

	function handleToggleRoute(routeId: string): void {
		const next = value.includes(routeId) ? value.filter((id) => id !== routeId) : [...value, routeId];

		// Unchecking the last one would silently mean "all": keep one.
		if (next.length === 0) {
			return;
		}

		onChange(next);
	}

	return (
		<div className="routes-picker">
			<SwitchField isOn={isAll} label={t('consumers.routes.all')} hint={t('consumers.routes.allHint')} onToggle={handleToggleAll} />
			{!isAll && (
				<div className="routes-picker-list" role="group" aria-label={t('consumers.routes.listLabel')}>
					{routes.map((route) => (
						<RouteOption key={route.id} route={route} isChecked={value.includes(route.id)} onToggle={handleToggleRoute} />
					))}
				</div>
			)}
		</div>
	);
}

function RouteOption({ route, isChecked, onToggle }: RouteOptionProps): ReactElement {
	function handleChange(): void {
		onToggle(route.id);
	}

	return (
		<label className="routes-picker-option">
			<input type="checkbox" checked={isChecked} onChange={handleChange} />
			<span>{route.name}</span>
			<span className="mono routes-picker-prefix">{route.pathPrefix}</span>
		</label>
	);
}
