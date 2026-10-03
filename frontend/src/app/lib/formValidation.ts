// Each rule returns an i18n key, or null when the value is fine.

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

const INTEGER_PATTERN = /^\d+$/;

export type IntegerRange = { readonly min: number; readonly max: number };

// An empty field means "not set".
export function toOptionalInteger(text: string): number | null {
	const trimmed = text.trim();

	if (trimmed === '') {
		return null;
	}

	return Number(trimmed);
}

export function checkInteger(text: string, range: IntegerRange): string | null {
	const trimmed = text.trim();

	if (trimmed === '') {
		return 'common.validation.required';
	}

	if (!INTEGER_PATTERN.test(trimmed)) {
		return 'common.validation.integer';
	}

	const value = Number(trimmed);
	const isInRange = value >= range.min && value <= range.max;

	return isInRange ? null : 'common.validation.range';
}

export function checkOptionalInteger(text: string, range: IntegerRange): string | null {
	if (text.trim() === '') {
		return null;
	}

	return checkInteger(text, range);
}

export function checkLength(text: string, range: IntegerRange): string | null {
	const length = text.trim().length;

	if (length === 0) {
		return 'common.validation.required';
	}

	return length <= range.max && length >= range.min ? null : 'common.validation.length';
}

export function hasErrors<Field extends string>(errors: FieldErrors<Field>): boolean {
	return Object.values(errors).some((error) => error !== undefined);
}

// An edit sends only what changed.
export function changedFields<Values extends object>(current: Values, next: Values): Partial<Values> {
	const changes: Partial<Values> = {};

	for (const key of Object.keys(next) as (keyof Values)[]) {
		const isSame = JSON.stringify(current[key]) === JSON.stringify(next[key]);

		if (!isSame) {
			changes[key] = next[key];
		}
	}

	return changes;
}
