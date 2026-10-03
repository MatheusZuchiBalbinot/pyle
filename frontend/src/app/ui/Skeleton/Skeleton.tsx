import type { ReactElement } from 'react';

import './Skeleton.css';

export type SkeletonProps = {
	readonly width?: string;
	readonly height?: string;
	readonly className?: string;
};

export function Skeleton({ width = '100%', height = '14px', className = '' }: SkeletonProps): ReactElement {
	return <span className={`skeleton ${className}`.trim()} style={{ width, height }} />;
}
