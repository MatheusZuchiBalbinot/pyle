const WHOLE = 100;

// Fractions as whole percents that add up to exactly 100 (largest
// remainder): 1/3 each reads 34/33/33, never 33/33/33. All zero stays zero.
export function toSharePercents(fractions: readonly number[]): readonly number[] {
	const total = fractions.reduce((sum, fraction) => sum + fraction, 0);

	if (total <= 0) {
		return fractions.map(() => 0);
	}

	const exact = fractions.map((fraction) => (fraction / total) * WHOLE);
	const floors = exact.map(Math.floor);
	let missing = WHOLE - floors.reduce((sum, value) => sum + value, 0);
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - floors[index] }))
		.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
	const result = [...floors];

	for (const { index } of byRemainder) {
		if (missing === 0) {
			break;
		}

		result[index] += 1;
		missing -= 1;
	}

	return result;
}
