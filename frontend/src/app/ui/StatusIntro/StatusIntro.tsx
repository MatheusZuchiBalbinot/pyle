import type { ReactElement, ReactNode } from 'react';

import './StatusIntro.css';

export type StatusIntroTone = 'healthy' | 'warning' | 'danger' | 'info';

export type StatusIntroLayout = 'banner' | 'tile';

export type StatusIntroProps = {
	readonly name: string;
	readonly tone: StatusIntroTone;
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
	// `tile` is the compact square variant for a bento grid — icon in the
	// corner and a headline figure instead of the pulsing signal ring.
	readonly layout?: StatusIntroLayout;
	readonly icon?: ReactNode;
	readonly figure?: ReactNode;
	// Banner only: a row under the description (status chips, a metric strip).
	readonly footer?: ReactNode;
};

export function StatusIntro({ name, tone, eyebrow, title, description, layout = 'banner', icon, figure, footer }: StatusIntroProps): ReactElement {
	const className = `status-intro status-intro-${tone} status-intro-${layout}`;

	if (layout === 'tile') {
		return (
			<div className={className} data-card={name}>
				<div className="status-intro-tile-head">
					<p className="status-intro-eyebrow">{eyebrow}</p>
					{icon && <span className="status-intro-icon">{icon}</span>}
				</div>
				{figure !== undefined && <div className="status-intro-figure">{figure}</div>}
				<h2>{title}</h2>
				<p className="muted">{description}</p>
			</div>
		);
	}

	return (
		<div className={className} data-card={name}>
			<div className="status-intro-signal" aria-hidden="true">
				{icon ?? (
					<span className="status-intro-ring">
						<span />
					</span>
				)}
			</div>
			<div className="status-intro-body">
				<p className="status-intro-eyebrow">{eyebrow}</p>
				<h2>{title}</h2>
				<p className="muted">{description}</p>
				{footer && <div className="status-intro-footer">{footer}</div>}
			</div>
		</div>
	);
}
