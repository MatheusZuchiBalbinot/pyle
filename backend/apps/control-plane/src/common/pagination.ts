import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
const CURSOR_SEPARATOR = '|';
const CURSOR_FIELD_COUNT = 2;

// nextCursor is null on the last page; a keyset walk cannot know the total without
// counting.
export type Page<T> = {
	readonly items: readonly T[];
	readonly nextCursor: string | null;
};

// Keyset, not offset: rows keep arriving, and an offset would skip or repeat them. The id
// breaks timestamp ties.
export type Cursor = {
	readonly orderedAt: Date;
	readonly id: string;
};

export type PageRequest = {
	readonly cursor: Cursor | null;
	readonly limit: number;
};

export function encodeCursor(cursor: Cursor): string {
	return Buffer.from(`${cursor.orderedAt.toISOString()}${CURSOR_SEPARATOR}${cursor.id}`).toString('base64url');
}

// A malformed cursor is a bug or a probe; silently ignoring it would restart the walk.
export function decodeCursor(raw: string | undefined): Cursor | null {
	if (raw === undefined || raw === '') {
		return null;
	}

	const decoded = Buffer.from(raw, 'base64url').toString();
	const fields = decoded.split(CURSOR_SEPARATOR);

	if (fields.length !== CURSOR_FIELD_COUNT) {
		throw new BadRequestException('Malformed cursor');
	}

	const [timestamp, id] = fields;
	const orderedAt = new Date(timestamp);
	const isValid = !Number.isNaN(orderedAt.getTime()) && id.length > 0;

	if (!isValid) {
		throw new BadRequestException('Malformed cursor');
	}

	return { orderedAt, id };
}

export function resolveLimit(requested: number | undefined): number {
	if (requested === undefined) {
		return DEFAULT_PAGE_SIZE;
	}

	return Math.min(Math.max(requested, 1), MAX_PAGE_SIZE);
}

export function toPageRequest(query: { readonly cursor?: string; readonly limit?: number }): PageRequest {
	return { cursor: decodeCursor(query.cursor), limit: resolveLimit(query.limit) };
}

// The extra row only answers "is there more?", without a COUNT.
export function toPage<T>(rows: readonly T[], limit: number, toCursor: (row: T) => Cursor): Page<T> {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const lastItem = items.at(-1);

	if (!hasMore || lastItem === undefined) {
		return { items, nextCursor: null };
	}

	const lastCursor = toCursor(lastItem);

	return { items, nextCursor: encodeCursor(lastCursor) };
}

export function mapPage<T, R>(page: Page<T>, transform: (item: T) => R): Page<R> {
	return { items: page.items.map(transform), nextCursor: page.nextCursor };
}
