import type { ReactElement } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';
import type { DataTableColumn } from './DataTable';

import './DataTable.css';

const DEFAULT_SKELETON_ROW_COUNT = 4;
const MIN_SKELETON_ROW_COUNT = 1;

export type DataTableSkeletonProps<Row> = {
	readonly columns: readonly DataTableColumn<Row>[];
	readonly rowCount?: number;
	// True for tables whose first cell is a name with a sub line under it
	// (name + slug) — that two-line cell sets the row height.
	readonly hasTwoLineLeadCell?: boolean;
};

// Same shell as DataTable, so headers and widths stay put while rows load.
export function DataTableSkeleton<Row>({
	columns,
	rowCount = DEFAULT_SKELETON_ROW_COUNT,
	hasTwoLineLeadCell = false,
}: DataTableSkeletonProps<Row>): ReactElement {
	const visibleRowCount = Math.max(rowCount, MIN_SKELETON_ROW_COUNT);

	return (
		<div className="table-wrap table-shell">
			<table className="tbl data-table">
				<thead>
					<tr>
						{columns.map((column) => (
							<th key={column.key} className={column.isNumeric ? 'num' : ''}>
								<span className="table-heading">
									<span>{column.label}</span>
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{Array.from({ length: visibleRowCount }, (_, rowIndex) => (
						<tr key={rowIndex}>
							{columns.map((column, columnIndex) => (
								<td key={column.key} className={column.isNumeric ? 'num' : ''}>
									{columnIndex === 0 && hasTwoLineLeadCell ? (
										<TwoLineCellSkeleton />
									) : (
										<Skeleton width={column.isNumeric ? '60px' : '70%'} height="13px" />
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TwoLineCellSkeleton(): ReactElement {
	return (
		<span className="stack">
			<span className="cell-strong">
				<Skeleton width="110px" height="13px" />
			</span>
			<span className="cell-sub">
				<Skeleton width="70px" height="10px" />
			</span>
		</span>
	);
}
