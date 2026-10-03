import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

export const AI_PROVIDERS = ['anthropic', 'groq'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

const DEFAULT_AI_PROVIDER: AiProvider = 'anthropic';

export function getAiProvider(): AiProvider {
	const raw = process.env.AI_PROVIDER ?? DEFAULT_AI_PROVIDER;

	if (!isAiProvider(raw)) {
		throw new Error(`Unsupported AI_PROVIDER "${raw}" — supported: ${AI_PROVIDERS.join(', ')}`);
	}

	return raw;
}

// Read on first use: a control plane that never analyzes needs no model configured.
export function getAiModelId(): string {
	return readRequiredEnv('AI_MODEL');
}

export function getAiApiKey(): string {
	return readRequiredEnv('AI_API_KEY');
}

function isAiProvider(value: string): value is AiProvider {
	return (AI_PROVIDERS as readonly string[]).includes(value);
}
