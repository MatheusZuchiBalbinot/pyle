import { useId, type ReactElement } from 'react';

type PyleLogoProps = {
	readonly size?: number;
	readonly className?: string;
};

const VIEWBOX_SIZE = 32;
const DEFAULT_SIZE = 30;

export function PyleLogo({ size = DEFAULT_SIZE, className }: PyleLogoProps): ReactElement {
	const gradientId = useId();

	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
			role="img"
			aria-label="Pyle"
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#4cc2e0" />
					<stop offset="1" stopColor="#4b62e6" />
				</linearGradient>
			</defs>
			<rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} rx="8" fill={`url(#${gradientId})`} />
			<g fill="none" stroke="#0b1220" strokeWidth="5" strokeLinecap="round">
				<path d="M10.5 26V9.5" />
				<path d="M10.5 9.5h8a4.5 4.5 0 0 1 0 9h-8" />
			</g>
			<circle cx="23" cy="23.5" r="2.5" fill="#f4f8ff" />
		</svg>
	);
}
