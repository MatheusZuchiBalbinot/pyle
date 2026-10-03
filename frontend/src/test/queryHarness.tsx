import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestQueryClient } from '@/app/core/query/queryClient';

type QueryHarness = {
	readonly client: QueryClient;
	readonly wrapper: ({ children }: { children: ReactNode }) => ReactNode;
};

// A fresh client per harness: no cache shared between specs.
export function buildQueryHarness(): QueryHarness {
	const client = createTestQueryClient();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	}

	return { client, wrapper };
}
