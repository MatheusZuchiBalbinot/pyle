export type EndLabelCandidate = {
	readonly seriesId: string;
	readonly y: number;
};

// Two end labels closer than this (the label's line height) would print
// on top of each other — "0%" and "0.019%" becoming "0%0019%".
const MIN_END_LABEL_GAP_PX = 12;

// Greedy in series order; markers and the tooltip still show every value.
export function pickVisibleEndLabels(candidates: readonly EndLabelCandidate[]): ReadonlySet<string> {
	const placedYs: number[] = [];
	const visible = new Set<string>();

	for (const candidate of candidates) {
		const isCrowded = placedYs.some((y) => Math.abs(y - candidate.y) < MIN_END_LABEL_GAP_PX);

		if (isCrowded) {
			continue;
		}

		placedYs.push(candidate.y);
		visible.add(candidate.seriesId);
	}

	return visible;
}
