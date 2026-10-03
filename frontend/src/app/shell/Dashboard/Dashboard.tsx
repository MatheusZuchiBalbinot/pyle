import { Activity, lazy, Suspense, type LazyExoticComponent, type ReactElement } from 'react';

import { GatewayProvider } from '@/app/core/gateway/GatewayProvider';
import { useGateway } from '@/app/core/gateway/useGateway';
import { RealtimeProvider } from '@/app/core/realtime/RealtimeProvider';
import { useRealtimeReactions } from '@/app/features/notifications/hooks/useRealtimeReactions';
import { DashboardSkeleton, type DashboardSkeletonCard } from '@/app/ui/DashboardSkeleton/DashboardSkeleton';

import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMountedPages } from '../hooks/useMountedPages';
import { usePageArrival } from '../hooks/usePageArrival';
import type { PageId } from '../Sidebar/navItems';
import { Sidebar, type SidebarCounts } from '../Sidebar/Sidebar';
import { TooltipLayer } from '../TooltipLayer/TooltipLayer';
import { Topbar } from '../Topbar/Topbar';
import { Toasts } from './Toasts';

import './Dashboard.css';
import './PageTransition.css';

// Each page is its own chunk, fetched on first visit.
const PAGES: Readonly<Record<PageId, LazyExoticComponent<() => ReactElement>>> = {
	overview: lazy(() => import('@/app/features/overview/OverviewPage').then((module) => ({ default: module.OverviewPage }))),
	traffic: lazy(() => import('@/app/features/traffic/TrafficPage').then((module) => ({ default: module.TrafficPage }))),
	routes: lazy(() => import('@/app/features/routes/RoutesPage').then((module) => ({ default: module.RoutesPage }))),
	services: lazy(() => import('@/app/features/services/ServicesPage').then((module) => ({ default: module.ServicesPage }))),
	consumers: lazy(() => import('@/app/features/consumers/ConsumersPage').then((module) => ({ default: module.ConsumersPage }))),
	assistant: lazy(() => import('@/app/features/ai/AssistantPage').then((module) => ({ default: module.AssistantPage }))),
	ai: lazy(() => import('@/app/features/ai/AiAnalysesPage').then((module) => ({ default: module.AiAnalysesPage }))),
	settings: lazy(() => import('@/app/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage }))),
};

const PAGE_CHUNK_SKELETON_CARDS: readonly DashboardSkeletonCard[] = [
	{ name: 'page-chunk-chart-1', span: 3, title: '', content: 'line-chart' },
	{ name: 'page-chunk-chart-2', span: 3, title: '', content: 'line-chart' },
];

export function Dashboard(): ReactElement {
	return (
		<RealtimeProvider>
			<GatewayProvider>
				<Shell />
			</GatewayProvider>
		</RealtimeProvider>
	);
}

function PageChunkSkeleton({ pageId }: { readonly pageId: PageId }): ReactElement {
	return (
		<div className="page" data-page={pageId}>
			<DashboardSkeleton pageName={pageId} hasBannerFooter cards={PAGE_CHUNK_SKELETON_CARDS} />
		</div>
	);
}

function Shell(): ReactElement {
	const { isNavOpen, setIsNavOpen, activePage } = useGateway();
	// No sidebar badges yet: every page shows its own counts.
	const counts: SidebarCounts = {};

	const mountedPages = useMountedPages(activePage);

	useDocumentTitle(activePage);
	usePageArrival(activePage);

	useRealtimeReactions();

	function handleCloseNav(): void {
		setIsNavOpen(false);
	}

	return (
		<div className={`app-shell ${isNavOpen ? 'nav-open' : ''}`}>
			<div className="scrim" role="presentation" onClick={handleCloseNav} />
			<Sidebar counts={counts} />
			<div className="main">
				<Topbar />
				{mountedPages.map((pageId) => {
					const Page = PAGES[pageId];

					// A hidden Activity keeps the page's state but unmounts its effects, so
					// an inactive page stops fetching. The frame is what the page transition
					// animates (PageTransition.css).
					return (
						<Activity key={pageId} mode={pageId === activePage ? 'visible' : 'hidden'}>
							<div className="page-frame" data-page-frame={pageId}>
								<Suspense fallback={<PageChunkSkeleton pageId={pageId} />}>
									<Page />
								</Suspense>
							</div>
						</Activity>
					);
				})}
			</div>
			<Toasts />
			<TooltipLayer />
		</div>
	);
}
