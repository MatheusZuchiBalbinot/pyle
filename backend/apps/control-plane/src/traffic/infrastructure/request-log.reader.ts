import { Injectable, Logger } from '@nestjs/common';

import { REQUEST_LOG_LIST } from '@pyle/shared/contracts/redis-keys.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';

// Entries fetched per LRANGE while filtering.
export const REQUEST_LOG_SCAN_PAGE = 200;

type RequestLogScan = {
	// Index in the list to start from (0 = newest).
	readonly startIndex: number;
	readonly limit: number;
	// Stop after looking at this many entries, matching or not.
	readonly maxScanned: number;
	readonly matches: (entry: RequestLogEntry) => boolean;
};

type RequestLogScanResult = {
	readonly entries: readonly RequestLogEntry[];
	// Where to continue, or null when the list (or the scan budget) ended.
	readonly nextIndex: number | null;
};

@Injectable()
export class RequestLogReader {
	private readonly logger = new Logger(RequestLogReader.name);

	constructor(private readonly redis: ControlPlaneRedisService) {}

	async scan(scan: RequestLogScan): Promise<RequestLogScanResult> {
		const entries: RequestLogEntry[] = [];
		let index = scan.startIndex;
		const scanEnd = scan.startIndex + scan.maxScanned;

		while (index < scanEnd) {
			const pageEnd = Math.min(index + REQUEST_LOG_SCAN_PAGE, scanEnd) - 1;
			const page = await this.redis.lrange(REQUEST_LOG_LIST, index, pageEnd);

			for (const [offset, raw] of page.entries()) {
				const entry = parseEntry(raw);

				if (entry === null) {
					this.logger.warn(`Ignoring a malformed request log entry at index ${index + offset}`);
				}

				if (entry === null || !scan.matches(entry)) {
					continue;
				}

				entries.push(entry);

				if (entries.length === scan.limit) {
					return { entries, nextIndex: index + offset + 1 };
				}
			}

			const isListEnd = page.length < pageEnd - index + 1;

			if (isListEnd) {
				return { entries, nextIndex: null };
			}

			index = pageEnd + 1;
		}

		return { entries, nextIndex: null };
	}
}

function parseEntry(raw: string): RequestLogEntry | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		const isEntry = typeof parsed === 'object' && parsed !== null && typeof (parsed as { readonly requestId?: unknown }).requestId === 'string';

		return isEntry ? (parsed as RequestLogEntry) : null;
	} catch {
		return null;
	}
}
