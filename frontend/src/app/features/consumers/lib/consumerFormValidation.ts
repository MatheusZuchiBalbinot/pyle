import type { Consumer } from '@/app/api/adminApiTypes';
import { checkInteger, checkLength, type FieldErrors } from '@/app/lib/formValidation';
import { checkSlug } from '@/app/lib/slug';

// Mirror of the consumer DTO.
const NAME_LENGTH = { min: 1, max: 100 };
const RATE_LIMIT_RANGE = { min: 1, max: 1_000_000 };
const DEFAULT_RATE_LIMIT = '600';

export type ConsumerFormValues = {
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute: string;
	// Empty: every route.
	readonly routeIds: readonly string[];
};

export const EMPTY_CONSUMER_FORM: ConsumerFormValues = { slug: '', name: '', rateLimitPerMinute: DEFAULT_RATE_LIMIT, routeIds: [] };

export function consumerToFormValues(consumer: Consumer): ConsumerFormValues {
	return {
		slug: consumer.slug,
		name: consumer.name,
		rateLimitPerMinute: String(consumer.rateLimitPerMinute),
		routeIds: consumer.allowedRoutes.map((route) => route.id),
	};
}

export function validateConsumerForm(values: ConsumerFormValues): FieldErrors<keyof ConsumerFormValues> {
	return {
		slug: checkSlug(values.slug) ?? undefined,
		name: checkLength(values.name, NAME_LENGTH) ?? undefined,
		rateLimitPerMinute: checkInteger(values.rateLimitPerMinute, RATE_LIMIT_RANGE) ?? undefined,
	};
}
