// Apple keyboards label the command modifier ⌘; everywhere else the same
// shortcut is Ctrl. Read once from the UA hints — `navigator.platform` is
// deprecated but still the most reliable synchronous signal.
export function isApplePlatform(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}

	return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function formatCommandShortcut(key: string): string {
	const modifierLabel = isApplePlatform() ? '⌘' : 'Ctrl';

	return `${modifierLabel} ${key.toUpperCase()}`;
}
