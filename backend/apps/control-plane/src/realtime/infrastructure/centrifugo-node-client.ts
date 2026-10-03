import { Injectable } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

const REQUEST_TIMEOUT_MS = 3_000;

export type CentrifugoNode = {
	readonly apiUrl: string;
	readonly apiKey: string;
};

type ApiResponse<TResult> = { readonly result?: TResult; readonly error?: { readonly code: number; readonly message: string } };

export class CentrifugoApiError extends Error {}

@Injectable()
export class CentrifugoNodeClient {
	async publish(node: CentrifugoNode, channel: string, data: unknown): Promise<void> {
		await this.call(node, 'publish', { channel, data });
	}

	private async call<TResult>(node: CentrifugoNode, method: string, params: unknown): Promise<TResult> {
		let response: Response;

		try {
			response = await fetch(`${node.apiUrl}/api/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-API-Key': node.apiKey },
				body: JSON.stringify(params),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			throw new CentrifugoApiError(`Centrifugo ${method} at ${node.apiUrl} failed: ${toErrorMessage(error)}`);
		}

		// A non-JSON body reads as empty: the status check below still rejects.
		const payload = (await response.json().catch(() => ({}))) as ApiResponse<TResult>;
		const isRejected = !response.ok || payload.error !== undefined;

		if (isRejected) {
			throw new CentrifugoApiError(`Centrifugo ${method} at ${node.apiUrl} rejected: ${payload.error?.message ?? response.status}`);
		}

		return payload.result as TResult;
	}
}
