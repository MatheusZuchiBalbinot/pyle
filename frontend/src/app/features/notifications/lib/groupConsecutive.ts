export type ConsecutiveGroup<T> = { readonly first: T; readonly items: readonly T[] };

// Neighbours with the same key fold into one group; the same key further down starts a new
// one, so the list keeps its order (newest first) and an older repeat stays where it was.
export function groupConsecutive<T>(items: readonly T[], keyOf: (item: T) => string): readonly ConsecutiveGroup<T>[] {
	const groups: ConsecutiveGroup<T>[] = [];
	let lastKey: string | null = null;

	for (const item of items) {
		const key = keyOf(item);
		const last = groups.at(-1);

		if (last !== undefined && key === lastKey) {
			groups[groups.length - 1] = { first: last.first, items: [...last.items, item] };
			continue;
		}

		groups.push({ first: item, items: [item] });
		lastKey = key;
	}

	return groups;
}
