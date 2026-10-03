import type { ReactElement } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';

import './StackedBarList.css';

export type StackedBarListSkeletonProps = {
	readonly rowCount?: number;
	// StackedBarList renders a legend only when there are ≥2 segments; pass
	// the segment count so the placeholder reserves that row too.
	readonly legendItemCount?: number;
};

const DEFAULT_ROW_COUNT = 3;
// A caller may know the count is 0 (no traffic yet); still draw one
// row so the card doesn't collapse to just its header.
const MIN_ROW_COUNT = 1;
// Alternate widths so the placeholder bars read as "different rows",
// not a uniform block.
const TRACK_WIDTHS = ['82%', '46%', '63%', '30%'] as const;
const MIN_LEGEND_ITEM_COUNT = 2;

export function StackedBarListSkeleton({ rowCount = DEFAULT_ROW_COUNT, legendItemCount = 0 }: StackedBarListSkeletonProps): ReactElement {
	const visibleRowCount = Math.max(rowCount, MIN_ROW_COUNT);
	const hasLegend = legendItemCount >= MIN_LEGEND_ITEM_COUNT;

	return (
		<div className="stacked-bar-list" aria-busy="true">
			{Array.from({ length: visibleRowCount }, (_, index) => (
				<div key={index} className="stacked-bar-row">
					<span className="stacked-bar-label">
						<Skeleton width="60%" height="12px" />
					</span>
					<span className="stacked-bar-track">
						<Skeleton width={TRACK_WIDTHS[index % TRACK_WIDTHS.length]} height="14px" />
					</span>
					<span className="stacked-bar-total">
						<Skeleton width="52px" height="11px" />
					</span>
				</div>
			))}
			{hasLegend && (
				<div className="stacked-bar-legend">
					{Array.from({ length: legendItemCount }, (_, index) => (
						<span key={index} className="stacked-bar-legend-item">
							<Skeleton width="10px" height="10px" />
							<Skeleton width="48px" height="11px" />
						</span>
					))}
				</div>
			)}
		</div>
	);
}
