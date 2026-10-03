import type { AdminUserView } from '../../application/admin-session.service.js';

export class AdminUserDto implements AdminUserView {
	readonly id!: string;
	readonly email!: string;
	readonly name!: string;
	readonly lastLoginAt!: string | null;
}

// The refresh token travels in an httpOnly cookie, never in this body.
export class LoggedInResponse {
	readonly accessToken!: string;
	readonly expiresAt!: string;
	readonly user!: AdminUserDto;
}
