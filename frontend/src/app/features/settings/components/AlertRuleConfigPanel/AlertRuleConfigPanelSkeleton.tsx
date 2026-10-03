import type { ReactElement } from 'react';

import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import './AlertRuleConfigPanel.css';

// One card per GatewayAlertKind.
const RULE_ROW_COUNT = 4;
const FIELD_COUNT = 2;

export function AlertRuleConfigPanelSkeleton(): ReactElement {
	return (
		<div className="alert-rules-grid" aria-busy="true">
			{Array.from({ length: RULE_ROW_COUNT }, (_, rowIndex) => (
				<article key={rowIndex} className="alert-rule-card">
					<header className="alert-rule-card-head">
						<Skeleton width="32px" height="32px" />
						<span className="alert-rule-card-title">
							<Skeleton width="120px" height="13px" />
							<Skeleton width="90%" height="12px" />
						</span>
						<Skeleton width="38px" height="22px" className="skeleton-pill" />
					</header>
					<div className="alert-rule-card-fields">
						{Array.from({ length: FIELD_COUNT }, (_, fieldIndex) => (
							<span key={fieldIndex} className="alert-rule-field-skeleton">
								<Skeleton width="70px" height="11px" />
								<Skeleton width="88px" height="32px" />
							</span>
						))}
						<span className="alert-rule-card-hint">
							<Skeleton width="60%" height="11px" />
						</span>
					</div>
					<footer className="alert-rule-card-foot">
						<Skeleton width="40px" height="11px" />
					</footer>
				</article>
			))}
		</div>
	);
}
