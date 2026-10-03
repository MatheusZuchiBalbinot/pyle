import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../Button/Button';

import './LoadMoreFooter.css';

export type LoadMoreFooterProps = {
	readonly loadedCount: number;
	readonly hasMore: boolean;
	readonly isLoadingMore: boolean;
	readonly onLoadMore: () => void;
};

// Always says how many rows are on screen: a list silently stopping at a page boundary
// looks broken.
export function LoadMoreFooter({ loadedCount, hasMore, isLoadingMore, onLoadMore }: LoadMoreFooterProps): ReactElement | null {
	const { t } = useTranslation();

	if (loadedCount === 0) {
		return null;
	}

	const countLabel = hasMore ? t('pagination.showing', { count: loadedCount }) : t('pagination.showingAll', { count: loadedCount });

	return (
		<div className={`load-more-footer ${hasMore ? '' : 'is-complete'}`.trim()}>
			<span className="load-more-count">
				<strong>{loadedCount}</strong>
				{countLabel}
			</span>
			{hasMore && (
				<Button variant="pill" onClick={onLoadMore} disabled={isLoadingMore} data-tooltip={t('pagination.loadMoreTooltip')}>
					<ChevronDown size={13} aria-hidden="true" />
					{isLoadingMore ? t('pagination.loading') : t('pagination.loadMore')}
				</Button>
			)}
		</div>
	);
}
