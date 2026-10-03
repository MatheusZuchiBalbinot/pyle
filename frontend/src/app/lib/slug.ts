// Mirrors the backend's slug rule.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 63;

export function checkSlug(value: string): string | null {
	const trimmed = value.trim();

	if (trimmed === '') {
		return 'common.validation.required';
	}

	const isValid = trimmed.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(trimmed);

	return isValid ? null : 'common.validation.slug';
}
