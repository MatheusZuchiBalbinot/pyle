type RuntimeConfig = { readonly adminApiBaseUrl?: string };

type ConfiguredWindow = Window & { readonly __PYLE_CONFIG__?: RuntimeConfig };

const DEFAULT_ADMIN_API_BASE_URL = 'http://localhost:3000';

// In order: the container's /config.js (one build serves any deployment), Vite's build-time
// variable, then the dev default.
export function getAdminApiBaseUrl(): string {
	const runtimeBaseUrl = (globalThis as unknown as ConfiguredWindow).__PYLE_CONFIG__?.adminApiBaseUrl;

	return runtimeBaseUrl ?? import.meta.env.VITE_ADMIN_API_BASE_URL ?? DEFAULT_ADMIN_API_BASE_URL;
}
