import type { ReactElement } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';

import './MenuSkeleton.css';

export type MenuSkeletonProps = {
	readonly rowCount?: number;
};

const DEFAULT_ROW_COUNT = 3;

export function MenuSkeleton({ rowCount = DEFAULT_ROW_COUNT }: MenuSkeletonProps): ReactElement {
	return (
		<ul className="menu-skeleton" aria-hidden="true">
			{Array.from({ length: rowCount }, (_, index) => (
				<li className="menu-skeleton-row" key={index}>
					<Skeleton width="25px" height="25px" />
					<span>
						<Skeleton width="70%" height="12px" />
						<Skeleton width="45%" height="10px" />
					</span>
				</li>
			))}
		</ul>
	);
}
