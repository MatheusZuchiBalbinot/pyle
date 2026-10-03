import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, mapPage, MAX_PAGE_SIZE, resolveLimit, toPage } from './pagination.js';

const CURSOR = { orderedAt: new Date('2026-09-22T12:00:00.000Z'), id: 'row-7' };

type Row = { readonly id: string; readonly createdAt: Date };

function buildRows(count: number): readonly Row[] {
	return Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, createdAt: new Date(1_700_000_000_000 + index) }));
}

describe('cursors', () => {
	it('round-trips a cursor', () => {
		expect(decodeCursor(encodeCursor(CURSOR))).toEqual(CURSOR);
	});

	it('treats a missing cursor as "start from the beginning"', () => {
		expect(decodeCursor(undefined)).toBeNull();
		expect(decodeCursor('')).toBeNull();
	});

	// Silently restarting the walk would look like duplicated rows to the
	// caller, which is worse than an error.
	it.each([
		['not base64', '!!!!'],
		['missing the id', Buffer.from('2026-09-22T12:00:00.000Z').toString('base64url')],
		['an unparseable date', Buffer.from('not-a-date|row-7').toString('base64url')],
		['an empty id', Buffer.from('2026-09-22T12:00:00.000Z|').toString('base64url')],
	])('rejects a cursor that is %s', (_label, raw) => {
		expect(() => decodeCursor(raw)).toThrow(BadRequestException);
	});
});

describe('resolveLimit', () => {
	it('defaults, clamps to the maximum and refuses zero or negative pages', () => {
		expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
		expect(resolveLimit(10)).toBe(10);
		expect(resolveLimit(MAX_PAGE_SIZE + 500)).toBe(MAX_PAGE_SIZE);
		expect(resolveLimit(0)).toBe(1);
		expect(resolveLimit(-3)).toBe(1);
	});
});

describe('toPage', () => {
	it('returns a cursor only when the extra row proves there is more', () => {
		const limit = 3;
		const page = toPage(buildRows(limit + 1), limit, (row) => ({ orderedAt: row.createdAt, id: row.id }));

		expect(page.items).toHaveLength(limit);
		expect(page.nextCursor).not.toBeNull();
		expect(decodeCursor(page.nextCursor ?? undefined)).toEqual({ orderedAt: new Date(1_700_000_000_002), id: 'row-2' });
	});

	it('ends the walk when the page is not full', () => {
		const page = toPage(buildRows(2), 3, (row) => ({ orderedAt: row.createdAt, id: row.id }));

		expect(page.items).toHaveLength(2);
		expect(page.nextCursor).toBeNull();
	});

	it('handles an empty result', () => {
		expect(toPage([], 10, () => CURSOR)).toEqual({ items: [], nextCursor: null });
	});

	it('mapPage keeps the cursor while transforming the items', () => {
		const page = toPage(buildRows(4), 3, (row) => ({ orderedAt: row.createdAt, id: row.id }));

		const mapped = mapPage(page, (row) => row.id);

		expect(mapped.items).toEqual(['row-0', 'row-1', 'row-2']);
		expect(mapped.nextCursor).toBe(page.nextCursor);
	});
});
