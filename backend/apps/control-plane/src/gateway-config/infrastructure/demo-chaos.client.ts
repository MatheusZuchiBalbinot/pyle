import { Injectable, Optional } from '@nestjs/common';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { ChaosInstanceUnreachableError } from '../domain/config-errors.js';

const CHAOS_PATH = '/__chaos';
const CHAOS_TOKEN_HEADER = 'x-chaos-token';
const CHAOS_REQUEST_TIMEOUT_MS = 2000;

export type FetchFunction = typeof fetch;

type ApplyChaosInput = {
	readonly instanceUrl: string;
	readonly token: string;
	readonly chaos: ChaosState;
};

// The token keeps anyone who reaches the instance from injecting faults.
@Injectable()
export class DemoChaosClient {
	private readonly fetchFunction: FetchFunction;

	constructor(@Optional() fetchFunction?: FetchFunction) {
		this.fetchFunction = fetchFunction ?? fetch;
	}

	async apply(input: ApplyChaosInput): Promise<void> {
		const init: RequestInit = {
			method: 'PUT',
			headers: { 'content-type': 'application/json', [CHAOS_TOKEN_HEADER]: input.token },
			body: JSON.stringify(input.chaos),
			signal: AbortSignal.timeout(CHAOS_REQUEST_TIMEOUT_MS),
		};
		const response = await this.send(`${input.instanceUrl}${CHAOS_PATH}`, init);

		if (!response.ok) {
			throw new ChaosInstanceUnreachableError(`The instance refused the chaos request (HTTP ${response.status})`);
		}
	}

	private async send(url: string, init: RequestInit): Promise<Response> {
		try {
			return await this.fetchFunction(url, init);
		} catch (error) {
			throw new ChaosInstanceUnreachableError(`The instance did not answer the chaos request: ${toErrorMessage(error)}`);
		}
	}
}
