import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { toAiHttpError } from './ai-errors.js';
import { AiProviderAuthError, AiProviderRateLimitedError } from './ai-model-client.js';

describe('toAiHttpError', () => {
	it('answers a provider quota refusal with 429', () => {
		const mapped = toAiHttpError(new AiProviderRateLimitedError('slow down'));

		expect(mapped).toBeInstanceOf(HttpException);
		expect((mapped as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
	});

	it('answers a refused key with 503, naming the setting to fix and not the provider message', () => {
		const mapped = toAiHttpError(new AiProviderAuthError('API key is invalid.'));

		expect(mapped).toBeInstanceOf(ServiceUnavailableException);
		expect((mapped as HttpException).message).toContain('AI_API_KEY');
	});

	it('leaves any other error alone', () => {
		const error = new Error('boom');

		expect(toAiHttpError(error)).toBe(error);
	});
});
