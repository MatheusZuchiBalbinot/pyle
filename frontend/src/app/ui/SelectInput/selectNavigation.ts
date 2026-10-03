import { ARROW_DOWN_KEY, ARROW_UP_KEY, END_KEY, HOME_KEY } from '@/app/lib/keyboardKeys';

// The option index a navigation key moves to, or null when the key does not navigate.
export function navigatedIndex(key: string, currentIndex: number, optionCount: number): number | null {
	const lastIndex = optionCount - 1;

	if (key === ARROW_DOWN_KEY) {
		return Math.min(currentIndex + 1, lastIndex);
	}

	if (key === ARROW_UP_KEY) {
		return Math.max(currentIndex - 1, 0);
	}

	if (key === HOME_KEY) {
		return 0;
	}

	if (key === END_KEY) {
		return lastIndex;
	}

	return null;
}

// Typing a letter jumps to the next option that starts with it, wrapping around.
export function typeaheadIndex(character: string, currentIndex: number, labels: readonly string[]): number | null {
	const isPrintable = character.length === 1 && character.trim() !== '';

	if (!isPrintable) {
		return null;
	}

	const needle = character.toLocaleLowerCase();

	for (let offset = 1; offset <= labels.length; offset++) {
		const index = (currentIndex + offset) % labels.length;

		if (labels[index].toLocaleLowerCase().startsWith(needle)) {
			return index;
		}
	}

	return null;
}
