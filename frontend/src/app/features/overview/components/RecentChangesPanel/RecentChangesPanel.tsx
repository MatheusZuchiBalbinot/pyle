import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConfigChangeEvent } from '@/app/api/adminApiTypes';
import { configChangeSubject, describeConfigChange } from '@/app/lib/describeConfigChange';
import { formatRelativeTime } from '@/app/lib/relativeTime';

import './RecentChangesPanel.css';

export type RecentChangesPanelProps = { readonly changes: readonly ConfigChangeEvent[]; readonly nowMs: number };

export function RecentChangesPanel({ changes, nowMs }: RecentChangesPanelProps): ReactElement {
	const { t, i18n } = useTranslation();

	if (changes.length === 0) {
		return <div className="panel-empty">{t('overviewPage.changes.empty')}</div>;
	}

	function renderChange(change: ConfigChangeEvent): ReactElement {
		const subject = configChangeSubject(change, t);
		const description = describeConfigChange(change, t);

		return (
			<li key={change.id} className="changes-row">
				<span className={`changes-action is-${change.action}`}>{t(`overviewPage.changes.action.${change.action}`)}</span>
				<span className="changes-body">
					<span className="changes-heading">
						<span className="changes-entity">{t(`gateway.entityType.${change.entityType}`)}</span>
						{subject !== null && <span className="changes-subject">{subject}</span>}
					</span>
					{description !== null && <span className="changes-summary">{description}</span>}
				</span>
				<span className="changes-meta">
					{change.actorEmail ?? t('overviewPage.changes.system')} · {formatRelativeTime(change.occurredAt, nowMs, i18n.language)}
				</span>
			</li>
		);
	}

	return <ul className="changes-list">{changes.map(renderChange)}</ul>;
}
