import type { ReactElement, ReactNode } from 'react';

import './DashboardCard.css';

export type DashboardCardSpan = 2 | 3 | 4 | 6;

// chart pads the body; table is flush so the header row runs edge to edge.
export type DashboardCardContent = 'chart' | 'table';

export type DashboardCardProps = {
	// Rendered as data-card: a stable handle for pointing at a card.
	readonly name: string;
	readonly span: DashboardCardSpan;
	readonly title: string;
	readonly note?: ReactNode;
	readonly content: DashboardCardContent;
	// Full-width cards cap their body and scroll inside, instead of pushing the page down.
	readonly isScrollable?: boolean;
	readonly children: ReactNode;
};

export function DashboardCard({ name, span, title, note, content, isScrollable = span === 6, children }: DashboardCardProps): ReactElement {
	const bodyClassName = `dashboard-card-body is-${content} ${isScrollable ? 'is-scrollable' : ''}`.trim();

	return (
		<div className={`card dashboard-card dashboard-span-${span}`} data-card={name}>
			<div className="card-header dashboard-card-header">
				<div className="card-title">{title}</div>
				{note !== undefined && <span className="panel-note">{note}</span>}
			</div>
			<div className={bodyClassName}>{children}</div>
		</div>
	);
}
