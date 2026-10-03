import { Activity, Route, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { PyleLogo } from '@/app/ui/PyleLogo/PyleLogo';

type BrandFeature = { readonly id: string; readonly icon: LucideIcon; readonly labelKey: string };

// A drawn wave, not data: the preview only hints at what the console looks like.
const PREVIEW_LINE = 'M0,62 C30,62 40,28 70,28 S110,58 140,52 S190,14 220,18 S270,48 300,40';
const PREVIEW_AREA = `${PREVIEW_LINE} L300,80 L0,80 Z`;

const BRAND_FEATURES: readonly BrandFeature[] = [
	{ id: 'routing', icon: Route, labelKey: 'login.brand.features.routing' },
	{ id: 'observability', icon: Activity, labelKey: 'login.brand.features.observability' },
	{ id: 'ai', icon: Sparkles, labelKey: 'login.brand.features.ai' },
];

export function LoginBrandPanel(): ReactElement {
	const { t } = useTranslation();

	return (
		<aside className="login-brand">
			<div className="login-brand-mark">
				<PyleLogo size={32} />
				<span>{t('login.brand.eyebrow')}</span>
			</div>
			<LoginPreview />
			<div className="login-brand-copy">
				<h2>{t('login.brand.headline')}</h2>
				<p>{t('login.brand.description')}</p>
			</div>
			<ul className="login-brand-features">
				{BRAND_FEATURES.map(({ id, icon: Icon, labelKey }) => (
					<li key={id}>
						<span className="login-brand-feature-icon">
							<Icon size={16} />
						</span>
						{t(labelKey)}
					</li>
				))}
			</ul>
		</aside>
	);
}

function LoginPreview(): ReactElement {
	const { t } = useTranslation();

	return (
		<div className="login-preview" aria-hidden="true">
			<div className="login-preview-head">
				<span className="login-preview-live">
					<span className="login-preview-dot" />
					{t('login.brand.previewLive')}
				</span>
				<span className="login-preview-label">{t('login.brand.previewLabel')}</span>
			</div>
			<svg className="login-preview-chart" viewBox="0 0 300 80" preserveAspectRatio="none">
				<defs>
					<linearGradient id="login-preview-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" className="login-preview-fill-top" />
						<stop offset="100%" className="login-preview-fill-bottom" />
					</linearGradient>
				</defs>
				<path d={PREVIEW_AREA} fill="url(#login-preview-fill)" />
				<path d={PREVIEW_LINE} className="login-preview-line" vectorEffect="non-scaling-stroke" />
			</svg>
			<div className="login-preview-bars">
				<span />
				<span />
				<span />
			</div>
		</div>
	);
}
