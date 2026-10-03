import { useQuery, useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, restoreApiKey, revokeApiKey } from '@/app/api/adminApiClient';
import type { ApiKey, Consumer } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useApiKeyRevocation } from './useApiKeyRevocation';

vi.mock('../../../api/adminApiClient', () => ({
	revokeApiKey: vi.fn(),
	restoreApiKey: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const KEY: ApiKey = { id: 'k1', keyPrefix: 'pyle_live_ab', label: null, createdAt: '', lastUsedAt: null, revokedAt: null };
const CONSUMER: Consumer = {
	id: 'c1',
	slug: 'web-app',
	name: 'Web app',
	rateLimitPerMinute: 600,
	allowedRoutes: [],
	apiKeys: [KEY],
	createdAt: '',
	updatedAt: '',
};

function render() {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	// The list as the server has it, read by a live query like the Consumers page's.
	const server = { revokedAt: null as string | null };

	function readServer(): Promise<readonly Consumer[]> {
		return Promise.resolve([{ ...CONSUMER, apiKeys: [{ ...KEY, revokedAt: server.revokedAt }] }]);
	}

	function useScenario() {
		useQuery({ queryKey: queryKeys.configList('consumers'), queryFn: readServer });

		return { revocation: useApiKeyRevocation(CONSUMER), client: useQueryClient() };
	}

	const rendered = renderHook(useScenario, { wrapper });

	return { ...rendered, gateway, server };
}

function cachedRevokedAt(client: ReturnType<typeof useQueryClient>): string | null | undefined {
	return client.getQueryData<readonly Consumer[]>(queryKeys.configList('consumers'))?.[0].apiKeys[0].revokedAt;
}

describe('useApiKeyRevocation', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('shows the key revoked at once, and offers to undo it from the toast', async () => {
		let finishRevoke: () => void = () => undefined;

		const { result, gateway, server } = render();
		let revoking: Promise<void> = Promise.resolve();

		vi.mocked(revokeApiKey).mockReturnValue(
			new Promise<void>((resolve) => {
				finishRevoke = () => {
					server.revokedAt = '2026-10-02T12:00:00.000Z';
					resolve();
				};
			}),
		);
		vi.mocked(restoreApiKey).mockImplementation(async () => {
			server.revokedAt = null;
		});
		await waitFor(() => expect(cachedRevokedAt(result.current.client)).toBeNull());

		act(() => {
			revoking = result.current.revocation.revoke(KEY);
		});
		await waitFor(() => expect(cachedRevokedAt(result.current.client)).not.toBeNull());

		finishRevoke();
		await act(() => revoking);
		const [toast] = gateway.toasts();

		expect(toast).toMatchObject({ message: 'consumers.revoke.done', action: { label: 'toasts.undo' } });

		act(() => toast.action?.onAct());

		await waitFor(() => expect(restoreApiKey).toHaveBeenCalledWith('web-app', 'k1'));
		await waitFor(() => expect(cachedRevokedAt(result.current.client)).toBeNull());
	});

	it('puts the key back and says why when the revocation fails, without an undo toast', async () => {
		vi.mocked(revokeApiKey).mockRejectedValue(new AdminApiError('gone', 404));
		const { result, gateway } = render();

		await waitFor(() => expect(cachedRevokedAt(result.current.client)).toBeNull());
		await act(() => result.current.revocation.revoke(KEY));

		expect(cachedRevokedAt(result.current.client)).toBeNull();
		expect(gateway.toasts()).toEqual([{ message: 'gone', tone: 'danger' }]);
	});

	it('reports a restore refused by the server (the window passed) and keeps the key revoked', async () => {
		vi.mocked(revokeApiKey).mockResolvedValue(undefined);
		vi.mocked(restoreApiKey).mockRejectedValue(new AdminApiError('revoked more than 60 s ago', 409));
		const { result, gateway } = render();

		await act(() => result.current.revocation.revoke(KEY));
		act(() => gateway.toasts()[0].action?.onAct());

		await waitFor(() => expect(gateway.toasts().at(-1)).toEqual({ message: 'revoked more than 60 s ago', tone: 'danger' }));
	});
});
