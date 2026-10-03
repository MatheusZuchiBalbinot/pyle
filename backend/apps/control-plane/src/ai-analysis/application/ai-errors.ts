import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import { AiNotConfiguredError, AiProviderAuthError, AiProviderRateLimitedError, type AiModelClient } from './ai-model-client.js';

const RATE_LIMITED_MESSAGE = 'The AI provider is rate limiting this control plane — wait a moment and try again';
const AUTH_REJECTED_MESSAGE = 'The AI provider rejected the API key: check AI_API_KEY on the control plane';

export function assertAiConfigured(modelClient: AiModelClient): void {
	try {
		modelClient.getModelId();
	} catch (error) {
		if (error instanceof AiNotConfiguredError) {
			throw new ServiceUnavailableException('AI is not configured on this control plane (AI_PROVIDER / AI_MODEL / AI_API_KEY)');
		}

		throw error;
	}
}

// Quota refusals travel as 429: the operator can act on them (wait). A refused key is a
// 503, like a missing one: the deployment has to change, not the request.
export function toAiHttpError(error: unknown): unknown {
	if (error instanceof AiProviderRateLimitedError) {
		return new HttpException(RATE_LIMITED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
	}

	if (error instanceof AiProviderAuthError) {
		return new ServiceUnavailableException(AUTH_REJECTED_MESSAGE);
	}

	return error;
}
