import type { CreateInstanceInput } from '@/app/api/adminApiTypes';
import { checkInteger, type FieldErrors } from '@/app/lib/formValidation';
import { checkSlug } from '@/app/lib/slug';

export type InstanceFormValues = { readonly name: string; readonly url: string; readonly weight: string };

const WEIGHT_RANGE = { min: 1, max: 100 };
const MAX_URL_LENGTH = 2048;
const HTTP_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export const EMPTY_INSTANCE_FORM: InstanceFormValues = { name: '', url: 'http://', weight: '1' };

// Mirrors the backend's upstream URL rules.
export function checkUpstreamUrl(raw: string): string | null {
	const trimmed = raw.trim();

	if (trimmed === '' || trimmed === 'http://') {
		return 'common.validation.required';
	}

	let url: URL;

	try {
		url = new URL(trimmed);
	} catch {
		return 'services.instanceForm.errors.url';
	}

	const hasExtras = url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '';
	const isValid = HTTP_PROTOCOLS.has(url.protocol) && url.hostname !== '' && !hasExtras && trimmed.length <= MAX_URL_LENGTH;

	return isValid ? null : 'services.instanceForm.errors.url';
}

export function validateInstanceForm(values: InstanceFormValues): FieldErrors<keyof InstanceFormValues> {
	return {
		name: checkSlug(values.name) ?? undefined,
		url: checkUpstreamUrl(values.url) ?? undefined,
		weight: checkInteger(values.weight, WEIGHT_RANGE) ?? undefined,
	};
}

export function toInstanceInput(values: InstanceFormValues): CreateInstanceInput {
	return { name: values.name.trim(), url: values.url.trim().replace(/\/+$/, ''), weight: Number(values.weight) };
}
