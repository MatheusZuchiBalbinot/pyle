import { readBooleanEnv, readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

// Off unless enabled: a demo tool, never something a production gateway has.
type ChaosConfig = { readonly isAllowed: false } | { readonly isAllowed: true; readonly token: string };

const MIN_DEMO_CHAOS_TOKEN_LENGTH = 16;

export function getChaosConfig(): ChaosConfig {
	const isAllowed = readBooleanEnv('CHAOS_ALLOWED', false);

	if (!isAllowed) {
		return { isAllowed: false };
	}

	const token = readRequiredEnv('DEMO_CHAOS_TOKEN');

	if (token.length < MIN_DEMO_CHAOS_TOKEN_LENGTH) {
		throw new Error(`DEMO_CHAOS_TOKEN must be at least ${MIN_DEMO_CHAOS_TOKEN_LENGTH} characters when CHAOS_ALLOWED=true`);
	}

	return { isAllowed: true, token };
}
