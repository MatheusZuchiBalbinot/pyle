import { useCallback, useState } from 'react';

export type RevealedKey = { readonly consumerName: string; readonly apiKey: string };

export type ApiKeyRevealState = {
	readonly revealed: RevealedKey | null;
	readonly reveal: (consumerName: string, apiKey: string) => void;
	// "Já guardei", or closing the dialog: the key is gone from memory.
	readonly acknowledge: () => void;
};

// Component state only (never context or storage), dropped on acknowledge or unmount.
export function useApiKeyReveal(): ApiKeyRevealState {
	const [revealed, setRevealed] = useState<RevealedKey | null>(null);
	const reveal = useCallback((consumerName: string, apiKey: string) => setRevealed({ consumerName, apiKey }), []);
	const acknowledge = useCallback(() => setRevealed(null), []);

	return { revealed, reveal, acknowledge };
}
