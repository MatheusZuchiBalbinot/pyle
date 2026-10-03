import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import { SLUG_PATTERN } from '../../../../common/slug.js';
import type { ConsumersService } from '../../../../gateway-config/application/consumers.service.js';
import { ConfigNotFoundError } from '../../../../gateway-config/domain/config-errors.js';
import { checkChanged, checkRange, RANGES } from '../validate-proposal.js';
import { readRequiredNumber, type ProposalSpec, type ProposalToolDependencies } from './shared.js';

export function consumerSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { consumers } = dependencies;

	return [
		{
			name: 'propose_consumer_rate_limit',
			description: "Proposes a consumer's limit (requests per minute across all routes, 1-1000000).",
			properties: {
				consumerSlug: { type: 'string' },
				rateLimitPerMinute: { type: 'integer', minimum: RANGES.consumerRateLimit.min, maximum: RANGES.consumerRateLimit.max },
			},
			required: ['consumerSlug', 'rateLimitPerMinute'],
			build: async (input, reason) => {
				const rateLimitPerMinute = readRequiredNumber(input, 'rateLimitPerMinute');
				const consumer = await consumers.get(readRequiredString(input, 'consumerSlug'));
				const problem =
					checkRange('rateLimitPerMinute', rateLimitPerMinute, RANGES.consumerRateLimit) ??
					checkChanged(`the limit of ${consumer.slug}`, consumer.rateLimitPerMinute, rateLimitPerMinute);

				return problem ?? { type: 'set_consumer_rate_limit', consumerSlug: consumer.slug, consumerName: consumer.name, rateLimitPerMinute, reason };
			},
		},
		{
			name: 'propose_revoke_api_key',
			description:
				'Proposes revoking one active API key of a consumer, named by its prefix (from get_consumer_usage). Requests with it get 401 at once.',
			properties: { consumerSlug: { type: 'string' }, keyPrefix: { type: 'string' } },
			required: ['consumerSlug', 'keyPrefix'],
			build: async (input, reason) => {
				const consumer = await consumers.get(readRequiredString(input, 'consumerSlug'));
				const keyPrefix = readRequiredString(input, 'keyPrefix');
				const key = consumer.apiKeys.find((candidate) => candidate.revokedAt === null && candidate.keyPrefix === keyPrefix);

				if (!key) {
					return `${consumer.slug} has no active key with prefix ${keyPrefix}`;
				}

				return { type: 'revoke_api_key', consumerSlug: consumer.slug, keyId: key.id, keyPrefix: key.keyPrefix, reason };
			},
		},
		{
			name: 'propose_create_consumer',
			description: 'Proposes a new consumer with access to every route; its first API key is shown once to the operator.',
			properties: {
				slug: { type: 'string', description: 'lowercase letters, digits and hyphens' },
				name: { type: 'string' },
				rateLimitPerMinute: { type: 'integer', minimum: RANGES.consumerRateLimit.min, maximum: RANGES.consumerRateLimit.max },
			},
			required: ['slug', 'name', 'rateLimitPerMinute'],
			build: async (input, reason) => {
				const slug = readRequiredString(input, 'slug');

				if (!SLUG_PATTERN.test(slug)) {
					return `${slug} is not a valid slug (lowercase letters, digits, single hyphens)`;
				}

				const rateLimitPerMinute = readRequiredNumber(input, 'rateLimitPerMinute');
				const rangeError = checkRange('rateLimitPerMinute', rateLimitPerMinute, RANGES.consumerRateLimit);

				if (rangeError) {
					return rangeError;
				}

				if (await isConsumerSlugTaken(consumers, slug)) {
					return `a consumer ${slug} already exists`;
				}

				return { type: 'create_consumer', slug, name: readRequiredString(input, 'name'), rateLimitPerMinute, reason };
			},
		},
	];
}

async function isConsumerSlugTaken(consumers: ConsumersService, slug: string): Promise<boolean> {
	try {
		await consumers.get(slug);

		return true;
	} catch (error) {
		if (error instanceof ConfigNotFoundError) {
			return false;
		}

		throw error;
	}
}
