import { QueryClient } from '@tanstack/react-query';

import { AdminApiError } from '@/app/api/adminApiClient';

// Shown again without a request when a page comes back within this window;
// realtime events and polling refresh what changes in the meantime.
const STALE_TIME_MS = 5000;
const MAX_RETRIES = 1;
const FIRST_SERVER_ERROR_STATUS = 500;

// A 4xx will answer the same way again; a network blip or a 5xx gets one more try.
export function shouldRetry(failureCount: number, error: unknown): boolean {
	const isClientError = error instanceof AdminApiError && error.statusCode < FIRST_SERVER_ERROR_STATUS;

	if (isClientError) {
		return false;
	}

	return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
	// Focus refetches are off: the console is already live through realtime events.
	const defaultOptions = { queries: { staleTime: STALE_TIME_MS, retry: shouldRetry, refetchOnWindowFocus: false } };

	return new QueryClient({ defaultOptions });
}

// Tests: no retries and no cache kept between specs.
export function createTestQueryClient(): QueryClient {
	const defaultOptions = { queries: { retry: false, gcTime: 0, staleTime: 0 } };

	return new QueryClient({ defaultOptions });
}

// The app's one client; signing out clears it, so no data outlives the session.
export const queryClient = createQueryClient();
