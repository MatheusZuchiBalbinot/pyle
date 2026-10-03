// nextCursor is null on the last page.
export type Page<T> = {
	readonly items: readonly T[];
	readonly nextCursor: string | null;
};

export type PageQuery = {
	readonly cursor?: string;
	readonly limit?: number;
};

export type AdminUser = {
	readonly id: string;
	readonly email: string;
	readonly name: string;
	readonly lastLoginAt: string | null;
};
