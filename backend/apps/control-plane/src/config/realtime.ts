import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

export type RealtimeConfig = {
	// Where the backend reaches Centrifugo's HTTP API (publish).
	readonly apiUrl: string;
	// Where the console's browser opens its WebSocket.
	readonly publicWebSocketUrl: string;
	readonly apiKey: string;
	readonly tokenHmacSecret: string;
};

export function getRealtimeConfig(): RealtimeConfig {
	return {
		apiUrl: readRequiredEnv('CENTRIFUGO_URL'),
		publicWebSocketUrl: readRequiredEnv('CENTRIFUGO_PUBLIC_URL'),
		apiKey: readRequiredEnv('CENTRIFUGO_API_KEY'),
		tokenHmacSecret: readRequiredEnv('CENTRIFUGO_TOKEN_HMAC_SECRET'),
	};
}
