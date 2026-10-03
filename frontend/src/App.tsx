import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactElement } from 'react';

import { AuthProvider } from './app/core/auth/AuthProvider';
import { queryClient } from './app/core/query/queryClient';
import { AuthGate } from './app/shell/AuthGate/AuthGate';

// Lazy, so the login page stays a small download.
const Dashboard = lazy(() => import('@/app/shell/Dashboard/Dashboard').then((module) => ({ default: module.Dashboard })));

export function App(): ReactElement {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<AuthGate>
					<Suspense fallback={null}>
						<Dashboard />
					</Suspense>
				</AuthGate>
			</AuthProvider>
		</QueryClientProvider>
	);
}
