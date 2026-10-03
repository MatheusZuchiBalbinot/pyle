import type { ReactElement } from 'react';

import { DashboardCard, type DashboardCardSpan } from '../DashboardCard/DashboardCard';
import type { DataTableColumn } from '../DataTable/DataTable';
import { DataTableSkeleton } from '../DataTable/DataTableSkeleton';
import { LineChartSkeleton } from '../LineChart/LineChartSkeleton';
import { StackedBarListSkeleton } from '../StackedBarList/StackedBarListSkeleton';
import { StatusIntroSkeleton } from '../StatusIntro/StatusIntroSkeleton';

// One entry per card, in order, so the skeleton grid is the loaded grid blanked out.
export type DashboardSkeletonCard =
	| (DashboardSkeletonCardBase & { readonly content: 'line-chart' })
	// rowCount: when known before the data arrives, so the placeholder is as tall as the
	// list.
	| (DashboardSkeletonCardBase & { readonly content: 'bar-list'; readonly rowCount?: number; readonly legendItemCount?: number })
	| (DashboardSkeletonCardBase & {
			readonly content: 'table';
			readonly columns: readonly DataTableColumn<never>[];
			readonly rowCount?: number;
			readonly hasTwoLineLeadCell?: boolean;
	  });

export type DashboardHeroSkeletonProps = {
	readonly pageName: string;
	readonly hasBannerFooter?: boolean;
};

export type DashboardSkeletonProps = DashboardHeroSkeletonProps & {
	readonly cards: readonly DashboardSkeletonCard[];
};

type DashboardSkeletonCardBase = {
	// Same `name`/`span`/`title` as the DashboardCard it stands in for.
	readonly name: string;
	readonly title: string;
	readonly span: DashboardCardSpan;
};

const HERO_TILE_COUNT = 3;

// For a page whose grid is not a DashboardCard grid (Settings).
export function DashboardHeroSkeleton({ pageName, hasBannerFooter = false }: DashboardHeroSkeletonProps): ReactElement {
	return (
		<section className="dashboard-hero" data-section={`${pageName}-hero-skeleton`} aria-busy="true">
			<div className="dashboard-span-3" data-card={`${pageName}-hero-banner`}>
				<StatusIntroSkeleton name={`${pageName}-hero-intro`} layout="banner" hasFooter={hasBannerFooter} />
			</div>
			{Array.from({ length: HERO_TILE_COUNT }, (_, index) => (
				<StatusIntroSkeleton key={index} name={`${pageName}-hero-tile-${index + 1}`} layout="tile" />
			))}
		</section>
	);
}

export function DashboardSkeleton({ pageName, hasBannerFooter, cards }: DashboardSkeletonProps): ReactElement {
	return (
		<>
			<DashboardHeroSkeleton pageName={pageName} hasBannerFooter={hasBannerFooter} />
			<section className="dashboard-grid" data-section={`${pageName}-grid-skeleton`} aria-busy="true">
				{cards.map((card) => renderSkeletonCard(card))}
			</section>
		</>
	);
}

function renderSkeletonCard(card: DashboardSkeletonCard): ReactElement {
	const content = card.content === 'table' ? 'table' : 'chart';

	return (
		<DashboardCard key={card.name} name={card.name} span={card.span} title={card.title} content={content}>
			{renderCardBody(card)}
		</DashboardCard>
	);
}

function assertUnreachable(value: never): never {
	throw new Error(`Unhandled skeleton card: ${JSON.stringify(value)}`);
}

function renderCardBody(card: DashboardSkeletonCard): ReactElement {
	switch (card.content) {
		case 'line-chart':
			return <LineChartSkeleton />;
		case 'bar-list':
			return <StackedBarListSkeleton rowCount={card.rowCount} legendItemCount={card.legendItemCount} />;
		case 'table':
			return <DataTableSkeleton columns={card.columns} rowCount={card.rowCount} hasTwoLineLeadCell={card.hasTwoLineLeadCell} />;
		default:
			return assertUnreachable(card);
	}
}
