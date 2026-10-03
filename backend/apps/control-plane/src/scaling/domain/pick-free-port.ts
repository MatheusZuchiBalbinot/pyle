type PortRange = { readonly min: number; readonly max: number };

// The lowest port of the range nobody uses, or null when it is full.
export function pickFreePort(usedPorts: ReadonlySet<number>, range: PortRange): number | null {
	for (let port = range.min; port <= range.max; port++) {
		if (!usedPorts.has(port)) {
			return port;
		}
	}

	return null;
}
