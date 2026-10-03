import type { CSSProperties, ReactElement } from 'react';

import { toAvatarHue, toInitials } from './accountIdentity';

export type UserAvatarSize = 'small' | 'large';

export type UserAvatarProps = {
	readonly name: string;
	readonly email: string;
	readonly size: UserAvatarSize;
};

// No uploaded photos, and a silhouette would make every operator look the same.
export function UserAvatar({ name, email, size }: UserAvatarProps): ReactElement {
	const hueStyle = { '--avatar-hue': toAvatarHue(email) } as CSSProperties;

	return (
		<span className={`user-avatar is-${size}`} style={hueStyle} aria-hidden="true">
			{toInitials(name, email)}
		</span>
	);
}
