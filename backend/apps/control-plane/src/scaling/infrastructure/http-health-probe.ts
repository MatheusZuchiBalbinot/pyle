import { setTimeout as sleep } from 'node:timers/promises';

import { InstanceHealthProbe } from '../application/scaling-ports.js';

const RETRY_DELAY_MS = 500;
const ATTEMPT_TIMEOUT_MS = 2000;

type Fetch = (url: string, init: { readonly signal: AbortSignal }) => Promise<{ readonly ok: boolean }>;

export class HttpHealthProbe extends InstanceHealthProbe {
	constructor(
		private readonly fetchUrl: Fetch = fetch,
		private readonly now: () => number = Date.now,
	) {
		super();
	}

	async waitUntilHealthy(url: string, timeoutMs: number): Promise<boolean> {
		const deadline = this.now() + timeoutMs;

		while (this.now() < deadline) {
			if (await this.isHealthy(url)) {
				return true;
			}

			await sleep(RETRY_DELAY_MS);
		}

		return false;
	}

	private async isHealthy(url: string): Promise<boolean> {
		try {
			const response = await this.fetchUrl(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });

			return response.ok;
		} catch {
			// Not listening yet: the next attempt will tell.
			return false;
		}
	}
}
