const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;
const TARGET_TICK_COUNT = 4;

export function niceTicks(max: number, minStep = 0): readonly number[] {
	if (max <= 0) {
		return [0, minStep > 0 ? minStep : 1];
	}

	const roughStep = Math.max(max / TARGET_TICK_COUNT, minStep);
	const magnitude = 10 ** Math.floor(Math.log10(roughStep));
	const mantissa = NICE_STEP_MANTISSAS.find((candidate) => candidate * magnitude >= roughStep) ?? 10;
	const step = mantissa * magnitude;
	const tickCount = Math.ceil(max / step);

	return Array.from({ length: tickCount + 1 }, (_, index) => index * step);
}

export function scaleLinear(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): (value: number) => number {
	const domainSpan = domainMax - domainMin || 1;

	return (value) => rangeMin + ((value - domainMin) / domainSpan) * (rangeMax - rangeMin);
}
