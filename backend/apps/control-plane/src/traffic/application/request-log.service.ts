import { BadRequestException, Injectable } from '@nestjs/common';

import { readGatewayConfig } from '@pyle/shared/config/gateway.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { resolveLimit, type Page } from '../../common/pagination.js';
import { RequestLogReader } from '../infrastructure/request-log.reader.js';

export const STATUS_CLASS_NAMES = ['2xx', '3xx', '4xx', '5xx'] as const;
export type StatusClassName = (typeof STATUS_CLASS_NAMES)[number];

const STATUS_CLASS_SIZE = 100;

type RequestLogFilter = {
	readonly routeId?: string;
	readonly consumerId?: string;
	readonly instanceId?: string;
	readonly statusClass?: StatusClassName;
};

type RequestLogQuery = RequestLogFilter & {
	readonly cursor?: string;
	readonly limit?: number;
};

// A filter that matches little scans the list at most once.
@Injectable()
export class RequestLogService {
	constructor(private readonly reader: RequestLogReader) {}

	async list(query: RequestLogQuery): Promise<Page<RequestLogEntry>> {
		const startIndex = parseCursor(query.cursor);
		const maxScanned = readGatewayConfig().requestLogMaxEntries;
		const scan = { startIndex, limit: resolveLimit(query.limit), maxScanned, matches: (entry: RequestLogEntry) => matchesFilter(entry, query) };
		const result = await this.reader.scan(scan);

		return { items: result.entries, nextCursor: result.nextIndex === null ? null : String(result.nextIndex) };
	}
}

function statusClassOf(status: number): string {
	return `${Math.floor(status / STATUS_CLASS_SIZE)}xx`;
}

function matchesFilter(entry: RequestLogEntry, filter: RequestLogFilter): boolean {
	const isRouteMatch = filter.routeId === undefined || entry.routeId === filter.routeId;

	if (!isRouteMatch) {
		return false;
	}

	const isConsumerMatch = filter.consumerId === undefined || entry.consumerId === filter.consumerId;

	if (!isConsumerMatch) {
		return false;
	}

	const isInstanceMatch = filter.instanceId === undefined || entry.instanceId === filter.instanceId;

	if (!isInstanceMatch) {
		return false;
	}

	const isStatusMatch = filter.statusClass === undefined || statusClassOf(entry.status) === filter.statusClass;

	return isStatusMatch;
}

// The cursor is the list index where the previous page stopped: the list
// only grows at the head, so an index drifts by what arrived since, which
// is fine for a sampled live log.
function parseCursor(cursor: string | undefined): number {
	if (cursor === undefined || cursor === '') {
		return 0;
	}

	const index = Number(cursor);

	if (!Number.isSafeInteger(index) || index < 0) {
		throw new BadRequestException('Malformed cursor');
	}

	return index;
}
