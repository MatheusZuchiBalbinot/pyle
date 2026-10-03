import type { ReactElement } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';

import './StatusIntro.css';

export type StatusIntroSkeletonProps = {
	readonly name: string;
	readonly layout: 'banner' | 'tile';
	// Banner only: reserve the footer strip (status chips) so the banner is
	// as tall as the loaded one — pass it when the real banner has a footer.
	readonly hasFooter?: boolean;
};

const FOOTER_CHIP_COUNT = 3;

// Uses the component's own elements, so it is exactly as tall as the loaded one.
export function StatusIntroSkeleton({ name, layout, hasFooter = false }: StatusIntroSkeletonProps): ReactElement {
	if (layout === 'tile') {
		return (
			<div className="status-intro status-intro-info status-intro-tile" data-card={name} aria-busy="true">
				<div className="status-intro-tile-head">
					<p className="status-intro-eyebrow">
						<Skeleton width="90px" height="10px" />
					</p>
					<span className="status-intro-icon">
						<Skeleton width="16px" height="16px" />
					</span>
				</div>
				<div className="status-intro-figure">
					<Skeleton width="56px" height="30px" />
				</div>
				{/* Two lines each: at the tiles' width the loaded title and
				    description regularly wrap, and the hero row is as tall as its
				    tallest tile — reserving one line here would make the whole
				    row grow ~40px when the data lands. */}
				<h2 className="status-intro-skeleton-lines">
					<Skeleton width="80%" height="14px" />
					<Skeleton width="45%" height="14px" />
				</h2>
				<p className="muted status-intro-skeleton-lines">
					<Skeleton width="90%" height="12px" />
					<Skeleton width="60%" height="12px" />
				</p>
			</div>
		);
	}

	return (
		<div className="status-intro status-intro-info status-intro-banner" data-card={name} aria-busy="true">
			<div className="status-intro-signal" aria-hidden="true">
				<span className="status-intro-ring">
					<span />
				</span>
			</div>
			<div className="status-intro-body">
				<p className="status-intro-eyebrow">
					<Skeleton width="120px" height="10px" />
				</p>
				<h2>
					<Skeleton width="260px" height="17px" />
				</h2>
				<p className="muted">
					<Skeleton width="320px" height="13px" />
				</p>
				{hasFooter && (
					<div className="status-intro-footer">
						{Array.from({ length: FOOTER_CHIP_COUNT }, (_, index) => (
							<span key={index} className="status-intro-footer-item">
								<span className="badge badge-muted">
									<Skeleton width="56px" height="10px" />
								</span>
								<Skeleton width="60px" height="12px" />
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
