import { ChevronDown, ChevronUp } from 'lucide-react';
import {
	useEffect,
	useMemo,
	useState,
	type ReactElement,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../Button/Button';

import './DataTable.css';

export type DataTableColumn<Row> = {
	readonly key: string;
	readonly label: string;
	readonly isNumeric?: boolean;
	readonly isSortable?: boolean;
	// Comparable value for sorting — required when isSortable is true, since
	// `cell` may render JSX that can't be compared directly.
	readonly sortValue?: (row: Row) => string | number;
	readonly cell: (row: Row) => ReactNode;
};

export type DataTableProps<Row> = {
	readonly columns: readonly DataTableColumn<Row>[];
	readonly rows: readonly Row[];
	readonly rowKey: (row: Row) => string;
	readonly empty?: string;
	readonly onRowClick?: (row: Row) => void;
	readonly selectedRowKey?: string;
};

type SortDirection = 'asc' | 'desc';
type SortState = { readonly key: string; readonly direction: SortDirection } | null;
type ResizeState = { readonly key: string; readonly startX: number; readonly startWidth: number };

const MIN_COLUMN_WIDTH_PX = 80;
// The keyboard path of a resize handle: arrow keys widen or narrow by this much.
const KEYBOARD_RESIZE_STEP_PX = 16;
const RESIZE_DIRECTION_BY_KEY: Readonly<Partial<Record<string, number>>> = { ArrowLeft: -1, ArrowRight: 1 };

export function DataTable<Row>({ columns, rows, rowKey, empty, onRowClick, selectedRowKey }: DataTableProps<Row>): ReactElement {
	const { t } = useTranslation();
	const emptyLabel = empty ?? t('dataTable.empty');
	const [sortState, setSortState] = useState<SortState>(null);
	const [columnWidths, setColumnWidths] = useState<Readonly<Record<string, number>>>({});
	// In state, so the effect owns the listeners and removes them even if the table
	// unmounts mid-drag.
	const [resizeState, setResizeState] = useState<ResizeState | null>(null);

	const sortedRows = useMemo(() => sortRows(rows, columns, sortState), [rows, columns, sortState]);

	useEffect(() => {
		if (!resizeState) {
			return;
		}

		const activeResize = resizeState;
		// One update per frame: a raw mousemove re-rendered every cell on each pixel.
		let pendingFrame: number | null = null;
		let pendingWidth: number | null = null;

		function applyPendingWidth(): void {
			pendingFrame = null;

			if (pendingWidth === null) {
				return;
			}

			const nextWidth = pendingWidth;

			setColumnWidths((current) => ({ ...current, [activeResize.key]: nextWidth }));
		}

		function handleMouseMove(moveEvent: MouseEvent): void {
			pendingWidth = Math.max(MIN_COLUMN_WIDTH_PX, activeResize.startWidth + (moveEvent.clientX - activeResize.startX));
			pendingFrame ??= window.requestAnimationFrame(applyPendingWidth);
		}

		function handleMouseUp(): void {
			setResizeState(null);
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			if (pendingFrame !== null) {
				window.cancelAnimationFrame(pendingFrame);
			}

			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [resizeState]);

	function startColumnResize(columnKey: string, startWidth: number, event: ReactMouseEvent<HTMLSpanElement>): void {
		setResizeState({ key: columnKey, startX: event.clientX, startWidth });
	}

	return (
		<div className="table-wrap table-shell">
			<table className="tbl data-table">
				<thead>
					<tr>
						{columns.map((column, index) => {
							const isSorted = sortState?.key === column.key;
							const isSortedDescending = isSorted && sortState.direction === 'desc';
							const width = columnWidths[column.key];
							const isLastColumn = index === columns.length - 1;

							function handleHeadingClick(): void {
								setSortState((current) => nextSortState(current, column.key));
							}

							function handleResizeMouseDown(event: ReactMouseEvent<HTMLSpanElement>): void {
								event.preventDefault();
								const thElement = event.currentTarget.closest('th');
								const startWidth = width ?? thElement?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH_PX;

								startColumnResize(column.key, startWidth, event);
							}

							function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>): void {
								const direction = RESIZE_DIRECTION_BY_KEY[event.key];

								if (direction === undefined) {
									return;
								}

								event.preventDefault();
								const thElement = event.currentTarget.closest('th');
								const currentWidth = width ?? thElement?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH_PX;
								const nextWidth = Math.max(MIN_COLUMN_WIDTH_PX, currentWidth + direction * KEYBOARD_RESIZE_STEP_PX);

								setColumnWidths((current) => ({ ...current, [column.key]: nextWidth }));
							}

							return (
								<th key={column.key} className={column.isNumeric ? 'num' : ''} style={width ? { width } : undefined}>
									{column.isSortable ? (
										<Button
											variant="table-heading"
											className="table-heading is-sortable"
											aria-pressed={isSorted}
											onClick={handleHeadingClick}
											data-tooltip={t('dataTable.sortByColumn', { column: column.label })}
										>
											<span>{column.label}</span>
											<span className={`sort-indicator ${isSorted ? 'active' : ''}`}>
												{isSortedDescending ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
											</span>
										</Button>
									) : (
										<span className="table-heading">
											<span>{column.label}</span>
										</span>
									)}
									{!isLastColumn && (
										<span
											className="column-resize"
											onMouseDown={handleResizeMouseDown}
											onKeyDown={handleResizeKeyDown}
											tabIndex={0}
											aria-label={t('dataTable.resizeColumnOf', { column: column.label })}
											aria-valuemin={MIN_COLUMN_WIDTH_PX}
											aria-valuenow={width}
											data-tooltip={t('dataTable.resizeColumn')}
											role="separator"
											aria-orientation="vertical"
										/>
									)}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{sortedRows.map((row) => {
						const key = rowKey(row);
						const isSelected = selectedRowKey !== undefined && key === selectedRowKey;
						const rowClassName = `${onRowClick ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`.trim();

						function handleRowClick(): void {
							onRowClick?.(row);
						}

						return (
							<tr
								key={key}
								className={rowClassName || undefined}
								onClick={onRowClick ? handleRowClick : undefined}
								aria-selected={onRowClick ? isSelected : undefined}
							>
								{columns.map((column) => (
									<td key={column.key} className={column.isNumeric ? 'num' : ''}>
										{column.cell(row)}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
			{!rows.length && <div className="table-empty">{emptyLabel}</div>}
		</div>
	);
}

function compareSortValues(a: string | number, b: string | number): number {
	if (typeof a === 'number' && typeof b === 'number') {
		return a - b;
	}

	return String(a).localeCompare(String(b));
}

function sortRows<Row>(rows: readonly Row[], columns: readonly DataTableColumn<Row>[], sortState: SortState): readonly Row[] {
	if (!sortState) {
		return rows;
	}

	const column = columns.find((candidate) => candidate.key === sortState.key);
	const sortValue = column?.sortValue;

	if (!sortValue) {
		return rows;
	}

	const sorted = [...rows].sort((rowA, rowB) => compareSortValues(sortValue(rowA), sortValue(rowB)));

	return sortState.direction === 'asc' ? sorted : sorted.reverse();
}

function nextSortState(current: SortState, key: string): SortState {
	if (current?.key !== key) {
		return { key, direction: 'asc' };
	}

	if (current.direction === 'asc') {
		return { key, direction: 'desc' };
	}

	return null;
}
