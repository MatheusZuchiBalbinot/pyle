import type { ReactElement, ReactNode } from 'react';

import './PageHeader.css';

export type PageHeaderProps = {
	readonly title: string;
	readonly desc?: string;
	readonly children?: ReactNode;
};

export function PageHeader({ title, desc, children }: PageHeaderProps): ReactElement {
	return (
		<header className="page-header">
			<div>
				<h1 className="page-title">{title}</h1>
				{desc && <p className="page-desc">{desc}</p>}
			</div>
			{children && <div className="page-actions">{children}</div>}
		</header>
	);
}
