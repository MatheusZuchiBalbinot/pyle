import { vi } from 'vitest';

import '@testing-library/react';

// A spec that forgets its fetch stub fails instead of making a real request.
globalThis.fetch = (() => {
	throw new Error('fetch was called without a stub — install one in the test');
}) as typeof fetch;

// t returns the key, so assertions name the message.
vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR', changeLanguage: () => Promise.resolve() } }),
	Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
	initReactI18next: { type: '3rdParty', init: () => undefined },
}));
