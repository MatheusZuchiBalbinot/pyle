import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { StatusBreakdown } from '@/app/api/adminApiTypes';
import { formatCompactCount } from '@/app/lib/formatTraffic';

import './TrafficStatusBreakdown.css';

export type TrafficStatusBreakdownProps = { readonly breakdown: StatusBreakdown };

type Row = { readonly key: keyof StatusBreakdown; readonly labelKey: string; readonly tone: string };

type BreakdownRowProps = { readonly row: Row; readonly value: number; readonly total: number };

const PERCENT = 100;

const ROWS: readonly Row[] = [
	{ key: 'status2xx', labelKey: 'traffic.status.status2xx', tone: 'is-success' },
	{ key: 'status3xx', labelKey: 'traffic.status.status3xx', tone: 'is-info' },
	{ key: 'status4xx', labelKey: 'traffic.status.status4xx', tone: 'is-warning' },
	{ key: 'status5xx', labelKey: 'traffic.status.status5xx', tone: 'is-danger' },
	{ key: 'rateLimited', labelKey: 'traffic.status.rateLimited', tone: 'is-warning' },
	{ key: 'gatewayErrors', labelKey: 'traffic.status.gatewayErrors', tone: 'is-danger' },
];

// The gateway's own answers (429 and 502/503/504) are part of 4xx and 5xx.
export function TrafficStatusBreakdown({ breakdown }: TrafficStatusBreakdownProps): ReactElement {
	const total = breakdown.status2xx + breakdown.status3xx + breakdown.status4xx + breakdown.status5xx;

	return (
		<dl className="status-breakdown">
			{ROWS.map((row) => (
				<BreakdownRow key={row.key} row={row} value={breakdown[row.key]} total={total} />
			))}
		</dl>
	);
}

function BreakdownRow({ row, value, total }: BreakdownRowProps): ReactElement {
	const { t } = useTranslation();
	const widthPercent = total === 0 ? 0 : (value / total) * PERCENT;

	return (
		<div className={`status-breakdown-row ${row.tone}`}>
			<dt>{t(row.labelKey)}</dt>
			<dd>
				<span className="status-breakdown-bar" aria-hidden="true">
					<span style={{ width: `${widthPercent}%` }} />
				</span>
				<span className="status-breakdown-value">{formatCompactCount(value)}</span>
			</dd>
		</div>
	);
}
